import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireRole } from '../middleware/auth';
import { getCuadreDashboard } from '../services/cuadre';

const router = Router();

router.use(requireRole('admin', 'cashier'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dashboard = await getCuadreDashboard();
    res.json(dashboard);
  })
);

export default router;
