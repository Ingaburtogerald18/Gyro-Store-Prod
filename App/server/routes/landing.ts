import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/auth';
import { landingConfigSchema } from '../../shared/schemas';
import { getLandingConfig, saveLandingConfig } from '../services/landing';

const router = Router();

// Público: el storefront necesita los slides del hero para pintar la home.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(await getLandingConfig());
  }),
);

// Solo admin: es contenido de portada, no lo toca ni un seller.
router.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = landingConfigSchema.parse(req.body);
    res.json(await saveLandingConfig(data));
  }),
);

export default router;
