// Órdenes de compra de Alibaba (migración 0024).
//
// Una orden agrupa varias líneas de `purchases` (una por variante) y guarda lo
// que antes no tenía dónde vivir: el número de orden de Alibaba, el proveedor,
// la factura y las fotos del empaque, que pide el agente en Nicaragua para
// reconocer los bultos. La factura vive aparte (`purchase_invoices`): Alibaba
// puede partir un pago en varias órdenes con una sola factura, y entonces
// esas órdenes apuntan a la misma. Las líneas siguen siendo lotes normales: Ventas, el
// FIFO y la tienda las leen igual que antes. `purchases.lot` se llena con el
// número de orden para que la búsqueda y los listados viejos sigan funcionando.
//
// Recibir se hace por envío: una o varias órdenes que llegaron juntas. El envío
// se escribe TOTAL y se reparte entre las unidades recibidas (decisión
// 2026-10-09). Las líneas que no se reciben siguen en tránsito, así que una
// orden puede llegar por partes.
import { db } from '../supabase';
import { getFinancialConfig } from './appConfig';
import { costPurchaseOnArrival, round, type PurchaseCosting } from './finance';
import { BadRequestError } from '../utils/httpError';
import { fetchAllRows } from '../utils/fetchAllRows';
import { isMissingColumn } from './orderPersistence';
import { nameForVariant, nextPurchaseCodes, type CatalogLink } from './inventory';
import { isStorageUrl } from './storage';
import type {
  AddPurchaseOrderLinesInput,
  NewPurchaseOrderInput,
  PurchaseInvoiceInput,
  PurchaseOrderLineInput,
  ReceivePurchaseOrderInput,
  SimulatePurchaseOrderReceiptInput,
  SupplierInput,
  UpdatePurchaseOrderInput,
} from '../../shared/schemas';

const MISSING_0024 = 'Falta aplicar la migración 0024 en Supabase para registrar órdenes de compra.';

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', 'PGRST205', 'PGRST204'].includes(error.code ?? '');
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

// Comodines de LIKE escapados: un nombre con "%" o "_" no debe matchear otros.
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export async function hasPurchaseOrdersTable(): Promise<boolean> {
  const { error } = await db.from('purchase_orders').select('id').limit(1);
  if (!error) return true;
  if (isMissingTable(error)) return false;
  throw error;
}

async function requireOrdersTable(): Promise<void> {
  if (!(await hasPurchaseOrdersTable())) throw new BadRequestError(MISSING_0024);
}

// Los números de orden se guardan en mayúsculas, igual que se guardaban los
// lotes: "lt1" y "LT1" son la misma orden.
function normalizeOrderNumber(value: string): string {
  return value.trim().toUpperCase();
}

// ============================================================================
// ── Proveedores ──
// ============================================================================

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  storeUrl: string;
  notes: string;
}

interface SupplierRow {
  id: string;
  name: string;
  contact: string | null;
  store_url: string | null;
  notes: string | null;
}

const SUPPLIER_COLUMNS = 'id, name, contact, store_url, notes';

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact ?? '',
    storeUrl: row.store_url ?? '',
    notes: row.notes ?? '',
  };
}

function supplierRow(input: SupplierInput) {
  return {
    name: input.name.trim(),
    contact: input.contact?.trim() ?? '',
    store_url: input.storeUrl?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  };
}

export async function listSuppliers(): Promise<Supplier[]> {
  await requireOrdersTable();
  const { data, error } = await db.from('suppliers').select(SUPPLIER_COLUMNS).order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as SupplierRow[]).map(toSupplier);
}

