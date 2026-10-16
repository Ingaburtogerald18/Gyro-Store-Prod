import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { readCatalog, readProduct } from '../storefront/store-reader';

const router = Router();

// Catálogo público ya presentado: objetos listos para pintar, no el esquema de la tabla.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await readCatalog();
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ items });
  })
);

// Detalle público de un producto, por su slug («/api/catalog/kz-edx-pro») o por id (enlaces viejos).
// El JSON trae los dos: `id` y `slug`.
router.get(
  '/:ref',
  asyncHandler(async (req, res) => {
    const product = await readProduct(String(req.params.ref));
    if (!product) {
      res.status(404).json({ error: 'Producto no encontrado.' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(product);
  }),
);

export default router;
