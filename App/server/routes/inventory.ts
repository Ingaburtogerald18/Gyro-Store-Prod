// CRUD del inventario (bodega) desde el panel: lotes de compra (purchases).
// El módulo de inventario migrado se eliminó: nunca se pudo VENDER (sales.ts
// solo consume `purchases` vía FIFO), así que cargar ítems ahí era registrar
// stock que el sistema no sabía despachar. Cumple el contrato de
// frontend/app/store/api/inventoryV1Api.ts (mismos paths/verbos) — no el de
// inventoryApi.ts, que es un draft sin usar (ver server/services/inventory.ts).
// Solo admin, salvo Stock actual: el vendedor lo ve en solo lectura y sin
// costos. Comprar y recibir es tarea de administración.
import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin, requireSeller } from '../middleware/auth';
import { parseUuidParam } from '../utils/params';
import {
  updatePurchaseInputSchema,
  arrivalInputSchema,
  newPurchaseOrderInputSchema,
  updatePurchaseOrderInputSchema,
  addPurchaseOrderLinesInputSchema,
  receivePurchaseOrderInputSchema,
  simulatePurchaseOrderReceiptInputSchema,
  supplierInputSchema,
  purchaseInvoiceInputSchema,
  colorOfferInputSchema,
} from '../../shared/schemas';
import {
  getPurchases,
  getCurrentInventory,
  getAvailableInventory,
  getIncomingInventory,
  getInventoryKpis,
  reportArrival,
  updatePurchase,
  revertPurchase,
  deletePurchase,
  simulateCost,
  adjustStock,
  listStockMovements,
  withMediaLinks,
} from '../services/inventory';
import {
  addPurchaseOrderLines,
  createPurchaseOrder,
  createSupplier,
  deletePurchaseOrder,
  getInvoiceFile,
  getPackagePhoto,
  getPurchaseOrder,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  simulatePurchaseOrderReceipt,
  updatePurchaseInvoice,
  updatePurchaseOrder,
  updateSupplier,
} from '../services/purchaseOrders';
import { removeColorOffer, setColorOffer, withOffers } from '../services/offers';

const router = Router();

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

// "all"/vacío/formato inválido = sin filtro (historial completo), igual que
// hace el frontend con `withPeriod`.
function parsePeriod(raw: unknown): string | undefined {
  const parsed = periodSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

const isAdminUser = (user: Request['user']) =>
  !!user && (user.roles.includes('admin') || user.roles.includes('global_admin'));

router.get(
  '/current',
  requireSeller,
  asyncHandler(async (req, res) => {
    const rows = await withMediaLinks(await withOffers(await getCurrentInventory(parsePeriod(req.query.period))));
    if (isAdminUser(req.user)) {
      res.json(rows);
      return;
    }
    // Lista cerrada: un campo de costo nuevo no le llega al vendedor por descuido.
    res.json(
      rows.map(({ id, code, productName, category, quantitySold, quantityReserved, available, suggestedPrice, offer, spoLink }) => ({
        id, code, productName, category, quantitySold, quantityReserved, available, suggestedPrice, offer, spoLink,
      })),
    );
  }),
);

router.use(requireAdmin);

// ── purchases ──

router.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    res.json(await getPurchases(parsePeriod(req.query.period)));
  }),
);

router.get(
  '/available',
  asyncHandler(async (_req, res) => {
    res.json(await getAvailableInventory());
  }),
);

router.get(
  '/incoming',
  asyncHandler(async (_req, res) => {
    res.json(await getIncomingInventory());
  }),
);

router.get(
  '/kpis',
  asyncHandler(async (req, res) => {
    res.json(await getInventoryKpis(parsePeriod(req.query.period)));
  }),
);

