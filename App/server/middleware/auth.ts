// Verificación del token de Supabase y resolución de roles desde `profiles`.
// La autorización real vive acá; el frontend solo oculta botones.
import type { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { config, VALID_ROLES, type AppRole } from '../core/config';
import { db, getUserFromToken } from '../core/supabase';
import { logger } from '../utils/logger';
import { consumePendingGrant } from '../modules/users/pending-role-grants';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  roles: AppRole[];
  role: AppRole | null;
}

// Extiende Request para llevar el usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const isValidRole = (r: unknown): r is AppRole => VALID_ROLES.includes(r as AppRole);

export function primaryRole(roles: AppRole[]): AppRole | null {
  return config.rolePriority.find((r) => roles.includes(r)) || roles[0] || null;
}

const profileCache = new Map<string, { data: any; cachedAt: number }>();

/** Quien escribe en `profiles` invalida la caché de 30 s, para que /auth/me no devuelva el dato viejo. */
export function invalidateProfileCache(uid: string) {
  profileCache.delete(uid);
}

// `last_login` sirve para detectar cuentas inactivas: refrescarlo cada 15 min alcanza.
const LAST_LOGIN_THROTTLE_MS = 15 * 60_000;

/**
 * Sin await: es telemetría y no debe sumar latencia a cada petición. Si falla, se ignora.
 * Actualiza el perfil cacheado para no volver a escribir dentro de la ventana.
 */
function touchLastLogin(uid: string, profile: { last_login?: string | null } | null) {
  if (!profile) return;

  const previous = profile.last_login ? Date.parse(profile.last_login) : 0;
  if (Number.isFinite(previous) && Date.now() - previous < LAST_LOGIN_THROTTLE_MS) return;

  const nowIso = new Date().toISOString();
  profile.last_login = nowIso;
  void db
    .from('profiles')
    .update({ last_login: nowIso })
    .eq('id', uid)
    .then(({ error }) => {
      if (error) logger.warn('[last_login] No se pudo registrar la última conexión', { message: error.message });
    });
}

// Lee el perfil y lo crea en el primer login. Si la lectura falla devuelve null en vez de romper.
async function fetchProfile(supaUser: any) {
  const now = Date.now();
  const cached = profileCache.get(supaUser.id);
  if (cached && now - cached.cachedAt < 30_000) {
    touchLastLogin(supaUser.id, cached.data);
    return cached.data;
  }

  try {
    const { data, error } = await db
      .from('profiles')
      .select('roles, status, deleted_at, name, avatar_url, last_login')
      .eq('id', supaUser.id)
      .maybeSingle();
      
    if (error) return null;
    if (data) {
      profileCache.set(supaUser.id, { data, cachedAt: now });
      touchLastLogin(supaUser.id, data);
      return data;
    }

    // La foto no se hereda de Microsoft (fallaba de formas que el usuario no podía resolver):
    // cada persona la sube desde «Mi perfil».
    const meta = supaUser.user_metadata || {};
    const name = meta.name || meta.full_name || 'Nuevo Usuario';

    const { data: newProfile, error: insertError } = await db
      .from('profiles')
      .insert({
        id: supaUser.id,
        email: supaUser.email,
        name,
        avatar_url: '',
      })
      .select('roles, status, deleted_at, name, avatar_url, last_login')
      .single();

    if (insertError) return null;

    // Primer login: aplica el rol que un admin reservó en Personal antes de que la persona existiera.
    // Sin esto el perfil nace sin roles y no entra.
    const email = (supaUser.email || '').toLowerCase();
    let profile = newProfile;
    try {
      const grantedRoles = await consumePendingGrant(email);
      if (grantedRoles && grantedRoles.length) {
        const { data: updated, error: updateError } = await db
          .from('profiles')
          .update({ roles: grantedRoles })
          .eq('id', supaUser.id)
          .select('roles, status, deleted_at, name, avatar_url, last_login')
          .single();
        if (!updateError && updated) profile = updated;
      }
    } catch (err) {
      // Un rol reservado es una comodidad, no algo que deba tumbar el login:
      // si esto falla, el admin igual puede asignar el rol a mano después.
      logger.warn('[pending-role-grant] No se pudo aplicar el rol reservado', {
        email,
        message: (err as any)?.message,
      });
    }

    profileCache.set(supaUser.id, { data: profile, cachedAt: now });
    touchLastLogin(supaUser.id, profile);
    return profile;
  } catch {
    return null;
  }
}

