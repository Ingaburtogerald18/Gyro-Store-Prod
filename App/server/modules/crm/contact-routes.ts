// Formulario de contacto público → lead en el CRM. Sin sesión; contactLimiter se aplica en index.ts.
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { publicContactInputSchema } from '../../../shared/schemas';
import { createLead } from './crm';

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
