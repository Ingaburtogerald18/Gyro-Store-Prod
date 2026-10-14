// Lectura de ventas: listado y detalle.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { formatInvoiceCode } from '../invoices/invoices';
import { fetchAllRows } from '../../utils/fetch-all-rows';
import { isBelowMinMargin } from './sales-helpers';

// ── Listado ──

export interface SaleListItem {
  id: string;
  status: string;
  saleOrigin: string;
  sellerUid: string | null;
  sellerEmail: string;
  /** Nombre registrado en `profiles`. Vacío si la cuenta nunca lo completó. */
  sellerName: string;
  weekOf: string | null;
  phone: string | null;
  total: number;
  /** Suma de `order_items.salary` (Fondo de Empresa, 20% de utilidad bruta). */
  totalSalary: number;
  /** Suma de `order_items.comision` de TODAS las líneas de la venta. */
  totalComision: number;
  /** Suma de `order_items.ganancia_tienda`. `modules/sales/sales-routes.ts` la recorta para no-admins. */
  totalGananciaTienda: number;
  /** Correlativo de la factura con que se registró la venta (`invoices.sale_id`). Null si no tiene. */
  invoiceNumber: number | null;
  /** Código legible de esa factura: `GS-PR-12`. Null si no tiene. */
  invoiceCode: string | null;
  /** Costo de envío si la venta tiene factura con delivery. 0 si no tiene. */
  deliveryFee: number;
  createdAt: string;
  isManualDate?: boolean;
  /** Alguna línea quedó por debajo del margen mínimo. Solo admin: la ruta lo recorta. */
  belowMinMargin?: boolean;
}

/**
 * Una venta con sus líneas y la cadena financiera tal como quedó congelada: el detalle muestra
 * lo que pasó ese día, no lo que pasaría hoy.
 */
export interface SaleWithItems extends SaleListItem {
  items: {
    productName: string;
    quantity: number;
    salePrice: number;
    /** Costo de una unidad. Solo para admin: la ruta lo recorta. */
    costeFinalSnap?: number;
    /** Costo de TODAS las unidades de la línea. */
    costoTotal?: number;
    utilidadBruta?: number;
    salary?: number;
    utilidadNeta?: number;
    comision?: number;
    /** Tramo aplicado, solo para admin: con `comision` permite despejar el costo. */
    comisionPercent?: number;
    gananciaTienda?: number;
    /** El reparto del Costo F/U de esta línea en los 7 pozos (Docs/03-Finanzas.md §2). */
    pozos?: Record<string, number>;
    /** Precio por debajo del margen mínimo. Solo admin: permite despejar el costo. */
    belowMinMargin?: boolean;

    // La cadena por unidad, de donde sale el tramo. En la base solo están los totales.
    utilidadBrutaUnit?: number;
    salaryUnit?: number;
    utilidadNetaUnit?: number;
    comisionUnit?: number;
    gananciaTiendaUnit?: number;
  }[];
}

/**
 * Una venta con sus líneas (enlaces `?sale=<id>`, editor, notificaciones). La ruta recorta los campos
 * financieros para quien no es admin.
 */
