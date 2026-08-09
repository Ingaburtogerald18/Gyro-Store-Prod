// Formulario de contacto público → captura el lead en el CRM (services/crm.ts).
// Sin auth; el rate-limit (contactLimiter) se aplica en index.ts, mismo
// patrón que POST /api/orders/public (el otro endpoint anónimo que escribe).
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { publicContactInputSchema } from '../../shared/schemas';
import { createLead } from '../services/crm';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = publicContactInputSchema.parse(req.body);
    await createLead(input);
    res.status(201).json({ ok: true });
  }),
);

export default router;
