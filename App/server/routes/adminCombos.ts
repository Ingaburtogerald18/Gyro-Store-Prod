// CRUD de combos desde el panel. Solo admin (crear/editar/borrar/publicar). El
// listado público de combos vive en routes/combos.ts (sin auth).
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/auth';
import { adminComboInputSchema } from '../../shared/schemas';
import {
  createAdminCombo,
  deleteAdminCombo,
  getAdminCombo,
  listAdminCombos,
  updateAdminCombo,
} from '../services/adminCombos';

const router = Router();

router.use(requireAdmin);

const idSchema = z.uuid();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listAdminCombos() });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = adminComboInputSchema.parse(req.body);
    res.status(201).json(await createAdminCombo(data));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    const combo = await getAdminCombo(id.data);
    if (!combo) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    res.json(combo);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    const data = adminComboInputSchema.parse(req.body);
    const updated = await updateAdminCombo(id.data, data);
    if (!updated) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Combo no encontrado.' });
      return;
    }
    try {
      await deleteAdminCombo(id.data);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error)?.message || 'No se pudo eliminar el combo.' });
    }
  }),
);

export default router;
