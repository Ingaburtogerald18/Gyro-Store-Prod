import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getLandingConfig } from './landing';

const router = Router();

// Público: el storefront necesita los slides del hero para pintar la home.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(await getLandingConfig());
  }),
);

// Se publica solo desde el modo edición (modules/store-editor/store-editor-routes.ts), con el bloqueo tomado.

export default router;
