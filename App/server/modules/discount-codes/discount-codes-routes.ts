// Crear y listar es admin; validar es público y no gasta usos (lo usa el checkout para avisar al
// instante). El canje real ocurre al crear el pedido o la factura.
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAdmin } from '../../middleware/auth';
import { discountCodeSchema, validateDiscountCodeSchema } from '../../../shared/schemas';
import {
  listDiscountCodes,
  createDiscountCode,
  setDiscountCodeActive,
  checkDiscountCode,
} from './discount-codes';

const router = Router();

// Público: preview de solo lectura (no consume uso). Va ANTES de las rutas
// admin y sin middleware de auth.
router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const { code } = validateDiscountCodeSchema.parse(req.body);
    const result = await checkDiscountCode(code);
    res.json({ ok: true, ...result });
  }),
);

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await listDiscountCodes());
  }),
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = discountCodeSchema.parse(req.body);
    const created = await createDiscountCode(data, req.user?.email ?? '');
    res.status(201).json(created);
  }),
);

router.patch(
  '/:code',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (typeof req.body?.active !== 'boolean') {
      res.status(400).json({ error: 'Falta el campo "active".' });
      return;
    }
    const updated = await setDiscountCodeActive(String(req.params.code ?? ''), req.body.active);
    res.json(updated);
  }),
);

export default router;
