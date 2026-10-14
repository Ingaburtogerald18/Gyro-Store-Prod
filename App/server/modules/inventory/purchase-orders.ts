// Órdenes de compra: lectura y armado con sus líneas, proveedor y factura.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';
import { fetchAllRows } from '../../utils/fetch-all-rows';
import { SUPPLIER_COLUMNS, toSupplier, type Supplier, type SupplierRow } from './suppliers';
import { INVOICE_COLUMNS, type InvoiceRow, type PurchaseInvoice } from './purchase-invoices';
import { escapeLike, hasPurchaseOrdersTable, requireOrdersTable, toStringArray } from './purchase-order-common';

// ============================================================================
// ── Órdenes ──
// ============================================================================

/** Estado de la orden según sus líneas. */
export type PurchaseOrderStatus = 'empty' | 'transit' | 'partial' | 'received';

/** Datos que le faltan a la orden (las viejas nacen sin ninguno). */
export type PurchaseOrderMissing = 'number' | 'supplier' | 'invoice' | 'photos';

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  /** true = número heredado del lote viejo, falta el de Alibaba. */
  numberProvisional: boolean;
  purchaseDate: string;
  supplier: Supplier | null;
  /** Su factura, que puede ser compartida con otras órdenes. */
  invoice: PurchaseInvoice | null;
  packagePhotos: string[];
  notes: string;
  /** Creada por la migración a partir de compras que ya existían. */
  legacy: boolean;
  createdAt: string;
  lineCount: number;
  receivedLineCount: number;
  /** Unidades pedidas (lo pedido, aunque haya llegado otra cantidad). */
  units: number;
  /** Suma de las líneas pedidas: costo + impuesto (USD). */
  linesTotalUsd: number;
  /** Impuesto por unidad de la orden (USD); null si no tiene líneas o sus líneas difieren. */
  taxUnit: number | null;
  status: PurchaseOrderStatus;
  missing: PurchaseOrderMissing[];
  /** Última fecha de llegada entre sus líneas recibidas. */
  arrivalDate: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  number_provisional: boolean;
  purchase_date: string;
  supplier_id: string | null;
  invoice_id: string | null;
  package_photos: unknown;
  notes: string | null;
  legacy: boolean;
  created_at: string;
  supplier: SupplierRow | SupplierRow[] | null;
  invoice: InvoiceRow | InvoiceRow[] | null;
}

const ORDER_COLUMNS = [
  'id', 'order_number', 'number_provisional', 'purchase_date', 'supplier_id',
  'invoice_id', 'package_photos', 'notes', 'legacy', 'created_at',
  `supplier:suppliers(${SUPPLIER_COLUMNS})`,
  `invoice:purchase_invoices(${INVOICE_COLUMNS})`,
].join(', ');

interface OrderLineAgg {
  order_id: string;
  status: string;
  quantity: number;
  quantity_ordered: number | null;
  costo_china_usd: number | string | null;
  impuesto_unit_usd: number | string | null;
  arrival_date: string | null;
}

const LINE_AGG_COLUMNS = 'order_id, status, quantity, quantity_ordered, costo_china_usd, impuesto_unit_usd, arrival_date';

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Unidades, total y llegada de una orden según sus líneas. */
function sumLines(lines: OrderLineAgg[]) {
  let units = 0;
  let total = 0;
  let received = 0;
  let arrivalDate: string | null = null;
  const taxes = new Set<number>();
  for (const line of lines) {
    taxes.add(Number(line.impuesto_unit_usd ?? 0));
    const ordered = line.quantity_ordered ?? line.quantity;
    units += ordered;
    total += ordered * (Number(line.costo_china_usd ?? 0) + Number(line.impuesto_unit_usd ?? 0));
    if (line.status === 'received') {
      received += 1;
      if (line.arrival_date && (!arrivalDate || line.arrival_date > arrivalDate)) arrivalDate = line.arrival_date;
    }
  }
  const taxUnit = taxes.size === 1 ? [...taxes][0]! : null;
  return { units, total, received, arrivalDate, taxUnit };
}

/**
 * Arma las órdenes con sus totales y sus facturas. `rows` tiene que traer
 * TODAS las órdenes de cada factura que aparece: el total de una factura se
 * compara contra la suma de todas sus órdenes.
 */
