import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { parseUuidParam } from '../utils/params';
import { listPublishedCombos, getPublishedCombo } from '../services/combos';

const router = Router();

// Endpoint público para obtener todos los combos publicados
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listPublishedCombos();
    res.json({ items });
  })
);

// Detalle de un combo publicado (página de combo, doc 09 ítem 46).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Combo no encontrado.');
    const combo = await getPublishedCombo(id);
    if (!combo) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    res.json(combo);
  }),
);

export default router;