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

// Detalle de un combo publicado (página de combo). Un id que no es uuid también es 404.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const combo = await readCombo(String(req.params.id));
    if (!combo) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    res.json(combo);
  }),
);

export default router;
