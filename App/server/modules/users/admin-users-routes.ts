import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { invalidateProfileCache, requireAdmin } from '../../middleware/auth';
import { db } from '../../core/supabase';
import { config, VALID_ROLES, type AppRole } from '../../core/config';
import { getSellerSummary } from '../sales/seller-payments';
import {
  upsertPendingGrant,
  listPendingGrants,
  getPendingGrant,
  deletePendingGrant,
} from './pending-role-grants';
import { updateProfileSchema } from '../../../shared/schemas';

const router = Router();

// El correo protegido sale solo de PROTECTED_ADMIN_EMAIL: un correo escrito en el código sería una
// puerta trasera. Si falta, queda vacío y ningún correo coincide.
const SUPER_ADMIN_EMAIL = config.protectedEmail;

const isValidRole = (r: unknown): r is AppRole => VALID_ROLES.includes(r as AppRole);

// Anti-escalada: solo un global_admin puede otorgar global_admin.
function validateRolesForActor(
  roles: unknown,
  actor: Request['user'],
): { roles: AppRole[] } | { status: number; message: string } {
  if (!Array.isArray(roles)) {
    return { status: 400, message: 'Formato inválido para roles.' };
  }
  const invalid = roles.filter((r) => !isValidRole(r));
  if (invalid.length) {
    return { status: 400, message: `Roles inválidos: ${invalid.join(', ')}.` };
  }
  const clean = roles as AppRole[];
  const actorIsGlobal = actor?.roles?.includes('global_admin') ?? false;
  if (clean.includes('global_admin') && !actorIsGlobal) {
    return {
      status: 403,
      message: 'Solo un administrador global puede otorgar el rol global_admin.',
    };
  }
  return { roles: clean };
}

// GET /api/admin/users
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    // Select from profiles (service_role ignores RLS)
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // `isProtected` se calcula acá porque el correo sale del entorno. Es solo una pista para la interfaz.
    const rows = (data || []).map((u: { email?: string | null }) => ({
      ...u,
      isProtected:
        !!SUPER_ADMIN_EMAIL && (u.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase(),
      pending: false,
    }));

    // Roles reservados de gente que todavía no entró: se agregan como filas `pending` para poder verlas
    // y cancelarlas en Personal.
    const pending = await listPendingGrants();
    const pendingRows = pending.map((g) => ({
      id: `pending:${g.email}`,
      email: g.email,
      name: g.name || g.email,
      roles: g.roles,
      status: 'active',
      deleted_at: null,
      created_at: g.createdAt,
      avatar_url: null,
      isProtected: false,
      pending: true,
    }));

    res.json([...pendingRows, ...rows]);
  })
);
// POST /api/admin/users — no crea la identidad de Auth: Microsoft crea la suya con otro id. Si ya hay
// perfil con ese correo se le asigna el rol; si no, se reserva hasta su primer login.
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { email: rawEmail, name, roles } = req.body;
    const email = String(rawEmail || '').trim().toLowerCase();

    if (!email || !name) {
      res.status(400).json({ error: 'Faltan datos requeridos (email, name).' });
      return;
    }

    if (!email.endsWith(`@${config.internalDomain}`)) {
      res.status(400).json({ error: `El correo debe pertenecer al dominio @${config.internalDomain}.` });
      return;
    }

    // Validar roles y bloquear escalada a global_admin desde un admin común.
    const rolesCheck = validateRolesForActor(roles ?? [], req.user);
    if ('status' in rolesCheck) {
      res.status(rolesCheck.status).json({ error: rolesCheck.message });
      return;
    }

    const { data: existingProfile, error: findError } = await db
      .from('profiles')
      .select('id, email, name, roles, avatar_url, deleted_at, created_at')
      .eq('email', email)
      .maybeSingle();
    if (findError) throw findError;

    if (existingProfile) {
      // Ya inició sesión una vez (por eso tiene fila real): asignarle el rol
      // ahora mismo, sin pasar por la reserva.
      const { data: updated, error: updateError } = await db
        .from('profiles')
        .update({ roles: rolesCheck.roles })
        .eq('id', existingProfile.id)
        .select('id, email, name, roles, avatar_url, deleted_at, created_at')
        .single();
      if (updateError) throw updateError;
      res.json({ ...updated, pending: false });
      return;
    }

    const grant = await upsertPendingGrant({
      email,
      name,
      roles: rolesCheck.roles,
      createdBy: req.user!.uid,
    });
    res.status(201).json({
      id: `pending:${grant.email}`,
      email: grant.email,
      name: grant.name,
      roles: grant.roles,
      status: 'active',
      deleted_at: null,
      created_at: grant.createdAt,
      avatar_url: null,
      pending: true,
    });
  })
);

