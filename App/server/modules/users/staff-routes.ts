// Directorio para todo el personal. No reusa /api/admin/users porque `select('*')` incluye la cuenta
// bancaria y last_login: acá las columnas son explícitas.
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

    // Solo perfiles reales: las invitaciones pendientes se ven en Personal.
    res.json(data || []);
  })
);

export default router;