router.patch(
  '/purchases/:id/arrival',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const data = arrivalInputSchema.parse(req.body);
    const ok = await reportArrival(id, data);
    if (!ok) {
      res.status(404).json({ error: 'Compra no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/purchases/:id/simulate-cost',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const shippingUnit = z.number().min(0).parse(req.body.shippingUnit);
    const exchangeRate = z.number().positive().optional().parse(req.body.exchangeRate);
    const result = await simulateCost(id, shippingUnit, exchangeRate);
    res.json(result);
  }),
);

router.put(
  '/purchases/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const data = updatePurchaseInputSchema.parse(req.body);
    const ok = await updatePurchase(id, data, req.user!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Compra no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

router.patch(
  '/purchases/:id/revert',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const ok = await revertPurchase(id);
    if (!ok) {
      res.status(404).json({ error: 'Compra no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

// Ajuste de stock de un lote (merma, entrada o salida por conteo), con motivo.
const adjustStockSchema = z.object({
  kind: z.enum(['adjust_in', 'adjust_out', 'write_off']),
  quantity: z.number().int().positive('La cantidad tiene que ser mayor a 0.').max(100000),
  reason: z.string().trim().min(3, 'Escribí el motivo del ajuste.').max(300),
});

router.post(
  '/purchases/:id/adjust',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const data = adjustStockSchema.parse(req.body);
    res.json(await adjustStock(id, data, req.user!.uid));
  }),
);

router.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const purchaseId =
      typeof req.query.purchaseId === 'string' ? parseUuidParam(req.query.purchaseId, 'Compra no encontrada.') : undefined;
    res.json(await listStockMovements(purchaseId));
  }),
);

// ── órdenes de compra (Alibaba, migración 0024) ──

router.get(
  '/orders',
  asyncHandler(async (_req, res) => {
    res.json(await listPurchaseOrders());
  }),
);

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const data = newPurchaseOrderInputSchema.parse(req.body);
    res.status(201).json(await createPurchaseOrder(data, req.user!.uid));
  }),
);

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const order = await getPurchaseOrder(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada.' });
      return;
    }
    res.json(order);
  }),
);

router.put(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const data = updatePurchaseOrderInputSchema.parse(req.body);
    const order = await updatePurchaseOrder(id, data, req.user!.uid);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada.' });
      return;
    }
    res.json(order);
  }),
);

router.delete(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const ok = await deletePurchaseOrder(id, req.user!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Orden no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/orders/:id/lines',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const data = addPurchaseOrderLinesInputSchema.parse(req.body);
    const order = await addPurchaseOrderLines(id, data, req.user!.uid);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada.' });
      return;
    }
    res.status(201).json(order);
  }),
);

router.post(
  '/orders/:id/simulate-receipt',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const data = simulatePurchaseOrderReceiptInputSchema.parse(req.body);
    res.json(await simulatePurchaseOrderReceipt(id, data));
  }),
);

router.post(
  '/orders/:id/receive',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const data = receivePurchaseOrderInputSchema.parse(req.body);
    res.json(await receivePurchaseOrder(id, data, req.user!.uid));
  }),
);

router.get(
  '/orders/:id/photos/:index',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Orden no encontrada.');
    const index = z.coerce.number().int().min(0).max(50).parse(req.params.index);
    const photo = await getPackagePhoto(id, index);
    if (!photo) {
      res.status(404).json({ error: 'Foto no encontrada.' });
      return;
    }
    res.set('Content-Type', photo.contentType);
    res.set('Content-Disposition', `attachment; filename="${photo.filename}"`);
    res.send(photo.body);
  }),
);

// ── proveedores ──

router.get(
  '/suppliers',
  asyncHandler(async (_req, res) => {
    res.json(await listSuppliers());
  }),
);

router.post(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const data = supplierInputSchema.parse(req.body);
    res.status(201).json(await createSupplier(data));
  }),
);

router.put(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Proveedor no encontrado.');
    const data = supplierInputSchema.parse(req.body);
    const supplier = await updateSupplier(id, data);
    if (!supplier) {
      res.status(404).json({ error: 'Proveedor no encontrado.' });
      return;
    }
    res.json(supplier);
  }),
);

// ── facturas ── (se crean al guardar una orden; acá solo se corrigen y se leen)

router.get(
  '/invoices/:id/file',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const file = await getInvoiceFile(id);
    if (!file) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.set('Content-Type', file.contentType);
    res.set('Content-Disposition', `inline; filename="${file.filename}"`);
    res.set('Cache-Control', 'private, no-store');
    res.send(file.body);
  }),
);

router.put(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const data = purchaseInvoiceInputSchema.parse(req.body);
    const ok = await updatePurchaseInvoice(id, data, req.user!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

router.delete(
  '/purchases/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Compra no encontrada.');
    const ok = await deletePurchase(id, req.user!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Compra no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

// ── ofertas por color ──

router.put(
  '/offers',
  asyncHandler(async (req, res) => {
    const data = colorOfferInputSchema.parse(req.body);
    res.json(await setColorOffer(data, req.user!.uid));
  }),
);

router.delete(
  '/offers/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Oferta no encontrada.');
    if (!(await removeColorOffer(id))) {
      res.status(404).json({ error: 'Oferta no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

export default router;