export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  const { data: order, error } = await db
    .from('orders')
    .select('id, status, sale_origin, seller_uid, seller_email, week_of, phone, total, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  const row = order as unknown as {
    id: string;
    status: string;
    sale_origin: string;
    seller_uid: string | null;
    seller_email: string;
    week_of: string | null;
    phone: string | null;
    total: number | null;
    created_at: string;
  };

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select(
      'sku, quantity, precio_unit, coste_final_snap, utilidad_bruta, salary, utilidad_neta, comision, ganancia_tienda, pozos',
    )
    .eq('order_id', id);

  if (itemsError) throw itemsError;

  // Igual que en `listSales`: el nombre sale de una segunda query y no de un
  // embed. Un dato secundario no puede tumbar la respuesta entera.
  let sellerName = '';
  if (row.seller_uid) {
    const { data: profile } = await db
      .from('profiles')
      .select('name')
      .eq('id', row.seller_uid)
      .maybeSingle();
    if (profile?.name?.trim()) sellerName = profile.name.trim();
  }

  const itemRows = (items ?? []) as unknown as {
    sku: string | null;
    quantity: number;
    precio_unit: number | null;
    coste_final_snap: number | null;
    utilidad_bruta: number | null;
    salary: number | null;
    utilidad_neta: number | null;
    comision: number | null;
    ganancia_tienda: number | null;
    pozos: Record<string, number> | null;
  }[];

  // Factura de la venta, con segunda consulta y `limit(1)` por si hubiera más de una fila.
  let invoiceNumber: number | null = null;
  let invoiceCode: string | null = null;
  let deliveryFee = 0;
  const { data: linkedInvoices } = await db
    .from('invoices')
    .select('invoice_number, invoice_code, delivery_fee')
    .eq('sale_id', id)
    .order('invoice_number', { ascending: false })
    .limit(1);
  const linkedInvoice = (linkedInvoices ?? [])[0] as { invoice_number: number; invoice_code: string | null; delivery_fee: number | null } | undefined;
  if (linkedInvoice) {
    invoiceNumber = linkedInvoice.invoice_number;
    invoiceCode = linkedInvoice.invoice_code ?? formatInvoiceCode(linkedInvoice.invoice_number);
    deliveryFee = linkedInvoice.delivery_fee ?? 0;
  }

  const { data: manualDateLogs } = await db
    .from('audit_logs')
    .select('id')
    .eq('entity', 'orders')
    .eq('entity_id', id)
    .eq('action', 'manual_date')
    .limit(1);
  const isManualDate = Boolean(manualDateLogs && manualDateLogs.length > 0);

  const minMargin = (await getFinancialConfig()).minMarginMultiplier ?? 1.15;
  const lineBelowMin = (it: { precio_unit: number | null; coste_final_snap: number | null }) =>
    isBelowMinMargin(it.precio_unit ?? 0, it.coste_final_snap ?? 0, minMargin);

  return {
    id: row.id,
    status: row.status,
    saleOrigin: row.sale_origin,
    sellerUid: row.seller_uid,
    sellerEmail: row.seller_email,
    sellerName,
    weekOf: row.week_of,
    phone: row.phone,
    total: row.total ?? 0,
    totalSalary: itemRows.reduce((sum, it) => sum + (it.salary ?? 0), 0),
    totalComision: itemRows.reduce((sum, it) => sum + (it.comision ?? 0), 0),
    totalGananciaTienda: itemRows.reduce((sum, it) => sum + (it.ganancia_tienda ?? 0), 0),
    invoiceNumber,
    invoiceCode,
    deliveryFee,
    createdAt: row.created_at,
    isManualDate,
    belowMinMargin: itemRows.some(lineBelowMin),
    items: itemRows.map((it) => {
      const quantity = it.quantity;
      const costeFinalSnap = it.coste_final_snap ?? 0;
      const utilidadBruta = it.utilidad_bruta ?? 0;
      const salary = it.salary ?? 0;
      const utilidadNeta = it.utilidad_neta ?? 0;
      const comision = it.comision ?? 0;
      const gananciaTienda = it.ganancia_tienda ?? 0;

      // `order_items` guarda totales; los unitarios se derivan (`quantity` nunca es 0 por CHECK).
      const perUnit = (total: number) => round(total / quantity, 2);

      return {
        productName: it.sku ?? '',
        quantity,
        salePrice: it.precio_unit ?? 0,
        costeFinalSnap,
        costoTotal: round(costeFinalSnap * quantity, 2),
        utilidadBruta,
        salary,
        utilidadNeta,
        comision,
        // No hay columna de porcentaje: se despeja. 4 decimales para que 30 % se lea 0.3 y no 0.29997.
        comisionPercent: utilidadNeta > 0 ? round(comision / utilidadNeta, 4) : 0,
        gananciaTienda,
        pozos: it.pozos ?? undefined,
        belowMinMargin: lineBelowMin(it),
        utilidadBrutaUnit: perUnit(utilidadBruta),
        salaryUnit: perUnit(salary),
        utilidadNetaUnit: perUnit(utilidadNeta),
        comisionUnit: perUnit(comision),
        gananciaTiendaUnit: perUnit(gananciaTienda),
      };
    }),
  };
}

// Ids por consulta en los `.in(...)`: con cientos de ventas la URL de PostgREST se pasa de largo y
// la consulta falla. Van de a 4 tandas a la vez: en fila, miles de ventas eran decenas de esperas.
const IN_CHUNK = 150;
const IN_PARALLEL = 4;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const chunks: string[][] = [];
  for (let k = 0; k < ids.length; k += IN_CHUNK) chunks.push(ids.slice(k, k + IN_CHUNK));
  const out: T[] = [];
  for (let k = 0; k < chunks.length; k += IN_PARALLEL) {
    const results = await Promise.all(chunks.slice(k, k + IN_PARALLEL).map((chunk) => run(chunk)));
    for (const { data, error } of results) {
      if (error) throw error;
      out.push(...(data ?? []));
    }
  }
  return out;
}

// Segunda consulta en vez de embed: si PostgREST no tiene la FK en caché, se lleva puesto el listado.
async function sellerNamesByUid(sellerUids: (string | null)[]): Promise<Map<string, string>> {
  const uids = [...new Set(sellerUids.filter((id): id is string => !!id))];
  const namesByUid = new Map<string, string>();
  if (uids.length === 0) return namesByUid;
  try {
    const profiles = await inChunks<{ id: string; name: string | null }>(uids, (chunk) =>
      db.from('profiles').select('id, name').in('id', chunk) as unknown as PromiseLike<{
        data: { id: string; name: string | null }[] | null;
        error: unknown;
      }>,
    );
    for (const p of profiles) {
      if (p.name?.trim()) namesByUid.set(p.id, p.name.trim());
    }
  } catch (err) {
    console.error('[sales] No se pudieron resolver los nombres de vendedor:', err);
  }
  return namesByUid;
}

