// Plantillas y categorías del panel (vistas de Inventario). Lectura para staff:
// el vendedor ve nombres de categoría en Ventas; las mutaciones son solo admin.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAdmin, requireSeller } from '../../middleware/auth';
import { templateInputSchema } from '../../../shared/schemas';
import {
  countProductsUsingTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from './templates';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from './categories';

const router = Router();

// Un solo gate por método evita autenticar dos veces por request.
router.use((req, res, next) =>
  req.method === 'GET' ? requireSeller(req, res, next) : requireAdmin(req, res, next),
);

// El id se valida antes de tocar la base: un id mal formado es un 404, no un
// error 500 de Postgres.
const idSchema = z.uuid();

// ── Plantillas (una por modelo) ──

router.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    res.json(await listTemplates());
  }),
);

router.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const data = templateInputSchema.parse(req.body);
    res.status(201).json(await createTemplate(data));
  }),
);

router.get(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    const template = await getTemplate(id.data);
    if (!template) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    res.json(template);
  }),
);

router.put(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    const data = templateInputSchema.parse(req.body);
    const updated = await updateTemplate(id.data, data);
    if (!updated) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    res.json(updated);
  }),
);

// Borrar una plantilla en uso dejaría productos sin ejes: se bloquea y se dice cuántos reasignar.
router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    const inUse = await countProductsUsingTemplate(id.data);
    if (inUse > 0) {
      res.status(409).json({
        error: `${inUse} producto(s) usan esta plantilla. Cambiales la plantilla antes de borrarla.`,
      });
      return;
    }
    const deleted = await deleteTemplate(id.data);
    if (!deleted) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

// ── Categorías ──

const categoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  icon: z.string().max(16).default(''),
});

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json(await listCategories());
  }),
);

router.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const data = categoryInputSchema.parse(req.body);
    const category = await createCategory(data.name, data.slug, data.icon);
    res.json(category);
  }),
);

router.put(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Categoría no encontrada.' });
      return;
    }
    const data = categoryInputSchema.parse(req.body);
    const updated = await updateCategory(id.data, data.name, data.slug, data.icon);
    if (!updated) {
      res.status(404).json({ error: 'Categoría no encontrada.' });
      return;
    }
    res.json(updated);
  }),
);

router.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Categoría no encontrada.' });
      return;
    }
    await deleteCategory(id.data);
    res.json({ ok: true });
  }),
);

export default router;
