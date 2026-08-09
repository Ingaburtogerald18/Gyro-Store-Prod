// Verificación de JWT de Supabase (login con Entra) + resolución de roles.
// Portado de la v1 (middleware/auth.js): whitelist por env → tabla `profiles` →
// array de roles. La autorización REAL vive acá; el frontend solo oculta botones.
import type { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { config, VALID_ROLES, type AppRole } from '../config';
import { db, getUserFromToken } from '../supabase';
import { logger } from '../utils/logger';
import { consumePendingGrant } from '../services/pendingRoleGrants';

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

/**
 * Descarta el perfil cacheado de un usuario. La caché dura 30 s, que está bien
 * para lecturas, pero cuando ALGO acaba de escribir en `profiles` (la foto que
 * alguien acaba de subir en «Mi perfil», por ejemplo) el siguiente `/auth/me`
 * devolvería el dato viejo durante medio minuto. Quien escribe, invalida.
 */
export function invalidateProfileCache(uid: string) {
  profileCache.delete(uid);
}

// Cada cuánto se refresca `profiles.last_login`. El dato sirve para detectar
// cuentas inactivas, así que la precisión al minuto no aporta nada: escribir en
// cada request sería una escritura por llamada a la API.
const LAST_LOGIN_THROTTLE_MS = 15 * 60_000;

/**
 * Marca la última conexión del staff. NO se espera (`void`, sin await): es
 * telemetría, y hacer que cada request pague una escritura a Postgres antes de
 * responder degradaría la latencia de toda la API por un dato que a nadie le
 * urge. Si falla, se ignora — no vale romper una sesión válida por esto.
 *
 * Muta `profile.last_login` en el objeto CACHEADO para que las llamadas
 * siguientes vean el valor nuevo y no vuelvan a escribir dentro de la ventana.
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

// Lee el perfil por id de auth. Si no existe, lo crea (primer login).
// Tolera que la tabla `profiles` aún no exista (durante el Hito 0): captura y
// devuelve null, para que la whitelist por env siga funcionando.
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

    // Si no existe, insertarlo automáticamente (Sync de perfil).
    //
    // `avatar_url: ''` a propósito: la foto NO se hereda de Microsoft. Traerla de
    // Graph (o del `picture` que Entra deja en el metadata) fallaba de formas que
    // el usuario no puede resolver — sin foto en el tenant, permiso denegado, R2
    // sin configurar — y dejaba avatares roto o vacíos sin explicación. Ahora la
    // sube cada persona a mano desde «Mi perfil» (routes/me.ts).
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

    // Primer login de verdad: si un admin le había reservado un rol desde
    // Personal ANTES de que esta persona existiera como identidad de Auth
    // (ver services/pendingRoleGrants.ts), se lo aplica acá y se consume la
    // reserva. Sin esto, el perfil nace con `roles: []` y nadie entra nunca.
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

  // El chequeo de arriba mira SOLO el correo, y el correo de un JWT de Supabase lo
  // elige quien se registra. Con la anon key cualquiera puede hacer un signup
  // email/password de `admin@gyrostorenic.com` (o del correo de la whitelist) y
  // obtener un token válido que pasaría el filtro de dominio. El login del staff
  // SIEMPRE es por Entra/Azure (doc 03), así que exigimos que el token venga de ese
  // proveedor: es lo que ata la identidad al tenant de Microsoft y no al string del
  // correo.
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

  // `profiles` manda sobre el metadata de Auth para nombre y foto: son los dos
  // campos que cada persona edita en «Mi perfil» (y el admin en Personal). Con la
  // precedencia al revés, Entra pisaba el nombre a mostrar y la foto subida a
  // mano nunca aparecía — el metadata solo queda como respaldo del primer login.
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

// Atajos por portal (mismos que la v1).
export const requireAdmin = requireRole('admin');
export const requireSeller = requireRole('admin', 'seller');
export const requireCashier = requireRole('admin', 'cashier');
// Facturación tiene un puñado de rutas de SOLO LECTURA (lookup por código,
// ticket) que además del cajero necesita el vendedor: es cómo vincula su
// venta al número de un ticket que Caja ya emitió a su nombre.
export const requireCashierOrSeller = requireRole('admin', 'cashier', 'seller');
export const requireLogisticsAdmin = requireRole('admin', 'logistics_admin');
export const requireLogisticsAny = requireRole('admin', 'logistics_admin', 'logistics_customer');
export const requireAnyRole = requireRole(...VALID_ROLES);