async function findSupplierByName(name: string): Promise<SupplierRow | null> {
  const { data, error } = await db
    .from('suppliers')
    .select(SUPPLIER_COLUMNS)
    .ilike('name', escapeLike(name.trim()))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SupplierRow | null) ?? null;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  await requireOrdersTable();
  const existing = await findSupplierByName(input.name);
  if (existing) throw new BadRequestError(`Ya existe un proveedor llamado "${existing.name}".`);
  const { data, error } = await db.from('suppliers').insert(supplierRow(input)).select(SUPPLIER_COLUMNS).single();
  if (isUniqueViolation(error)) throw new BadRequestError(`Ya existe un proveedor llamado "${input.name.trim()}".`);
  if (error) throw error;
  return toSupplier(data as SupplierRow);
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<Supplier | null> {
  await requireOrdersTable();
  const { data, error } = await db
    .from('suppliers')
    .update(supplierRow(input))
    .eq('id', id)
    .select(SUPPLIER_COLUMNS)
    .maybeSingle();
  if (isUniqueViolation(error)) throw new BadRequestError(`Ya existe un proveedor llamado "${input.name.trim()}".`);
  if (error) throw error;
  return data ? toSupplier(data as SupplierRow) : null;
}

/**
 * El proveedor de una orden: uno guardado (`supplierId`) o uno nuevo. Un
 * "nuevo" con el nombre de uno que ya existe reutiliza ese, y le completa el
 * contacto o la tienda si estaban vacíos: así no se duplican proveedores por
 * cargarlos desde el formulario de la orden.
 */
async function resolveSupplierId(
  supplierId: string | null | undefined,
  newSupplier: SupplierInput | undefined,
): Promise<string | null | undefined> {
  if (newSupplier) {
    const existing = await findSupplierByName(newSupplier.name);
    if (existing) {
      const fill: Record<string, string> = {};
      if (!existing.contact && newSupplier.contact) fill.contact = newSupplier.contact.trim();
      if (!existing.store_url && newSupplier.storeUrl) fill.store_url = newSupplier.storeUrl.trim();
      if (Object.keys(fill).length) {
        const { error } = await db.from('suppliers').update(fill).eq('id', existing.id);
        if (error) throw error;
      }
      return existing.id;
    }
    const { data, error } = await db.from('suppliers').insert(supplierRow(newSupplier)).select('id').single();
    if (isUniqueViolation(error)) {
      // Otra persona lo creó en el mismo momento: se usa ese.
      const raced = await findSupplierByName(newSupplier.name);
      if (raced) return raced.id;
    }
    if (error) throw error;
    return data.id as string;
  }
  if (supplierId) {
    const { data, error } = await db.from('suppliers').select('id').eq('id', supplierId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El proveedor elegido ya no existe.');
    return supplierId;
  }
  return supplierId; // null = sin proveedor; undefined = no se toca
}

// ============================================================================
// ── Facturas ──
// ============================================================================

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  fileUrl: string | null;
  totalUsd: number | null;
  notes: string;
  createdAt: string;
  /** Órdenes que cubre (una factura puede cubrir varias). */
  orders: { id: string; orderNumber: string }[];
  /** Suma de los productos de TODAS sus órdenes: costo + impuesto (USD). */
  linesTotalUsd: number;
  /** El total no coincide con la suma (mientras se cargan productos, falta). */
  mismatch: boolean;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  file_url: string | null;
  total_usd: number | string | null;
  notes: string | null;
  created_at: string;
}

const INVOICE_COLUMNS = 'id, invoice_number, file_url, total_usd, notes, created_at';

function invoiceRow(input: PurchaseInvoiceInput) {
  return {
    invoice_number: input.invoiceNumber.trim(),
    file_url: input.fileUrl ?? null,
    total_usd: input.totalUsd ?? null,
    notes: input.notes?.trim() ?? '',
  };
}

async function assertInvoiceNumberFree(invoiceNumber: string, excludeId?: string): Promise<void> {
  const number = invoiceNumber.trim();
  if (!number) return;
  let query = db.from('purchase_invoices').select('id').ilike('invoice_number', escapeLike(number));
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    throw new BadRequestError(`La factura ${number} ya está cargada: elegila de la lista en vez de subirla otra vez.`);
  }
}

/**
 * La factura de una orden: una ya cargada (`invoiceId`, quizás de otra orden de
 * la misma compra) o una nueva. `null` = sin factura; `undefined` = no se toca.
 */
