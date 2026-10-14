import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { getPublishedCatalogItem, listPublishedCatalog } from './catalog';
import { collectMappedCodes, toCatalogDetail, toCatalogProduct } from './catalog-presenter';
import { getLotsByCodes } from '../inventory/inventory-links';
import { getActiveOffers } from './offers';

const router = Router();

// Catálogo público ya presentado: objetos listos para pintar, no el esquema de la tabla.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await listPublishedCatalog();
    // Una sola consulta a bodega para todo el listado, en vez de una por producto.
    const [lots, offers] = await Promise.all([getLotsByCodes(rows.flatMap(collectMappedCodes)), getActiveOffers()]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ items: rows.map((row) => toCatalogProduct(row, lots, offers.get(row.id))) });
  })
);

// Detalle público de un producto. El id se valida como uuid antes de tocar la
// base: sin eso, un id mal formado sale como error 500 de Postgres.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Producto no encontrado.' });
      return;
    }

    const item = await getPublishedCatalogItem(id.data);
    if (!item) {
      res.status(404).json({ error: 'Producto no encontrado.' });
      return;
    }

    const [lots, offers] = await Promise.all([getLotsByCodes(collectMappedCodes(item)), getActiveOffers()]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(toCatalogDetail(item, lots, offers.get(item.id)));
  }),
);

export default router;
