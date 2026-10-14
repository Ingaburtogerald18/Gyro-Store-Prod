// Reportería de ventas sobre las funciones SQL: tendencia, vendedores, más vendidos,
// desglose, delivery, libro de ventas y exportación.
import { z } from 'zod';
import { db } from '../../core/supabase';
import { parseDbRows } from '../../utils/parse-db-rows';
import { round } from './costing';
import { businessDateStartIso, toBusinessDate } from '../../utils/business-day';
import { fetchAllRows } from '../../utils/fetch-all-rows';

// Un schema por función SQL. Los `numeric` llegan como number por PostgREST: no hace falta coerción.

const trendRowSchema = z.object({
  bucket_start: z.string(),
  total_vendido: z.number(),
  ganancia: z.number(),
  comision: z.number(),
  num_ventas: z.number(),
});

export type SalesTrendPoint = z.infer<typeof trendRowSchema>;

/** Cortes válidos de la serie temporal. La UI lo elige según el largo del rango. */
export type TrendBucket = 'day' | 'week' | 'month';

const sellerPerfRowSchema = z.object({
  seller_uid: z.string().uuid().nullable(),
  seller_email: z.string(),
  seller_name: z.string(),
  total_vendido: z.number(),
  comision: z.number(),
  num_ventas: z.number(),
  unidades: z.number(),
});

export type SellerPerformanceRow = z.infer<typeof sellerPerfRowSchema>;

const topProductRowSchema = z.object({
  sku: z.string(),
  unidades: z.number(),
  ingreso: z.number(),
  nombre: z.string().optional(),
  margen: z.number().optional(),
});

export type TopProductRow = z.infer<typeof topProductRowSchema>;

// Cada corte es la misma tripleta {key, count, total}: la UI solo traduce la
// clave a español. Así agregar un corte nuevo no cambia el contrato.
const breakdownGroupSchema = z.object({
  key: z.string(),
  count: z.number(),
  total: z.number(),
});

const salesBreakdownSchema = z.object({
  by_method: z.array(breakdownGroupSchema),
  by_origin: z.array(breakdownGroupSchema),
  by_invoiced: z.array(breakdownGroupSchema),
  by_discount: z.array(breakdownGroupSchema),
  by_installment: z.array(breakdownGroupSchema),
});

export type SalesBreakdown = z.infer<typeof salesBreakdownSchema>;

const deliverySummarySchema = z.object({
  total_delivery: z.number(),
  num_deliveries: z.number(),
  /** Parte del total que corresponde a facturas anuladas (va incluida arriba). */
  total_anulado: z.number(),
  num_anuladas: z.number(),
  by_repartidor: z.array(
    z.object({
      repartidor: z.string(),
      total: z.number(),
      count: z.number(),
    }),
  ),
});

export type DeliverySummary = z.infer<typeof deliverySummarySchema>;

// Las filas detrás de cada KPI, para auditar el número sin salir de la pantalla.

const salesLedgerRowSchema = z.object({
  order_id: z.string().uuid(),
  created_at: z.string(),
  /** `contacts.name`, o el teléfono si nadie cargó el contacto. */
  cliente: z.string().nullable(),
  /** El código impreso (`GS-PR-12`). Null si la venta no se facturó. */
  invoice_number: z.string().nullable(),
  total_vendido: z.number(),
  coste: z.number(),
  comision: z.number(),
  ganancia: z.number(),
});

export type SalesLedgerRow = z.infer<typeof salesLedgerRowSchema>;

const deliveryInvoiceRowSchema = z.object({
  invoice_number: z.string().nullable(),
  delivery_fee: z.number(),
  delivery_name: z.string().nullable(),
  created_at: z.string(),
});

export type DeliveryInvoiceRow = z.infer<typeof deliveryInvoiceRowSchema>;

/** Exportación plana de ventas sobre la vista `sales_export_view`. */
export async function exportSales(startDate?: string, endDate?: string) {
  let query = db.from('sales_export_view').select('*');
  
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  
  const { data, error } = await query;
  if (error) throw error;
  
  return data;
}

/**
 * Serie para el gráfico de tendencia, cortada en hora de Nicaragua: `get_sales_trend` corta en UTC y
 * pasaba las ventas desde las 18:00 al día siguiente. Por eso se agrupan acá las filas del libro.
 */