async function resolveInvoiceId(
  invoiceId: string | null | undefined,
  newInvoice: PurchaseInvoiceInput | undefined,
  authorUid: string | undefined,
): Promise<string | null | undefined> {
  if (newInvoice) {
    await assertInvoiceNumberFree(newInvoice.invoiceNumber);
    const { data, error } = await db
      .from('purchase_invoices')
      .insert({ ...invoiceRow(newInvoice), created_by: authorUid ?? null })
      .select('id')
      .single();
    if (isUniqueViolation(error)) {
      throw new BadRequestError(`La factura ${newInvoice.invoiceNumber.trim()} ya está cargada: elegila de la lista.`);
    }
    if (error) throw error;
    return data.id as string;
  }
  if (invoiceId) {
    const { data, error } = await db.from('purchase_invoices').select('id').eq('id', invoiceId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('La factura elegida ya no existe.');
    return invoiceId;
  }
  return invoiceId;
}

/** Una factura que ya no cubre ninguna orden se borra (no aparece en la lista). */
async function dropInvoiceIfUnused(invoiceId: string | null | undefined): Promise<void> {
  if (!invoiceId) return;
  const { count, error } = await db
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId);
  if (error) throw error;
  if ((count ?? 0) === 0) await db.from('purchase_invoices').delete().eq('id', invoiceId);
}