// PATCH /api/admin/users/:email/roles — con perfil se actualiza directo; sin perfil se guarda como reserva.
router.patch(
  '/:email/roles',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    const { roles } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email requerido.' });
      return;
    }

    if (SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Operación denegada: Este usuario está protegido por el sistema.' });
      return;
    }

    // Validar roles y bloquear escalada a global_admin desde un admin común.
    const rolesCheck = validateRolesForActor(roles, req.user);
    if ('status' in rolesCheck) {
      res.status(rolesCheck.status).json({ error: rolesCheck.message });
      return;
    }

    const { data: existingProfile, error: findError } = await db
      .from('profiles')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();
    if (findError) throw findError;

    if (existingProfile) {
      const { data, error } = await db
        .from('profiles')
        .update({ roles: rolesCheck.roles })
        .eq('email', email)
        .select();
      if (error) throw error;
      res.json(data);
      return;
    }

    // Sin perfil: se actualiza la reserva, conservando el nombre que tipeó el admin al invitar.
    const existingGrant = await getPendingGrant(email);
    const grant = await upsertPendingGrant({
      email,
      name: existingGrant?.name || email.split('@')[0] || email,
      roles: rolesCheck.roles,
      createdBy: req.user!.uid,
    });
    res.json([{ email: grant.email, roles: grant.roles, pending: true }]);
  })
);

// DELETE /api/admin/users/pending/:email — cancela una invitación que todavía no se activó.
router.delete(
  '/pending/:email',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Operación denegada: Este usuario está protegido por el sistema.' });
      return;
    }
    const ok = await deletePendingGrant(email);
    if (!ok) {
      res.status(404).json({ error: 'No hay ninguna invitación pendiente con ese correo.' });
      return;
    }
    res.json({ message: 'Invitación cancelada' });
  })
);

// DELETE /api/admin/users/:id
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.id as string;

    if (!userId) {
      res.status(400).json({ error: 'ID requerido.' });
      return;
    }

    // Proteger al super admin consultando su email
    const { data: profile } = await db.from('profiles').select('email').eq('id', userId).single();
    if (profile?.email && profile.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Operación denegada: Este usuario está protegido por el sistema.' });
      return;
    }

    // Hard delete: Borrar de Auth (esto borra el perfil en cascada si está configurado, o lo borramos manual)
    const { error: authError } = await db.auth.admin.deleteUser(userId);
    
    // Si falla Auth (por ejemplo, ya no existe), se borra el perfil por si quedó huérfano.
    const { error: profileError } = await db.from('profiles').delete().eq('id', userId);

    if (authError && profileError) {
      throw profileError;
    }

    res.json({ message: 'Usuario borrado de forma permanente' });
  })
);

// PATCH /api/admin/users/:id/suspend
router.patch(
  '/:id/suspend',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.id as string;
    if (!userId) {
      res.status(400).json({ error: 'ID requerido.' });
      return;
    }

    const { data: profile } = await db.from('profiles').select('email').eq('id', userId).single();
    if (profile?.email && profile.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Operación denegada: Este usuario está protegido por el sistema.' });
      return;
    }

    const { data, error } = await db
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId)
      .select();

    if (error) throw error;
    res.json({ message: 'Usuario dado de baja', data });
  })
);

// PATCH /api/admin/users/:id/restore
router.patch(
  '/:id/restore',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.id as string;
    if (!userId) {
      res.status(400).json({ error: 'ID requerido.' });
      return;
    }

    const { data, error } = await db
      .from('profiles')
      .update({ deleted_at: null })
      .eq('id', userId)
      .select();

    if (error) throw error;
    res.json({ message: 'Usuario restaurado', data });
  })
);

// PATCH /api/admin/users/:id/profile
router.patch(
  '/:id/profile',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.id as string;

    if (!userId) {
      res.status(400).json({ error: 'ID requerido.' });
      return;
    }

    const input = updateProfileSchema.parse(req.body);

    // Vacío significa «borrar el dato»: se guarda NULL. La cuenta bancaria usa `null` para lo mismo.
    const blankToNull = (v: string | undefined) => (v === undefined || v === '' ? null : v);

    const patch: Record<string, unknown> = {
      name: input.name,
      phone: blankToNull(input.phone),
      personal_email: blankToNull(input.personal_email),
      bank_account: input.bank_account ?? null,
    };
    // La foto llega como URL ya subida a R2: `null` la quita y omitir la clave la deja como está.
    if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;

    const { data, error } = await db
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, email, name, roles, avatar_url, status, deleted_at, created_at, phone, personal_email, bank_account, last_login');

    if (error) throw error;

    // Lo que guardó el admin es lo que /auth/me le devuelve a esa persona: se invalida la caché de 30 s.
    invalidateProfileCache(userId);
    res.json({ message: 'Perfil actualizado', data });
  })
);

// GET /api/admin/users/:id/performance
router.get(
  '/:id/performance',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.id as string;
    if (!userId) {
      res.status(400).json({ error: 'ID requerido.' });
      return;
    }

    const { data: profile, error } = await db
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (error || !profile?.email) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const summary = await getSellerSummary(profile.email);
    res.json(summary);
  })
);

export default router;
