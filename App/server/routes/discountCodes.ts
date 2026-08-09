// Códigos de descuento: crear/listar/activar-desactivar es admin-only; validar
// (preview) es PÚBLICO — lo usa el checkout para dar feedback instantáneo sin
// gastar un uso del código. El canje real ocurre dentro de crear pedido/factura
// (server/services/orders.ts, invoice.ts), nunca desde acá.
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/auth';
import { discountCodeSchema, validateDiscountCodeSchema } from '../../shared/schemas';
import {
  listDiscountCodes,
  createDiscountCode,
  setDiscountCodeActive,
  checkDiscountCode,
} from '../services/discountCode';

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