// Totales por venta. Un error acá no se traga: mostrar 0 sin aviso falseaba las métricas.
async function lineTotalsByOrder(orderIds: string[]) {
  const totals = {
    salary: new Map<string, number>(),
    comision: new Map<string, number>(),
    gananciaTienda: new Map<string, number>(),
    belowMin: new Set<string>(),
  };
  if (orderIds.length === 0) return totals;
  type ItemRow = {
    order_id: string;
    salary: number | null;
    comision: number | null;
    ganancia_tienda: number | null;
    precio_unit: number | null;
    coste_final_snap: number | null;
  };
  const [minMargin, items] = await Promise.all([
    getFinancialConfig().then((config) => config.minMarginMultiplier ?? 1.15),
    inChunks<ItemRow>(orderIds, (chunk) =>
      db
        .from('order_items')
        .select('order_id, salary, comision, ganancia_tienda, precio_unit, coste_final_snap')
        .in('order_id', chunk) as unknown as PromiseLike<{ data: ItemRow[] | null; error: unknown }>,
    ),
  ]);
  for (const it of items) {
    totals.salary.set(it.order_id, (totals.salary.get(it.order_id) ?? 0) + (it.salary ?? 0));
    totals.comision.set(it.order_id, (totals.comision.get(it.order_id) ?? 0) + (it.comision ?? 0));
    totals.gananciaTienda.set(it.order_id, (totals.gananciaTienda.get(it.order_id) ?? 0) + (it.ganancia_tienda ?? 0));
    if (isBelowMinMargin(it.precio_unit ?? 0, it.coste_final_snap ?? 0, minMargin)) totals.belowMin.add(it.order_id);
  }
  return totals;
}

// Nº de factura con que se registró cada venta (`invoices.sale_id`). Mismo criterio: si falla, se
// corta (el total sin delivery depende de esto).
async function invoicesBySale(orderIds: string[]) {
  const invoiceBySaleId = new Map<string, { number: number; code: string; deliveryFee: number }>();
  if (orderIds.length === 0) return invoiceBySaleId;
  type InvRow = { sale_id: string | null; invoice_number: number; invoice_code: string | null; delivery_fee: number | null };
  const invoices = await inChunks<InvRow>(orderIds, (chunk) =>
    db
      .from('invoices')
      .select('sale_id, invoice_number, invoice_code, delivery_fee')
      .in('sale_id', chunk) as unknown as PromiseLike<{ data: InvRow[] | null; error: unknown }>,
  );
  for (const inv of invoices) {
    if (!inv.sale_id) continue;
    invoiceBySaleId.set(inv.sale_id, {
      number: inv.invoice_number,
      code: inv.invoice_code ?? formatInvoiceCode(inv.invoice_number),
      deliveryFee: inv.delivery_fee ?? 0,
    });
  }
  return invoiceBySaleId;
}

export async function listSales(filters: {
  sellerEmail?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<SaleListItem[]> {
  // Paginado: PostgREST corta en 1000 filas sin avisar, y "Todas" o
  // "Aprobadas" pasan ese número con el tiempo.
  type OrderRow = {
    id: string;
    status: string;
    sale_origin: string;
    seller_uid: string | null;
    seller_email: string;
    week_of: string | null;
    phone: string | null;
    total: number | null;
    created_at: string;
  };
  const rows = await fetchAllRows<OrderRow>((from, to) => {
    let query = db
      .from('orders')
      .select('id, status, sale_origin, seller_uid, seller_email, week_of, phone, total, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.sellerEmail) query = query.eq('seller_email', filters.sellerEmail);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    return query.range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: unknown }>;
  });

  const orderIds = rows.map((r) => r.id);
  // Nombres, líneas y facturas no dependen entre sí: se piden a la vez.
  const [namesByUid, lines, invoiceBySaleId] = await Promise.all([
    sellerNamesByUid(rows.map((r) => r.seller_uid)),
    lineTotalsByOrder(orderIds),
    invoicesBySale(orderIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    saleOrigin: row.sale_origin,
    sellerUid: row.seller_uid,
    sellerEmail: row.seller_email,
    sellerName: (row.seller_uid && namesByUid.get(row.seller_uid)) || '',
    weekOf: row.week_of,
    phone: row.phone,
    total: row.total ?? 0,
    totalSalary: lines.salary.get(row.id) ?? 0,
    totalComision: lines.comision.get(row.id) ?? 0,
    // Solo admin: la ruta la recorta para un vendedor.
    totalGananciaTienda: lines.gananciaTienda.get(row.id) ?? 0,
    invoiceNumber: invoiceBySaleId.get(row.id)?.number ?? null,
    invoiceCode: invoiceBySaleId.get(row.id)?.code ?? null,
    deliveryFee: invoiceBySaleId.get(row.id)?.deliveryFee ?? 0,
    createdAt: row.created_at,
    belowMinMargin: lines.belowMin.has(row.id),
  }));
}
