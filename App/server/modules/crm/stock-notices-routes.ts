// «Avisame cuando haya» desde la ficha de la tienda. Sin auth: el límite de
// envíos (stockNoticeLimiter) se aplica en index.ts, como en /api/contact.
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { stockNoticeInputSchema } from '../../../shared/schemas';
import { createStockNotice } from './stock-notices';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = stockNoticeInputSchema.parse(req.body);
    res.status(201).json(await createStockNotice(input));
  }),
);

export default router;
