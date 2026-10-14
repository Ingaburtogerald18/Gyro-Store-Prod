// Facturación. requireCashier cubre cajero y admin; anular exige admin. `/mine`, `/lookup` y
// `/:id/ticket` son de solo lectura para el vendedor: por eso van antes del router.use.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireCashier, requireCashierOrSeller, requireSeller, requireAdmin } from '../../middleware/auth';
import { parseUuidParam } from '../../utils/params';
import {
  createInvoiceInputSchema,
  updateInvoiceInputSchema,
  voidInvoiceInputSchema,
} from '../../../shared/schemas';
import {
  createInvoice,
  findInvoiceByNumber,
  listInvoices,
  listActiveSellers,
  updateInvoice,
  voidInvoice,
  deleteInvoice,
  getInvoiceTicket,
} from './invoices';

const router = Router();

const statusFilterSchema = z.enum(['unlinked', 'linked', 'void']);

// El vendedor ve solo las facturas que Caja le asignó, de solo lectura («Mis Facturas»).
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

// Antes de `/:id`, para que Express no tome «lookup» como id. El vendedor la usa para ligar su venta;
// `findInvoiceByNumber` filtra por dueño.
router.get(
  '/lookup',
  requireCashierOrSeller,
  asyncHandler(async (req, res) => {
    // Acepta `GS-PR-12` o el número pelado; lo que no se reconoce no llega a Postgres.
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

// El vendedor abre su factura antes de copiar el número; `getInvoiceTicket` filtra por dueño.
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

// Anular no es borrar: el correlativo no puede tener huecos, así que queda en `void` con su motivo.
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

/** Descarta una factura anulada o huérfana. Solo admin. El número no se reabre: la secuencia no retrocede. */
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