/** Corrige número, archivo o total de una factura (vale para todas sus órdenes). */
export async function updatePurchaseInvoice(
  id: string,
  input: PurchaseInvoiceInput,
  authorUid?: string,
): Promise<boolean> {
  await requireOrdersTable();
  const { data: existing, error: fetchError } = await db
    .from('purchase_invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;
  await assertInvoiceNumberFree(input.invoiceNumber, id);
  const { error } = await db.from('purchase_invoices').update(invoiceRow(input)).eq('id', id);
  if (isUniqueViolation(error)) throw new BadRequestError(`La factura ${input.invoiceNumber.trim()} ya está cargada.`);
  if (error) throw error;
  await db.from('audit_logs').insert({
    entity: 'purchase_invoices',
    entity_id: id,
    action: 'update',
    reason: 'Órdenes de compra desde panel',
    author_uid: authorUid ?? null,
    before: existing,
    after: invoiceRow(input),
  });
  return true;
}

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

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Unidades, total y llegada de una orden según sus líneas. */
function sumLines(lines: OrderLineAgg[]) {
  let units = 0;
  let total = 0;
  let received = 0;
  let arrivalDate: string | null = null;
  for (const line of lines) {
    const ordered = line.quantity_ordered ?? line.quantity;
    units += ordered;
    total += ordered * (Number(line.costo_china_usd ?? 0) + Number(line.impuesto_unit_usd ?? 0));
    if (line.status === 'received') {
      received += 1;
      if (line.arrival_date && (!arrivalDate || line.arrival_date > arrivalDate)) arrivalDate = line.arrival_date;
    }
  }
  return { units, total, received, arrivalDate };
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
    const { units, total, received, arrivalDate } = sums.get(row.id)!;
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
async function assertOrderNumberFree(orderNumber: string, excludeId?: string): Promise<void> {
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

// ── Líneas ──

interface PreparedLine {
  productName: string;
  category: string | null;
  quantity: number;
  costUnit: number;
  taxUnit: number;
  link: CatalogLink | null;
}

/**
 * Valida y completa las líneas ANTES de crear nada: una línea del catálogo toma
 * el nombre que ya usan los lotes de esa variante (Ventas los agrupa por
 * nombre) y la categoría del producto.
 */
async function prepareLines(lines: PurchaseOrderLineInput[]): Promise<PreparedLine[]> {
  const prepared: PreparedLine[] = [];
  for (const line of lines) {
    const link: CatalogLink | null = line.catalogItemId
      ? { catalogItemId: line.catalogItemId, variantKey: line.variantKey ?? '' }
      : null;
    const fromCatalog = link ? await nameForVariant(link) : null;
    prepared.push({
      productName: fromCatalog?.productName ?? line.productName.trim(),
      category: line.category || fromCatalog?.categoryId || null,
      quantity: line.quantity,
      costUnit: line.costUnit,
      taxUnit: line.taxUnit,
      link,
    });
  }
  return prepared;
}

/**
 * Inserta las líneas de una orden con códigos GS-IN correlativos. Si otra
 * compra tomó los mismos códigos en el mismo momento (choque de `code`
 * único), se vuelven a pedir y se reintenta.
 */
async function insertLines(
  order: { id: string; orderNumber: string; purchaseDate: string },
  lines: PreparedLine[],
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const codes = await nextPurchaseCodes(lines.length);
    const rows = lines.map((line, i) => ({
      code: codes[i],
      lot: order.orderNumber,
      order_id: order.id,
      product_name: line.productName,
      category: line.category,
      purchase_date: order.purchaseDate,
      quantity: line.quantity,
      costo_china_usd: line.costUnit,
      impuesto_unit_usd: line.taxUnit,
      status: 'china',
      catalog_item_id: line.link?.catalogItemId ?? null,
      variant_key: line.link ? line.link.variantKey : null,
    }));

    let { error } = await db.from('purchases').insert(rows);
    // Sin la migración 0022 no existen las columnas del vínculo con el
    // catálogo: las líneas se guardan igual, con el nombre del catálogo.
    if (isMissingColumn(error)) {
      const plain = rows.map(({ catalog_item_id: _c, variant_key: _v, ...rest }) => rest);
      ({ error } = await db.from('purchases').insert(plain));
    }
    if (isUniqueViolation(error)) continue;
    if (error) throw error;
    return;
  }
  throw new BadRequestError('No se pudieron asignar los códigos de las líneas. Probá de nuevo.');
}

async function audit(entityId: string, action: string, authorUid: string | undefined, before: unknown, after: unknown) {
  await db.from('audit_logs').insert({
    entity: 'purchase_orders',
    entity_id: entityId,
    action,
    reason: 'Órdenes de compra desde panel',
    author_uid: authorUid ?? null,
    before: before ?? null,
    after: after ?? null,
  });
}

export async function createPurchaseOrder(input: NewPurchaseOrderInput, authorUid?: string): Promise<PurchaseOrder> {
  await requireOrdersTable();
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  await assertOrderNumberFree(orderNumber);
  if (input.newInvoice) await assertInvoiceNumberFree(input.newInvoice.invoiceNumber);
  const prepared = await prepareLines(input.lines);
  const supplierId = await resolveSupplierId(input.supplierId, input.newSupplier);
  const invoiceId = await resolveInvoiceId(input.invoiceId, input.newInvoice, authorUid);

  const { data: order, error } = await db
    .from('purchase_orders')
    .insert({
      order_number: orderNumber,
      purchase_date: input.purchaseDate,
      supplier_id: supplierId ?? null,
      invoice_id: invoiceId ?? null,
      package_photos: input.packagePhotos ?? [],
      notes: input.notes ?? '',
      created_by: authorUid ?? null,
    })
    .select('id')
    .single();
  if (error) {
    // Una factura nueva que no llegó a tener orden no queda suelta.
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    if (isUniqueViolation(error)) {
      throw new BadRequestError(`La orden ${orderNumber} ya está registrada: elegila para agregarle el producto.`);
    }
    throw error;
  }

  try {
    await insertLines({ id: order.id as string, orderNumber, purchaseDate: input.purchaseDate }, prepared);
  } catch (err) {
    // Sin líneas la orden no sirve: se borra para que se pueda volver a cargar.
    await db.from('purchase_orders').delete().eq('id', order.id);
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    throw err;
  }

  const created = await getPurchaseOrder(order.id as string);
  if (!created) throw new Error('La orden se creó pero no se pudo leer de vuelta.');
  await audit(created.id, 'create', authorUid, null, { ...created, lines: input.lines });
  return created;
}

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  authorUid?: string,
): Promise<PurchaseOrder | null> {
  await requireOrdersTable();
  const { data: existing, error: fetchError } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return null;

  // Guardar desde el panel confirma el número: deja de ser provisional y pasa
  // a contar para la regla de "no registrar dos veces la misma orden".
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  await assertOrderNumberFree(orderNumber, id);

  const patch: Record<string, unknown> = {
    order_number: orderNumber,
    number_provisional: false,
    purchase_date: input.purchaseDate,
  };
  if (input.newInvoice) await assertInvoiceNumberFree(input.newInvoice.invoiceNumber);
  const supplierId = await resolveSupplierId(input.supplierId, input.newSupplier);
  if (supplierId !== undefined) patch.supplier_id = supplierId;
  const invoiceId = await resolveInvoiceId(input.invoiceId, input.newInvoice, authorUid);
  if (invoiceId !== undefined) patch.invoice_id = invoiceId;
  if (input.packagePhotos !== undefined) patch.package_photos = input.packagePhotos;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await db.from('purchase_orders').update(patch).eq('id', id);
  if (error) {
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    if (isUniqueViolation(error)) throw new BadRequestError(`La orden ${orderNumber} ya está registrada.`);
    throw error;
  }
  // La factura que dejó de usar, si no la usa otra orden.
  if (invoiceId !== undefined && existing.invoice_id && existing.invoice_id !== invoiceId) {
    await dropInvoiceIfUnused(existing.invoice_id);
  }

  // Las líneas llevan el número y la fecha de su orden.
  const linePatch: Record<string, unknown> = {};
  if (orderNumber !== existing.order_number) linePatch.lot = orderNumber;
  if (input.purchaseDate !== existing.purchase_date) linePatch.purchase_date = input.purchaseDate;
  if (Object.keys(linePatch).length) {
    const { error: linesError } = await db.from('purchases').update(linePatch).eq('order_id', id);
    if (linesError) throw linesError;
  }

  const updated = await getPurchaseOrder(id);
  await audit(id, 'update', authorUid, existing, updated);
  return updated;
}

export async function addPurchaseOrderLines(
  id: string,
  input: AddPurchaseOrderLinesInput,
  authorUid?: string,
): Promise<PurchaseOrder | null> {
  await requireOrdersTable();
  const { data: order, error } = await db
    .from('purchase_orders')
    .select('id, order_number, purchase_date')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const prepared = await prepareLines(input.lines);
  await insertLines(
    { id: order.id as string, orderNumber: order.order_number as string, purchaseDate: order.purchase_date as string },
    prepared,
  );
  const updated = await getPurchaseOrder(id);
  await audit(id, 'add_lines', authorUid, null, { lines: input.lines });
  return updated;
}

/** Solo una orden sin líneas: las líneas se borran una por una (con sus reglas). */
export async function deletePurchaseOrder(id: string, authorUid?: string): Promise<boolean> {
  await requireOrdersTable();
  const { data: existing, error } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!existing) return false;

  const { count, error: countError } = await db
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new BadRequestError(`La orden tiene ${count} producto(s). Eliminalos primero.`);
  }

  const { error: deleteError } = await db.from('purchase_orders').delete().eq('id', id);
  if (deleteError) throw deleteError;
  await dropInvoiceIfUnused(existing.invoice_id);
  await audit(id, 'delete', authorUid, existing, null);
  return true;
}

