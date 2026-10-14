// Sesión del personal: quién sos según tu token y tus roles resueltos.
import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAnyRole } from '../../middleware/auth';

const router = Router();

// GET /api/auth/me
router.get(
  '/me',
  requireAnyRole,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

export default router;
