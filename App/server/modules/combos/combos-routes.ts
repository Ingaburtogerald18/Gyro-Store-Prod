import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { readCombo, readCombos } from '../storefront/store-reader';

const router = Router();

// Endpoint público para obtener todos los combos publicados
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await readCombos() });
  })
);

// Detalle de un combo publicado, por su slug o por id (enlaces viejos). El JSON trae `id` y `slug`.
router.get(
  '/:ref',
  asyncHandler(async (req, res) => {
    const combo = await readCombo(String(req.params.ref));
    if (!combo) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    res.json(combo);
  }),
);

export default router;
