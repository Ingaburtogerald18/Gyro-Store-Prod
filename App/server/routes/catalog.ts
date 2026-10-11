import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { getPublishedCatalogItem, listPublishedCatalog } from '../services/catalog';
import { collectMappedCodes, toCatalogDetail, toCatalogProduct } from '../services/catalogPresenter';
import { getLotsByCodes } from '../services/inventory';
import { getActiveOffers } from '../services/offers';

const router = Router();

// Endpoint público para obtener todos los ítems publicados del catálogo.
// La fila cruda de la base se presenta antes de salir al cable: el storefront
// recibe objetos planos listos para pintar, no el esquema de la tabla.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await listPublishedCatalog();
    // Una sola consulta a bodega para TODO el listado: se juntan los códigos de
    // lote de todos los ítems y se resuelven de golpe, en vez de una consulta
    // por producto (N+1) mientras se presenta cada fila.
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
