// Directorio del equipo para TODO el staff (no solo admins).
//
// ── Por qué no se reusa /api/admin/users ──
// Ese endpoint hace `select('*')` sobre `profiles`, y `*` incluye
// `bank_account` — a dónde le transfieren el sueldo a cada quien — y
// `last_login`. Aflojar su `requireAdmin` para que el vendedor pueda ver la lista
// habría expuesto las dos cosas a todo el personal. Acá la proyección es
// EXPLÍCITA y esas columnas no están: no hay forma de que se filtren, ni siquiera
// si mañana alguien agrega un campo sensible a la tabla.
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAnyRole } from '../../middleware/auth';
import { db } from '../../core/supabase';

const router = Router();

// Columnas visibles para un compañero: identidad, rol, estado y contacto.
// SIN `bank_account` (dato de pago, solo admin) ni `last_login` (telemetría).
const DIRECTORY_COLUMNS =
  'id, email, name, avatar_url, roles, status, deleted_at, created_at, phone, personal_email';

// GET /api/staff/directory
router.get(
  '/directory',
  requireAnyRole,
  asyncHandler(async (_req, res) => {
    const { data, error } = await db
      .from('profiles')
      .select(DIRECTORY_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Solo perfiles REALES. Las invitaciones pendientes (roles reservados por
    // correo, ver modules/users/pending-role-grants.ts) son estado de administración:
    // se ven en Personal como admin y no aportan nada a un directorio de
    // contactos, donde serían filas de gente que todavía no trabaja acá.
    res.json(data || []);
  })
);

export default router;