export async function getSalesTrend(
  startDate?: string,
  endDate?: string,
  bucket: TrendBucket = 'month',
  sellerUid?: string,
): Promise<SalesTrendPoint[]> {
  const raw = await fetchAllRows((from, to) =>
    db
      .rpc('get_sales_ledger', {
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
        p_seller_uid: sellerUid ?? null,
      })
      .order('created_at', { ascending: true })
      .order('order_id', { ascending: true })
      .range(from, to),
  );
  const rows = parseDbRows(salesLedgerRowSchema, raw, 'getSalesTrend');

  const byBucket = new Map<string, SalesTrendPoint>();
  for (const row of rows) {
    const key = bucketDate(toBusinessDate(row.created_at), bucket);
    const point = byBucket.get(key) ?? { bucket_start: businessDateStartIso(key), total_vendido: 0, ganancia: 0, comision: 0, num_ventas: 0 };
    point.total_vendido += row.total_vendido;
    point.ganancia += row.ganancia;
    point.comision += row.comision;
    point.num_ventas += 1;
    byBucket.set(key, point);
  }

  return [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, p]) => ({
      ...p,
      total_vendido: round(p.total_vendido, 2),
      ganancia: round(p.ganancia, 2),
      comision: round(p.comision, 2),
    }));
}

/** Inicio del corte que contiene la fecha local `date` (semana = lunes, como `date_trunc`). */
function bucketDate(date: string, bucket: TrendBucket): string {
  if (bucket === 'month') return `${date.slice(0, 8)}01`;
  if (bucket === 'week') {
    const d = new Date(`${date}T00:00:00.000Z`);
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - sinceMonday * 86_400_000).toISOString().slice(0, 10);
  }
  return date;
}

/**
 * Ranking del equipo de ventas. Es un reporte COMPARATIVO entre vendedores, así
 * que no admite recorte por vendedor: o se ve entero (admin) o no se ve.
 */
export async function getSellerPerformance(
  startDate?: string,
  endDate?: string,
): Promise<SellerPerformanceRow[]> {
  const { data, error } = await db.rpc('get_seller_performance', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) throw error;
  return parseDbRows(sellerPerfRowSchema, data, 'getSellerPerformance');
}

/** Productos más vendidos del periodo, ordenados por ingreso. */
export async function getTopProducts(
  startDate?: string,
  endDate?: string,
  sellerUid?: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const { data, error } = await db.rpc('get_top_products', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_seller_uid: sellerUid ?? null,
    p_limit: limit,
  });

  if (error) throw error;
  const parsed = parseDbRows(topProductRowSchema, data, 'getTopProducts');
  if (parsed.length === 0) return parsed;

  const skus = parsed.map((p) => p.sku);

  // 1. Nombres desde purchases
  const nameMap = new Map<string, string>();
  try {
    const { data: purchases } = await db
      .from('purchases')
      .select('code, product_name')
      .in('code', skus);

    if (purchases) {
      for (const p of purchases) {
        if (p.code && p.product_name) {
          nameMap.set(p.code, p.product_name);
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }

  // 2. Margen calculado a partir de order_items en el periodo
  const costMap = new Map<string, { totalCost: number; totalRevenue: number }>();
  try {
    const items = await fetchAllRows((from, to) => {
      let itemsQuery = db
        .from('order_items')
        .select('sku, quantity, precio_unit, coste_final_snap, orders!inner(status, created_at, seller_uid)')
        .in('sku', skus)
        .in('orders.status', ['approved', 'paid']);
      if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
      if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);
      if (sellerUid) itemsQuery = itemsQuery.eq('orders.seller_uid', sellerUid);
      return itemsQuery.order('id').range(from, to);
    });
    {
      for (const item of items) {
        const key = item.sku;
        if (!key) continue;
        const current = costMap.get(key) || { totalCost: 0, totalRevenue: 0 };
        const qty = item.quantity || 1;
        const cost = (item.coste_final_snap || 0) * qty;
        const rev = (item.precio_unit || 0) * qty;
        current.totalCost += cost;
        current.totalRevenue += rev;
        costMap.set(key, current);
      }
    }
  } catch (err) {
    // Non-fatal
  }

  return parsed.map((p) => {
    const costInfo = costMap.get(p.sku);
    let margen: number | undefined = undefined;
    if (costInfo && costInfo.totalRevenue > 0) {
      margen = Math.round(((costInfo.totalRevenue - costInfo.totalCost) / costInfo.totalRevenue) * 1000) / 10;
    }
    // Sin costo registrado no hay margen: no se inventa uno de referencia.

    const nombre = nameMap.get(p.sku) || p.sku;
    return {
      ...p,
      nombre,
      margen,
    };
  });
}

/**
 * Los cinco cortes del periodo (método de pago, origen, facturación, código de
 * descuento y cuotas) en un solo viaje: el RPC devuelve un jsonb, no filas.
 */
export async function getSalesBreakdown(
  startDate?: string,
  endDate?: string,
  sellerUid?: string,
): Promise<SalesBreakdown> {
  const { data, error } = await db.rpc('get_sales_breakdown', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_seller_uid: sellerUid ?? null,
  });

  if (error) throw error;

  // `parseDbRows` espera un array; acá el RPC devuelve un único objeto, así que
  // se envuelve para reusar el mismo manejo de "la base devolvió algo raro".
  const parsed = parseDbRows(salesBreakdownSchema, [data], 'getSalesBreakdown');
  return withoutDelivery(parsed[0]!, startDate, endDate, sellerUid);
}

