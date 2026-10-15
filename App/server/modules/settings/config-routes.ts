import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { readConfig } from '../storefront/store-reader';

const router = Router();

// Endpoint público para obtener la configuración global de la tienda
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(await readConfig());
  })
);

export default router;
