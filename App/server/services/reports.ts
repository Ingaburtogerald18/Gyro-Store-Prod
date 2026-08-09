import { z } from 'zod';
import { db } from '../supabase';
import { parseDbRows } from '../utils/parseDbRows';
import { buildPage, type PaginationParams, type PaginatedResult } from '../utils/pagination';

// ============================================================================
// ── Esquemas Zod (Contratos) ──
// ============================================================================

// DTO público que no fuga detalles internos innecesarios si no es requerido.
// Como estos son reportes de admin, mostramos la utilidad y costes porque
// el admin/staff autorizado sí debe verlos.
const kpiSchema = z.object({
  total_ventas: z.number(),
  total_unidades: z.number(),
  total_vendido: z.number(),
  coste_total: z.number(),
  comision_total: z.number(),
  ganancia_tienda_total: z.number(),
  salary_acumulado: z.number(),
  // JSON con los montos recaudados por pozo a partir del coste F/U
  pozos_recogidos: z.record(z.string(), z.number()),

  // ── Periodo inmediatamente anterior, de igual duración (0017) ──
  // Es lo que convierte un dato en un reporte: sin comparación, "C$1.4M" no
  // dice si el mes fue bueno. Vienen en 0 cuando el rango es abierto (no hay
  // "anterior" que calcular) — el front muestra "—" en ese caso.
  total_ventas_prev: z.number(),
  total_unidades_prev: z.number(),
  total_vendido_prev: z.number(),
  coste_total_prev: z.number(),
  comision_total_prev: z.number(),
  ganancia_tienda_total_prev: z.number()
});

export type FinancialKPIs = z.infer<typeof kpiSchema>;

const lossRowSchema = z.object({
  id: z.string().uuid(),
  category: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().nullable(),
  costo_cs: z.number().nullable(),
  reason: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string()
});

export type LossItem = z.infer<typeof lossRowSchema>;

// ── Reportería de ventas (los RPCs viven en database/01_schema.sql) ──
// Un schema por RPC. Los `numeric` de Postgres llegan como number por PostgREST
// (igual que en `kpiSchema`), así que no hace falta coerción.

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

// ── Drilldown (`get_sales_ledger` / `get_delivery_invoices`) ──
// Las FILAS detrás de cada KPI, para poder auditar de dónde salió el número
// sin salir de la pantalla.

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

// ============================================================================
// ── Servicios ──
// ============================================================================

/**
 * Retorna los KPIs financieros (ventas, utilidad, comisiones, pozos).
 *
 * NOTA: Para calcular esto "con SQL puro (no agregados en memoria)" como exige
 * el Hito 4, se debe crear una función RPC (`get_financial_kpis`) en una
 * migración SQL futura (ej. `0011_reports_rpc.sql`). El cliente de Supabase
 * JS no soporta agregaciones complejas (SUM, GROUP BY JSON) al vuelo.
 */
export async function getFinancialKPIs(
  startDate?: string,
  endDate?: string,
  sellerUid?: string
): Promise<FinancialKPIs> {
  // Llama al RPC (SQL puro en el server Postgres)
  const { data, error } = await db.rpc('get_financial_kpis', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_seller_uid: sellerUid ?? null
  }).single();

  if (error) {
    throw error;
  }

  const parsed = parseDbRows(kpiSchema, [data], 'getFinancialKPIs');
  return parsed[0]!;
}

/**
 * Retorna el historial de pérdidas (losses) paginado.
 */
export async function listLosses(params: PaginationParams): Promise<PaginatedResult<LossItem>> {
  let query = db
    .from('losses')
    .select('id, category, sku, quantity, costo_cs, reason, created_by, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(params.limit + 1);

  if (params.cursorData) {
    // Paginación por cursor
    query = query.lt('created_at', params.cursorData.createdAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const parsed = parseDbRows(lossRowSchema, data, 'listLosses');
  
  return buildPage(parsed, params.limit);
}

/**
 * Exportación plana de ventas.
 * Se apoya en una vista SQL (`sales_export_view`) para resolver JOINS
 * complejos en SQL puro y no en memoria.
 */
export async function exportSales(startDate?: string, endDate?: string) {
  let query = db.from('sales_export_view').select('*');
  
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  
  const { data, error } = await query;
  if (error) throw error;
  
  return data;
}

/**
 * Obtiene los "gastos por pozo".
 * 
 * NOTA DE ARQUITECTURA: Actualmente en el schema (0003 y 0004) existe cómo 
 * rastrear los INGRESOS a los pozos (columna `pozos` jsonb en `order_items`),
 * pero FALTA la tabla `expenses` (gastos operativos) que permita registrar 
 * el dinero EXTRAÍDO/GASTADO de dichos pozos. 
 * Esta función asume la existencia futura de una tabla `expenses` o RPC
 * `get_expenses_by_pozo`.
 */
export async function getExpensesByPozo(startDate?: string, endDate?: string) {
  const { data, error } = await db.rpc('get_expenses_by_pozo', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null
  });

  if (error) throw error;
  return data;
}

// ============================================================================
// ── Reportería de ventas ──
// ============================================================================
// Todas se apoyan en los RPC de `0002_functions.sql`: la agregación pasa en
// Postgres y acá solo se valida la forma de lo que volvió.

/**
 * Serie temporal de ventas para el gráfico de tendencia.
 * `sellerUid` recorta a un vendedor (la ruta lo fuerza para los no-admin).
 */
export async function getSalesTrend(
  startDate?: string,
  endDate?: string,
  bucket: TrendBucket = 'month',
  sellerUid?: string,
): Promise<SalesTrendPoint[]> {
  const { data, error } = await db.rpc('get_sales_trend', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_bucket: bucket,
    p_seller_uid: sellerUid ?? null,
  });

  if (error) throw error;
  return parseDbRows(trendRowSchema, data, 'getSalesTrend');
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
  return parseDbRows(topProductRowSchema, data, 'getTopProducts');
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
  return parsed[0]!;
}

/**
 * Delivery pagado en TODAS las facturas del periodo (las anuladas incluidas:
 * anular el papel no devuelve el envío) y su reparto por repartidor. Solo
 * admin: es plata de la tienda, no de la venta de nadie en particular.
 */
/**
 * Una fila por venta aprobada/pagada, con vendido, coste, comisión y ganancia
 * en la MISMA fila.
 *
 * Los pop-ups de Total Vendido, Coste y Ganancia miran este mismo dataset y
 * solo cambian qué columna imprimen: tres RPCs separados serían tres viajes y
 * tres escaneos de `orders` para listar lo mismo.
 *
 * SENSIBLE: incluye la estructura de costos. Solo admin (ver routes/reports.ts).
 */
export async function getSalesLedger(
  startDate?: string,
  endDate?: string,
  sellerUid?: string,
): Promise<SalesLedgerRow[]> {
  const { data, error } = await db.rpc('get_sales_ledger', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_seller_uid: sellerUid ?? null,
  });

  if (error) throw error;
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