/**
 * El RPC suma `orders.total`, que en una venta facturada incluye el delivery; el total vendido no lo
 * lleva, así que se resta el delivery de sus facturas vigentes.
 */
async function withoutDelivery(
  breakdown: SalesBreakdown,
  startDate?: string,
  endDate?: string,
  sellerUid?: string,
): Promise<SalesBreakdown> {
  const invoices = await fetchAllRows((from, to) => {
    let q = db
      .from('invoices')
      .select('sale_id, method, discount_code, delivery_fee, orders!inner(status, created_at, sale_origin, seller_uid)')
      .neq('status', 'void')
      .gt('delivery_fee', 0)
      .not('sale_id', 'is', null)
      .in('orders.status', ['approved', 'paid']);
    if (startDate) q = q.gte('orders.created_at', startDate);
    if (endDate) q = q.lte('orders.created_at', endDate);
    if (sellerUid) q = q.eq('orders.seller_uid', sellerUid);
    return q.order('id').range(from, to);
  });
  if (invoices.length === 0) return breakdown;

  const saleIds = invoices.map((i) => i.sale_id as string);
  const { data: cuotas, error } = await db.from('installments').select('order_id').in('order_id', saleIds);
  if (error) throw error;
  const enCuotas = new Set((cuotas ?? []).map((c) => c.order_id));

  const restar = (groups: SalesBreakdown['by_method'], key: string, fee: number) => {
    const g = groups.find((x) => x.key === key);
    if (g) g.total = round(g.total - fee, 2);
  };
  for (const inv of invoices) {
    const fee = Number(inv.delivery_fee) || 0;
    const order = Array.isArray(inv.orders) ? inv.orders[0] : inv.orders;
    restar(breakdown.by_method, inv.method ?? 'sin_metodo', fee);
    restar(breakdown.by_origin, String(order?.sale_origin ?? ''), fee);
    restar(breakdown.by_invoiced, 'con_factura', fee);
    restar(breakdown.by_discount, inv.discount_code && String(inv.discount_code).trim() ? 'con_codigo' : 'sin_codigo', fee);
    restar(breakdown.by_installment, enCuotas.has(inv.sale_id) ? 'a_cuotas' : 'contado', fee);
  }
  return breakdown;
}

/**
 * Una fila por venta con vendido, coste, comisión y ganancia: los detalles de cada KPI usan el mismo
 * dataset. Incluye costos: solo admin.
 */
export async function getSalesLedger(
  startDate?: string,
  endDate?: string,
  sellerUid?: string,
): Promise<SalesLedgerRow[]> {
  const data = await fetchAllRows((from, to) =>
    db
      .rpc('get_sales_ledger', {
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
        p_seller_uid: sellerUid ?? null,
      })
      .order('created_at', { ascending: false })
      .order('order_id', { ascending: false })
      .range(from, to),
  );
  return parseDbRows(salesLedgerRowSchema, data, 'getSalesLedger');
}

/** Facturas con envío del periodo, una por fila (pop-up del banner). */
export async function getDeliveryInvoices(
  startDate?: string,
  endDate?: string,
): Promise<DeliveryInvoiceRow[]> {
  const { data, error } = await db.rpc('get_delivery_invoices', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) throw error;
  return parseDbRows(deliveryInvoiceRowSchema, data, 'getDeliveryInvoices');
}

// Delivery de todas las facturas del periodo, también las anuladas: anular el papel no devuelve
// el envío. Solo admin: es plata de la tienda.
export async function getDeliverySummary(
  startDate?: string,
  endDate?: string,
): Promise<DeliverySummary> {
  const { data, error } = await db
    .rpc('get_delivery_summary', {
      p_start_date: startDate ?? null,
      p_end_date: endDate ?? null,
    })
    .single();

  if (error) throw error;

  const parsed = parseDbRows(deliverySummarySchema, [data], 'getDeliverySummary');
  return parsed[0]!;
}