/**
 * Una foto del empaque, leída del bucket por el servidor para entregarla como
 * descarga. El navegador no puede bajarla directo del bucket (otro dominio,
 * sin CORS), y el agente en Nicaragua necesita los archivos, no un enlace.
 * Solo se sirven fotos guardadas en la orden y alojadas en nuestro bucket.
 */
export async function getPackagePhoto(
  orderId: string,
  index: number,
): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
  await requireOrdersTable();
  const { data, error } = await db
    .from('purchase_orders')
    .select('order_number, package_photos')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const url = toStringArray(data.package_photos)[index];
  if (!url || !isStorageUrl(url)) return null;

  const response = await fetch(url);
  if (!response.ok) throw new BadRequestError('No se pudo leer la foto del almacenamiento.');
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const safeNumber = String(data.order_number).replace(/[^A-Za-z0-9-]/g, '');
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType,
    filename: `orden-${safeNumber}-foto-${index + 1}.${ext}`,
  };
}

// ============================================================================
// ── Recibir en Nicaragua ──
// ============================================================================

interface ReceiptLineRow {
  id: string;
  order_id: string;
  code: string;
  product_name: string;
  status: string;
  quantity: number;
  quantity_sold: number;
  quantity_reserved: number;
  costo_china_usd: number | string | null;
  impuesto_unit_usd: number | string | null;
  suggested_price: number | string | null;
}

