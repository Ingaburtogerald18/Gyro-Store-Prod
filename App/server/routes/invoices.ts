// Facturación: /api/invoices (emitir, listar, buscar, corregir, anular).
// requireCashier cubre cashier+admin+global_admin (auth.ts) — v1 usaba el mismo
// rol para el POS. Anular exige admin: es la única operación irreversible.
//
// Tres rutas son la EXCEPCIÓN al gate de cashier: `/mine`, `/lookup` y
// `/:id/ticket` son de solo lectura y el vendedor también las necesita (ver
// nota de cada una). Por eso van ANTES de `router.use(requireCashier)` — una
// vez que ese `.use` corre, ya no hay forma de que una request de un vendedor
// puro (sin cashier) siga de largo.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireCashier, requireCashierOrSeller, requireSeller, requireAdmin } from '../middleware/auth';
import { parseUuidParam } from '../utils/params';
import {
  createInvoiceInputSchema,
  updateInvoiceInputSchema,
  voidInvoiceInputSchema,
} from '../../shared/schemas';
import {
  createInvoice,
  findInvoiceByNumber,
  listInvoices,
  listActiveSellers,
  updateInvoice,
  voidInvoice,
  deleteInvoice,
  getInvoiceTicket,
} from '../services/invoice';

const router = Router();

const statusFilterSchema = z.enum(['unlinked', 'linked', 'void']);

// GET /api/invoices/mine — el vendedor ve SOLO las facturas que Caja le
// asignó (`invoices.seller_uid`), de solo lectura: nunca crea, edita ni
// anula desde acá. Es la pantalla "Mis Facturas" del portal de vendedor.
router.get(
  '/mine',
  requireSeller,
  asyncHandler(async (req, res) => {
    const status = statusFilterSchema.safeParse(req.query.status);
    res.json(
      await listInvoices({
        sellerUid: req.user!.uid,
        status: status.success ? status.data : undefined,
      }),
    );
  }),
);

// Va ANTES de cualquier `/:id`: si no, Express tomaría "lookup" como el id.
// El vendedor lo necesita para vincular su venta (Ventas → "Código de Factura
// del Ticket"): sin esto no podría registrar nada con el número que copió de
// Mis Facturas. `findInvoiceByNumber` ya filtra por dueño (ver invoice.ts).
router.get(
  '/lookup',
  requireCashierOrSeller,
  asyncHandler(async (req, res) => {
    // Llega el código impreso (`GS-PR-12`) o el número pelado: `findInvoiceByNumber`
    // lo normaliza al correlativo y devuelve null si no lo reconoce, así que no
    // se le manda basura a Postgres.
    const parsed = z.string().trim().min(1).max(20).safeParse(req.query.number);
    if (!parsed.success) {
      res.status(400).json({ error: 'Código de factura inválido.' });
      return;
    }
    const invoice = await findInvoiceByNumber(parsed.data, {
      requesterUid: req.user!.uid,
      isPrivileged: req.user!.roles.some((r) => r === 'admin' || r === 'cashier' || r === 'global_admin'),
    });
    if (!invoice) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json(invoice);
  }),
);

// Mismo motivo que `/lookup`: el vendedor necesita poder abrir SU factura
// para ver el detalle antes de copiar el número (`getInvoiceTicket` filtra
// por dueño).
router.get(
  '/:id/ticket',
  requireCashierOrSeller,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const ticket = await getInvoiceTicket(id, {
      requesterUid: req.user!.uid,
      isPrivileged: req.user!.roles.some((r) => r === 'admin' || r === 'cashier' || r === 'global_admin'),
    });
    if (!ticket) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json(ticket);
  }),
);

// ── A partir de acá, todo exige cashier (o admin): crear, listar TODO,
// editar, anular, borrar. Un vendedor puro no pasa este gate. ──
router.use(requireCashier);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = statusFilterSchema.safeParse(req.query.status);
    res.json(await listInvoices({ status: status.success ? status.data : undefined }));
  }),
);

// Vendedores activos para el selector "Vendedor" del formulario de emisión.
router.get(
  '/sellers',
  asyncHandler(async (_req, res) => {
    res.json(await listActiveSellers());
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createInvoiceInputSchema.parse(req.body);
    const invoice = await createInvoice(data);
    res.status(201).json(invoice);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const data = updateInvoiceInputSchema.parse(req.body);
    const updated = await updateInvoice(id, data);
    if (!updated) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json(updated);
  }),
);

// Anular NO es borrar: el correlativo no puede tener huecos, así que anular
// deja la factura en `void` con su número y su motivo. El DELETE de más abajo
// es otra cosa — sacar de la vista una factura ya anulada.
router.post(
  '/:id/void',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const data = voidInvoiceInputSchema.parse(req.body);
    const voided = await voidInvoice(id, data.reason, req.user!.uid);
    if (!voided) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json(voided);
  }),
);

/**
 * DELETE /api/invoices/:id — descartar definitivamente.
 *
 * Solo admin, y solo sobre facturas anuladas o huérfanas (lo valida el
 * servicio). NO reabre el número: la secuencia no retrocede, así que el
 * correlativo de una factura descartada queda retirado para siempre. Eso es a
 * propósito — es lo que hace que el correlativo siga siendo auditable.
 */
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Factura no encontrada.');
    const ok = await deleteInvoice(id);
    if (!ok) {
      res.status(404).json({ error: 'Factura no encontrada.' });
      return;
    }
    res.json({ ok: true });
  }),
);

export default router;
