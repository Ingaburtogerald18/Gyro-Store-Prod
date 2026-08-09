// Cuotas: /api/installments (crear plan, registrar pago, cancelar, listar).
// Solo admin, igual que v1.
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/auth';
import { parseUuidParam } from '../utils/params';
import { createInstallmentPlanInputSchema, registerInstallmentPaymentInputSchema } from '../../shared/schemas';
import {
  listInstallments,
  createInstallmentPlan,
  registerInstallmentPayment,
  cancelInstallmentPlan,
} from '../services/installments';

const router = Router();

router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listInstallments(status));
  }),
);

// Antes de '/:id/...': path literal, sin ambigüedad con el parámetro.
router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    res.json(await listInstallments('active'));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createInstallmentPlanInputSchema.parse(req.body);
    const plan = await createInstallmentPlan(data);
    res.status(201).json(plan);
  }),
);

router.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Plan de cuotas no encontrado.');
    const data = registerInstallmentPaymentInputSchema.parse(req.body);
    const result = await registerInstallmentPayment(id, data);
    if (!result) {
      res.status(404).json({ error: 'Plan de cuotas no encontrado.' });
      return;
    }
    res.json({ ok: true, ...result });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Plan de cuotas no encontrado.');
    const ok = await cancelInstallmentPlan(id);
    if (!ok) {
      res.status(404).json({ error: 'Plan de cuotas no encontrado.' });
      return;
    }
    res.json({ ok: true });
  }),
);

export default router;