function buildOrders(rows: OrderRow[], lines: OrderLineAgg[]): PurchaseOrder[] {
  const byOrder = new Map<string, OrderLineAgg[]>();
  for (const line of lines) byOrder.set(line.order_id, [...(byOrder.get(line.order_id) ?? []), line]);
  const sums = new Map(rows.map((row) => [row.id, sumLines(byOrder.get(row.id) ?? [])]));

  const invoices = new Map<string, PurchaseInvoice>();
  for (const row of rows) {
    const inv = one(row.invoice);
    if (!inv) continue;
    const entry =
      invoices.get(inv.id) ??
      ({
        id: inv.id,
        invoiceNumber: inv.invoice_number ?? '',
        fileUrl: inv.file_url,
        totalUsd: inv.total_usd == null ? null : Number(inv.total_usd),
        notes: inv.notes ?? '',
        createdAt: inv.created_at,
        orders: [],
        linesTotalUsd: 0,
        mismatch: false,
      } satisfies PurchaseInvoice);
    entry.orders.push({ id: row.id, orderNumber: row.order_number });
    entry.linesTotalUsd += sums.get(row.id)!.total;
    invoices.set(inv.id, entry);
  }
  for (const invoice of invoices.values()) {
    invoice.linesTotalUsd = round(invoice.linesTotalUsd, 2);
    // Un centavo de margen por redondeos de Alibaba.
    invoice.mismatch =
      invoice.totalUsd != null && invoice.linesTotalUsd > 0 && Math.abs(invoice.totalUsd - invoice.linesTotalUsd) > 0.01;
  }

  return rows.map((row) => {
    const orderLines = byOrder.get(row.id) ?? [];
    const { units, total, received, arrivalDate, taxUnit } = sums.get(row.id)!;
    const supplierRaw = one(row.supplier);
    const invoice = row.invoice_id ? invoices.get(row.invoice_id) ?? null : null;
    const photos = toStringArray(row.package_photos);

    const status: PurchaseOrderStatus =
      orderLines.length === 0 ? 'empty' : received === 0 ? 'transit' : received === orderLines.length ? 'received' : 'partial';

    const missing: PurchaseOrderMissing[] = [];
    if (row.number_provisional) missing.push('number');
    if (!row.supplier_id) missing.push('supplier');
    if (!invoice?.fileUrl) missing.push('invoice');
    if (photos.length === 0) missing.push('photos');

    return {
      id: row.id,
      orderNumber: row.order_number,
      numberProvisional: row.number_provisional,
      purchaseDate: row.purchase_date,
      supplier: supplierRaw ? toSupplier(supplierRaw) : null,
      invoice,
      packagePhotos: photos,
      notes: row.notes ?? '',
      legacy: row.legacy,
      createdAt: row.created_at,
      lineCount: orderLines.length,
      receivedLineCount: received,
      units,
      linesTotalUsd: round(total, 2),
      taxUnit,
      status,
      missing,
      arrivalDate,
    };
  });
}

/** Todas las órdenes. `available: false` = la migración 0024 no está aplicada. */
export async function listPurchaseOrders(): Promise<{ available: boolean; orders: PurchaseOrder[] }> {
  if (!(await hasPurchaseOrdersTable())) return { available: false, orders: [] };

  const [rows, lines] = await Promise.all([
    fetchAllRows<OrderRow>((from, to) =>
      db
        .from('purchase_orders')
        .select(ORDER_COLUMNS)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: unknown }>,
    ),
    fetchAllRows<OrderLineAgg>((from, to) =>
      db
        .from('purchases')
        .select(LINE_AGG_COLUMNS)
        .not('order_id', 'is', null)
        .range(from, to) as unknown as PromiseLike<{ data: OrderLineAgg[] | null; error: unknown }>,
    ),
  ]);

  return { available: true, orders: buildOrders(rows, lines) };
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  await requireOrdersTable();
  const { data, error } = await db.from('purchase_orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as OrderRow;

  // Con factura compartida, también las otras órdenes de esa factura.
  let rows: OrderRow[] = [row];
  if (row.invoice_id) {
    const { data: siblings, error: siblingsError } = await db
      .from('purchase_orders')
      .select(ORDER_COLUMNS)
      .eq('invoice_id', row.invoice_id);
    if (siblingsError) throw siblingsError;
    rows = [row, ...((siblings ?? []) as unknown as OrderRow[]).filter((s) => s.id !== row.id)];
  }
  const { data: lines, error: linesError } = await db
    .from('purchases')
    .select(LINE_AGG_COLUMNS)
    .in('order_id', rows.map((r) => r.id));
  if (linesError) throw linesError;
  return buildOrders(rows, (lines ?? []) as OrderLineAgg[])[0] ?? null;
}

/** Una orden de Alibaba no se registra dos veces (sin contar las provisionales). */
export async function assertOrderNumberFree(orderNumber: string, excludeId?: string): Promise<void> {
  let query = db
    .from('purchase_orders')
    .select('id')
    .eq('number_provisional', false)
    .ilike('order_number', escapeLike(orderNumber));
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (data && data.length > 0) throw new BadRequestError(`La orden ${orderNumber} ya está registrada.`);
}