// Deriva los roles: 1) whitelist por env (rápido, sin DB), 2) tabla profiles.
function rolesFromEnvOrProfile(
  email: string,
  profile: Awaited<ReturnType<typeof fetchProfile>>,
): AppRole[] {
  const lower = email.toLowerCase();

  if (config.protectedEmail && lower === config.protectedEmail) {
    return ['global_admin'];
  }

  if (profile && profile.status !== 'disabled' && !profile.deleted_at) {
    const roles = Array.isArray(profile.roles) ? profile.roles.filter(isValidRole) : [];
    if (roles.length) return roles;
  }
  return [];
}

// Verifica el Bearer token y devuelve { user } o { error, message }.
export async function authenticate(
  req: Request,
): Promise<{ user: AuthUser } | { error: number; message: string }> {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { error: 401, message: 'Falta el token de sesión.' };

  // Paralelizar: Decodificar el token localmente para iniciar fetchProfile rápido
  let decoded: any = null;
  try {
    decoded = jose.decodeJwt(token);
  } catch (e) {}

  const profilePromise = (decoded && decoded.sub)
    ? fetchProfile({ id: decoded.sub, email: decoded.email, user_metadata: decoded.user_metadata })
    : Promise.resolve(null);

  const supaUserPromise = getUserFromToken(token);

  const [supaUser, profileResult] = await Promise.all([supaUserPromise, profilePromise]);

  if (!supaUser || !supaUser.email) {
    return { error: 401, message: 'Sesión inválida o expirada.' };
  }

  let profile = profileResult;
  if (!profile && !decoded) {
    profile = await fetchProfile(supaUser);
  }

  const email = supaUser.email.toLowerCase();
  const meta = (supaUser.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string; picture?: string };

  const isInternal = email.endsWith(`@${config.internalDomain}`);
  const isWhitelisted = config.protectedEmail && email === config.protectedEmail;
  if (!isInternal && !isWhitelisted) {
    return { error: 403, message: `Esta cuenta no pertenece al personal de ${config.brandName}.` };
  }

  // El correo de un token lo elige quien se registra: con la anon key cualquiera podría crear
  // `admin@gyrostorenic.com` por email. Exigir el proveedor Azure ata la identidad al tenant.
  const appMeta = (supaUser.app_metadata ?? {}) as { provider?: string; providers?: unknown };
  const linkedProviders = Array.isArray(appMeta.providers) ? appMeta.providers : [];
  const isAzureIdentity = appMeta.provider === 'azure' || linkedProviders.includes('azure');
  if (!isAzureIdentity) {
    return {
      error: 403,
      message: 'Esta cuenta debe iniciar sesión con Microsoft Entra ID.',
    };
  }

  const roles = rolesFromEnvOrProfile(email, profile);
  if (!roles.length) {
    return { error: 403, message: 'Esta cuenta no tiene permisos asignados.' };
  }

  // `profiles` manda sobre el metadata de Auth en nombre y foto: son los que cada persona edita.
  return {
    user: {
      uid: supaUser.id,
      email,
      name: profile?.name || meta.name || meta.full_name || '',
      photoURL: profile?.avatar_url || '',
      roles,
      role: primaryRole(roles),
    },
  };
}

// Factory: deja pasar si el usuario tiene alguno de los roles indicados,
// o si es global_admin (acceso total).
export function requireRole(...allowed: AppRole[]) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const result = await authenticate(req);
    if ('error' in result) return res.status(result.error).json({ error: result.message });

    const { roles } = result.user;
    const ok = roles.includes('global_admin') || allowed.some((r) => roles.includes(r));
    if (!ok) return res.status(403).json({ error: 'Esta cuenta no tiene permisos para esta sección.' });

    req.user = result.user;
    next();
  };
}

// Atajos por portal.
export const requireAdmin = requireRole('admin');
export const requireSeller = requireRole('admin', 'seller');
export const requireCashier = requireRole('admin', 'cashier');
// El vendedor también usa las rutas de solo lectura de facturación: así liga su venta al ticket
// que Caja ya emitió a su nombre.
export const requireCashierOrSeller = requireRole('admin', 'cashier', 'seller');
export const requireAnyRole = requireRole(...VALID_ROLES);