interface ReceiptPlanLine {
  purchaseId: string;
  orderId: string;
  code: string;
  productName: string;
  ordered: number;
  received: number;
  salePrice?: number;
  previousSuggestedPrice: number | null;
  costing: PurchaseCosting;
}

interface ReceiptPlan {
  lines: ReceiptPlanLine[];
  totalUnits: number;
  shippingUnit: number;
  exchangeRate: number;
}

/** La orden de la ruta más las que llegaron en el mismo envío, sin repetir. */
function receiptOrderIds(orderId: string, extra: string[] | undefined): string[] {
  return [...new Set([orderId, ...(extra ?? [])])];
}

/**
 * Valida lo que se va a recibir y calcula el costo de cada línea. El envío
 * total se divide entre TODAS las unidades recibidas en esta llegada, de
 * todas las órdenes del envío.
 */
async function planReceipt(orderIds: string[], input: SimulatePurchaseOrderReceiptInput): Promise<ReceiptPlan> {
  await requireOrdersTable();
  const { data: rows, error } = await db
    .from('purchases')
    .select('id, order_id, code, product_name, status, quantity, quantity_sold, quantity_reserved, costo_china_usd, impuesto_unit_usd, suggested_price')
    .in('order_id', orderIds);
  if (error) throw error;
  const byId = new Map(((rows ?? []) as ReceiptLineRow[]).map((row) => [row.id, row]));
  if (byId.size === 0) throw new BadRequestError('La orden no existe o no tiene productos.');

  const seen = new Set<string>();
  for (const line of input.lines) {
    const row = byId.get(line.purchaseId);
    if (!row) throw new BadRequestError('Uno de los productos no pertenece a las órdenes de este envío.');
    if (seen.has(line.purchaseId)) throw new BadRequestError(`${row.code} viene repetido.`);
    seen.add(line.purchaseId);
    if (row.status === 'received') throw new BadRequestError(`${row.code} ya fue recibido.`);
    const committed = row.quantity_sold + row.quantity_reserved;
    if (line.receivedQuantity < committed) {
      throw new BadRequestError(`${row.code} ya tiene ${committed} unidad(es) apartadas: no puede recibir menos.`);
    }
  }

  const totalUnits = input.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const shippingUnit = totalUnits > 0 ? round(input.shippingTotalUsd / totalUnits, 4) : 0;
  const config = await getFinancialConfig();
  const exchangeRate = input.exchangeRate ?? config.exchangeRate;

  const lines = input.lines.map((line): ReceiptPlanLine => {
    const row = byId.get(line.purchaseId)!;
    return {
      purchaseId: row.id,
      orderId: row.order_id,
      code: row.code,
      productName: row.product_name,
      ordered: row.quantity,
      received: line.receivedQuantity,
      salePrice: line.salePrice,
      previousSuggestedPrice: row.suggested_price == null ? null : Number(row.suggested_price),
      costing: costPurchaseOnArrival(
        {
          quantity: line.receivedQuantity,
          costoChinaUsd: Number(row.costo_china_usd ?? 0),
          impuestoUnitUsd: Number(row.impuesto_unit_usd ?? 0),
          envioUnitUsd: shippingUnit,
          exchangeRate,
        },
        config,
      ),
    };
  });

  return { lines, totalUnits, shippingUnit, exchangeRate };
}

export interface ReceiptPreview {
  totalUnits: number;
  shippingUnit: number;
  exchangeRate: number;
  lines: {
    purchaseId: string;
    code: string;
    productName: string;
    ordered: number;
    received: number;
    costoRealCs: number;
    costeFinal: number;
    precioSugerido: number;
  }[];
}

/** Lo que costaría cada línea con este envío y tasa, sin guardar nada. */
export async function simulatePurchaseOrderReceipt(
  orderId: string,
  input: SimulatePurchaseOrderReceiptInput,
): Promise<ReceiptPreview> {
  const plan = await planReceipt(receiptOrderIds(orderId, input.extraOrderIds), input);
  return {
    totalUnits: plan.totalUnits,
    shippingUnit: plan.shippingUnit,
    exchangeRate: plan.exchangeRate,
    lines: plan.lines.map((line) => ({
      purchaseId: line.purchaseId,
      code: line.code,
      productName: line.productName,
      ordered: line.ordered,
      received: line.received,
      costoRealCs: line.costing.costoRealCs,
      costeFinal: line.costing.costeFinal,
      precioSugerido: line.costing.precioSugerido,
    })),
  };
}

/**
 * Pasa a bodega las líneas recibidas, con el costeo completo y la tasa
 * congelada (regla de oro #4), igual que la recepción de un lote suelto. Si
 * llegó otra cantidad, la línea queda con lo recibido y guarda lo pedido en
 * `quantity_ordered`. Cada UPDATE exige que la línea siga en tránsito (dos
 * personas no pueden recibirla dos veces); si una falla, se deshacen las
 * anteriores.
 */
export async function receivePurchaseOrder(
  orderId: string,
  input: ReceivePurchaseOrderInput,
  authorUid?: string,
): Promise<{ received: number; shippingUnit: number; exchangeRate: number }> {
  const orderIds = receiptOrderIds(orderId, input.extraOrderIds);
  const plan = await planReceipt(orderIds, input);
  const done: ReceiptPlanLine[] = [];

  try {
    for (const line of plan.lines) {
      const { costing } = line;
      const { data, error } = await db
        .from('purchases')
        .update({
          status: 'received',
          arrival_date: input.arrivalDate,
          envio_unit_usd: plan.shippingUnit,
          exchange_rate: plan.exchangeRate,
          costo_real_usd: costing.costoRealUsd,
          costo_real_cs: costing.costoRealCs,
          costo_f_u: costing.costoFU,
          coste_final: costing.costeFinal,
          suggested_price: line.salePrice ?? costing.precioSugerido,
          quantity: line.received,
          quantity_ordered: line.received === line.ordered ? null : line.ordered,
        })
        .eq('id', line.purchaseId)
        .eq('status', 'china')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new BadRequestError(`${line.code} ya fue recibido por otra persona. Recargá la página.`);
      }
      done.push(line);
    }
  } catch (err) {
    for (const line of done) {
      await db
        .from('purchases')
        .update({
          status: 'china',
          arrival_date: null,
          envio_unit_usd: 0,
          exchange_rate: null,
          costo_real_usd: null,
          costo_real_cs: null,
          costo_f_u: null,
          coste_final: null,
          suggested_price: line.previousSuggestedPrice,
          quantity: line.ordered,
          quantity_ordered: null,
        })
        .eq('id', line.purchaseId);
    }
    throw err;
  }

  // Una entrada por orden, con sus líneas y el envío completo del que formó parte.
  for (const id of orderIds) {
    const lines = plan.lines.filter((l) => l.orderId === id);
    if (lines.length === 0) continue;
    await audit(id, 'receive', authorUid, null, {
      arrivalDate: input.arrivalDate,
      shippingTotalUsd: input.shippingTotalUsd,
      shippingUnit: plan.shippingUnit,
      exchangeRate: plan.exchangeRate,
      shipmentOrderIds: orderIds,
      lines: lines.map((l) => ({ code: l.code, ordered: l.ordered, received: l.received, salePrice: l.salePrice ?? l.costing.precioSugerido })),
    });
  }

  return { received: done.length, shippingUnit: plan.shippingUnit, exchangeRate: plan.exchangeRate };
}
