import { z } from 'zod';
import { db } from '../supabase';
import { parseDbRows } from '../utils/parseDbRows';
import { buildPage, type PaginationParams, type PaginatedResult } from '../utils/pagination';
import { BadRequestError, NotFoundError } from '../utils/httpError';
import { round } from './finance';
import type { CreateExpenseInput, CreateLoanPaymentInput } from '../../shared/schemas';
import { getFinancialConfig } from './appConfig';
import { businessDateStartIso, toBusinessDate } from '../utils/businessDay';
import { fetchAllRows } from '../utils/fetchAllRows';

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
  ganancia_tienda_total_prev: z.number(),

  // ── Tracking de préstamos y ganancia real ──
  total_prestamos: z.number().default(0),
  total_prestamos_prev: z.number().default(0),
  budget_prestamos_disponible: z.number().default(0),
  prestamos_cubierto_por_budget: z.number().default(0),
  prestamos_de_ganancia: z.number().default(0),
  ganancia_real: z.number().default(0),
  ganancia_real_prev: z.number().default(0),
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
 * Retorna la suma de gastos asociados al pozo 'prestamos' en el rango de fechas.
 */
export async function getPrestamosPozoExpenses(
  startDate?: string,
  endDate?: string
): Promise<number> {
  let query = db.from('expenses').select('monto_cs').eq('pozo', 'prestamos');
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const total = (data || []).reduce((acc, row: any) => acc + (Number(row.monto_cs) || 0), 0);
  return round(total, 2);
}

/**
 * Calcula el budget disponible del pozo préstamos para un rango de fechas:
 * collected_prestamos (acumulado por ventas via pozos) - expenses_del_pozo_prestamos.
 * Si se provee `collectedOverride`, se utiliza en vez de consultar la base de datos.
 */
export async function getPrestamosPozoBudget(
  startDate?: string,
  endDate?: string,
  collectedOverride?: number
): Promise<{ collected: number; expenses: number; available: number }> {
  let collected = collectedOverride;
  if (collected === undefined) {
    let itemsQuery = db
      .from('order_items')
      .select('pozos, orders!inner(status, created_at)')
      .in('orders.status', ['approved', 'paid']);

    if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
    if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);

    const { data: orderItems, error: itemsError } = await itemsQuery;
    if (itemsError) throw itemsError;

    let totalCollected = 0;
    for (const it of orderItems || []) {
      if (it.pozos && typeof it.pozos === 'object') {
        totalCollected += Number((it.pozos as Record<string, any>)['prestamos']) || 0;
      }
    }
    collected = round(totalCollected, 2);
  }

  const expenses = await getPrestamosPozoExpenses(startDate, endDate);
  const available = round(collected - expenses, 2);

  return { collected, expenses, available };
}

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

  let prevStartDate: string | undefined = undefined;
  let prevEndDate: string | undefined = undefined;
  if (startDate && endDate) {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      const duration = e - s;
      prevEndDate = new Date(s).toISOString();
      prevStartDate = new Date(s - duration).toISOString();
    }
  }

  const rpcData = (data ?? {}) as Record<string, any>;
  const collectedPrestamos = round(Number(rpcData.pozos_recogidos?.prestamos || 0), 2);

  const [currentLoansTotal, prevLoansTotal, currentPrestamosBudget, prevPrestamosBudget] = await Promise.all([
    getLoanPaymentsSummary(startDate, endDate),
    prevStartDate && prevEndDate
      ? getLoanPaymentsSummary(prevStartDate, prevEndDate)
      : Promise.resolve(0),
    getPrestamosPozoBudget(startDate, endDate, collectedPrestamos),
    prevStartDate && prevEndDate
      ? getPrestamosPozoBudget(prevStartDate, prevEndDate)
      : Promise.resolve({ collected: 0, expenses: 0, available: 0 }),
  ]);

  const budgetDisponible = currentPrestamosBudget.available;
  const cubiertoPorBudget = round(
    Math.max(0, Math.min(currentLoansTotal, budgetDisponible)),
    2
  );
  const excedenteDeGanancia = round(
    Math.max(0, currentLoansTotal - cubiertoPorBudget),
    2
  );
  const gananciaReal = round(
    Number(rpcData.ganancia_tienda_total || 0) - excedenteDeGanancia,
    2
  );

  let gananciaRealPrev = 0;
  if (prevStartDate && prevEndDate) {
    const prevCubierto = round(
      Math.max(0, Math.min(prevLoansTotal, prevPrestamosBudget.available)),
      2
    );
    const prevExcedente = round(
      Math.max(0, prevLoansTotal - prevCubierto),
      2
    );
    gananciaRealPrev = round(
      Number(rpcData.ganancia_tienda_total_prev || 0) - prevExcedente,
      2
    );
  }

  const rawKPIs = {
    ...rpcData,
    total_prestamos: currentLoansTotal,
    total_prestamos_prev: prevLoansTotal,
    budget_prestamos_disponible: budgetDisponible,
    prestamos_cubierto_por_budget: cubiertoPorBudget,
    prestamos_de_ganancia: excedenteDeGanancia,
    ganancia_real: gananciaReal,
    ganancia_real_prev: gananciaRealPrev,
  };

  const parsed = parseDbRows(kpiSchema, [rawKPIs], 'getFinancialKPIs');
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

export interface ExpenseRecord {
  id: string;
  pozo: string;
  monto: number;
  montoUsd: number | null;
  exchangeRate: number | null;
  category: string;
  description: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface PozoOverflowItem {
  pozo: string;
  label: string;
  recogido: number;
  gastado: number;
  disponible: number;
  desbordamiento: number;
  gastadoMes: number;
  recogidoMes: number;
}

export interface ExpensesOverflowResult {
  pozos: PozoOverflowItem[];
  totalDesbordamiento: number;
  gananciaBruta: number;
  gananciaReal: number;
  presupuestoDisponible: number;
  totalRecogido: number;
  totalGastado: number;
  desbordamientoDetalle: { pozo: string; label: string; monto: number }[];
}

export const POZO_LABELS: Record<string, string> = {
  publicidad: 'Publicidad',
  mantenimiento: 'Mantenimiento',
  utiles: 'Útiles de Oficina',
  garantias: 'Garantías',
  prestamos: 'Préstamos',
  suscripciones: 'Suscripciones',
  servicios: 'Servicios Básicos',
  salario: 'Fondo Salario',
};

export const ALL_POZOS = [
  'publicidad',
  'mantenimiento',
  'utiles',
  'garantias',
  'prestamos',
  'suscripciones',
  'servicios',
  'salario',
] as const;

/**
 * Registra un nuevo gasto operativo en la tabla `expenses`.
 */
export async function createExpense(input: CreateExpenseInput, authorUid: string): Promise<ExpenseRecord> {
  let customCreatedAt: string | undefined = undefined;
  if (input.fecha) {
    const d = new Date(input.fecha);
    if (isNaN(d.getTime())) {
      throw new BadRequestError('Fecha de gasto inválida.');
    }
    if (d.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestError('La fecha del gasto no puede ser futura.');
    }
    customCreatedAt = d.toISOString();
  }

  let montoCs = round(input.monto, 2);
  let montoOriginalUsd: number | null = null;
  let tasaUsada: number | null = null;

  if (input.moneda === 'USD') {
    const config = await getFinancialConfig();
    tasaUsada = config.exchangeRate;
    montoOriginalUsd = montoCs;
    montoCs = round(input.monto * tasaUsada, 2);
  }

  const { data, error } = await db
    .from('expenses')
    .insert({
      pozo: input.pozo,
      monto_cs: montoCs,
      monto_usd: montoOriginalUsd,
      exchange_rate: tasaUsada,
      category: input.category,
      description: input.description?.trim() || null,
      created_by: authorUid,
      ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
    })
    .select('id, pozo, monto_cs, monto_usd, exchange_rate, category, description, created_by, created_at')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    pozo: data.pozo,
    monto: Number(data.monto_cs),
    montoUsd: data.monto_usd ? Number(data.monto_usd) : null,
    exchangeRate: data.exchange_rate ? Number(data.exchange_rate) : null,
    category: data.category ?? '',
    description: data.description,
    createdBy: data.created_by,
    createdByName: null,
    createdByEmail: null,
    createdAt: data.created_at,
  };
}

/**
 * Elimina un gasto operativo por su ID.
 */
export async function deleteExpense(id: string): Promise<{ success: boolean; id: string }> {
  const { data: existing, error: checkError } = await db
    .from('expenses')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (checkError) throw checkError;
  if (!existing) {
    throw new NotFoundError('El gasto no existe.');
  }

  const { error } = await db.from('expenses').delete().eq('id', id);
  if (error) throw error;

  return { success: true, id };
}

/**
 * Obtiene el listado detallado de gastos con paginación y filtros.
 */
export async function listExpenses(filters: {
  pozo?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ expenses: ExpenseRecord[]; total: number; page: number; pageSize: number }> {
  let query = db
    .from('expenses')
    .select('id, pozo, monto_cs, monto_usd, exchange_rate, category, description, created_by, created_at, profiles(name, email)', { count: 'exact' });

  if (filters.pozo && filters.pozo !== 'todos') {
    query = query.eq('pozo', filters.pozo);
  }
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const expenses: ExpenseRecord[] = (data || []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      pozo: row.pozo,
      monto: Number(row.monto_cs),
      montoUsd: row.monto_usd ? Number(row.monto_usd) : null,
      exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : null,
      category: row.category ?? '',
      description: row.description,
      createdBy: row.created_by,
      createdByName: profile?.name ?? null,
      createdByEmail: profile?.email ?? null,
      createdAt: row.created_at,
    };
  });

  return {
    expenses,
    total: count ?? expenses.length,
    page,
    pageSize,
  };
}

/**
 * Obtiene los "gastos por pozo" agrupados, incluyendo el pozo virtual 'salario'.
 */
export async function getExpensesByPozo(startDate?: string, endDate?: string) {
  let expensesQuery = db.from('expenses').select('pozo, monto_cs');
  if (startDate) expensesQuery = expensesQuery.gte('created_at', startDate);
  if (endDate) expensesQuery = expensesQuery.lte('created_at', endDate);

  const { data: expRows, error: expError } = await expensesQuery;
  if (expError) throw expError;

  const gastadoByPozo: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    gastadoByPozo[p] = 0;
  });

  for (const row of expRows || []) {
    if (row.pozo && ALL_POZOS.includes(row.pozo as any)) {
      gastadoByPozo[row.pozo] = (gastadoByPozo[row.pozo] ?? 0) + (Number(row.monto_cs) || 0);
    }
  }

  // Recogido en el periodo
  let itemsQuery = db
    .from('order_items')
    .select('pozos, salary, orders!inner(status, created_at)')
    .in('orders.status', ['approved', 'paid']);

  if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
  if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);

  const { data: orderItems, error: itemsError } = await itemsQuery;
  if (itemsError) throw itemsError;

  const recogidoByPozo: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    recogidoByPozo[p] = 0;
  });

  for (const it of orderItems || []) {
    if (it.pozos && typeof it.pozos === 'object') {
      for (const [key, val] of Object.entries(it.pozos)) {
        const num = Number(val) || 0;
        if (recogidoByPozo[key] !== undefined) {
          recogidoByPozo[key] = (recogidoByPozo[key] ?? 0) + num;
        }
      }
    }
    recogidoByPozo['salario'] = (recogidoByPozo['salario'] ?? 0) + (Number(it.salary) || 0);
  }

  return ALL_POZOS.map((p) => ({
    pozo: p,
    label: POZO_LABELS[p] || p,
    total_gastado: round(gastadoByPozo[p] || 0, 2),
    total_recogido: round(recogidoByPozo[p] || 0, 2),
  }));
}

/**
 * Calcula el estado de desbordamiento (overflow) y salud financiera del negocio:
 * Saldo acumulativo = (Recogido histórico) - (Gastado histórico).
 * Si negativo = desbordamiento que se descuenta de la ganancia bruta del mes.
 */
export async function getExpensesOverflow(startDate?: string, endDate?: string): Promise<ExpensesOverflowResult> {
  // 1. Recogido histórico acumulado de ventas aprobadas/pagadas
  const { data: orderItems, error: itemsError } = await db
    .from('order_items')
    .select('pozos, salary, ganancia_tienda, orders!inner(status, created_at)')
    .in('orders.status', ['approved', 'paid']);

  if (itemsError) throw itemsError;

  const recogidoHistorico: Record<string, number> = {};
  const recogidoMes: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    recogidoHistorico[p] = 0;
    recogidoMes[p] = 0;
  });

  let gananciaBruta = 0;
  const startTs = startDate ? new Date(startDate).getTime() : null;
  const endTs = endDate ? new Date(endDate).getTime() : null;

  for (const item of orderItems || []) {
    const orderCreatedAt = (item as any).orders?.created_at;
    const itemDateTs = orderCreatedAt ? new Date(orderCreatedAt).getTime() : 0;
    const inPeriod =
      (startTs === null || itemDateTs >= startTs) &&
      (endTs === null || itemDateTs <= endTs);

    if (item.pozos && typeof item.pozos === 'object') {
      for (const [key, val] of Object.entries(item.pozos)) {
        const num = Number(val) || 0;
        if (recogidoHistorico[key] !== undefined) {
          recogidoHistorico[key] = (recogidoHistorico[key] ?? 0) + num;
        }
        if (inPeriod && recogidoMes[key] !== undefined) {
          recogidoMes[key] = (recogidoMes[key] ?? 0) + num;
        }
      }
    }

    const sal = Number(item.salary) || 0;
    recogidoHistorico['salario'] = (recogidoHistorico['salario'] ?? 0) + sal;
    if (inPeriod) {
      recogidoMes['salario'] = (recogidoMes['salario'] ?? 0) + sal;
      gananciaBruta += Number(item.ganancia_tienda) || 0;
    }
  }

  // 2. Gastado histórico acumulado y del mes
  const { data: expensesRows, error: expError } = await db
    .from('expenses')
    .select('pozo, monto_cs, created_at');

  if (expError) throw expError;

  const gastadoHistorico: Record<string, number> = {};
  const gastadoMes: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    gastadoHistorico[p] = 0;
    gastadoMes[p] = 0;
  });

  for (const exp of expensesRows || []) {
    const pozo = exp.pozo;
    const monto = Number(exp.monto_cs) || 0;
    const expDateTs = exp.created_at ? new Date(exp.created_at).getTime() : 0;
    const inPeriod =
      (startTs === null || expDateTs >= startTs) &&
      (endTs === null || expDateTs <= endTs);

    if (gastadoHistorico[pozo] !== undefined) {
      gastadoHistorico[pozo] = (gastadoHistorico[pozo] ?? 0) + monto;
    }
    if (inPeriod && gastadoMes[pozo] !== undefined) {
      gastadoMes[pozo] = (gastadoMes[pozo] ?? 0) + monto;
    }
  }

  // 3. Presupuesto UNIFICADO del período seleccionado.
  //    Cada mes empieza en cero: solo cuenta lo recogido y gastado en el período.
  //    Solo hay desbordamiento si el gasto del período supera lo recogido del período.
  let totalRecogido = 0;
  let totalGastado = 0;

  const pozosResult: PozoOverflowItem[] = ALL_POZOS.map((p) => {
    const recogido = round(recogidoMes[p] || 0, 2);
    const gastado = round(gastadoMes[p] || 0, 2);
    const disponible = round(recogido - gastado, 2);
    totalRecogido += recogido;
    totalGastado += gastado;

    return {
      pozo: p,
      label: POZO_LABELS[p] || p,
      recogido,
      gastado,
      disponible,
      desbordamiento: 0,
      gastadoMes: round(gastadoMes[p] || 0, 2),
      recogidoMes: round(recogidoMes[p] || 0, 2),
    };
  });

  totalRecogido = round(totalRecogido, 2);
  totalGastado = round(totalGastado, 2);
  const presupuestoDisponible = round(totalRecogido - totalGastado, 2);
  const totalDesbordamiento = presupuestoDisponible < 0 ? round(Math.abs(presupuestoDisponible), 2) : 0;

  gananciaBruta = round(gananciaBruta, 2);
  const gananciaReal = round(gananciaBruta - totalDesbordamiento, 2);

  const desbordamientoDetalle = totalDesbordamiento > 0
    ? [{
        pozo: 'consolidado',
        label: 'Presupuesto Consolidado',
        monto: totalDesbordamiento,
      }]
    : [];

  return {
    pozos: pozosResult,
    totalDesbordamiento,
    gananciaBruta,
    gananciaReal,
    presupuestoDisponible,
    totalRecogido,
    totalGastado,
    desbordamientoDetalle,
  };
}

// ============================================================================
// ── Reportería de ventas ──
// ============================================================================
// Todas se apoyan en los RPC de `0002_functions.sql`: la agregación pasa en
// Postgres y acá solo se valida la forma de lo que volvió.

/**
 * Serie temporal de ventas para el gráfico de tendencia.
 * `sellerUid` recorta a un vendedor (la ruta lo fuerza para los no-admin).
 *
 * Los cortes se arman en HORA DE NICARAGUA. El RPC `get_sales_trend` hace
 * `date_trunc` en UTC, y Nicaragua es UTC−6: una venta de las 18:00 en adelante
 * caía en la barra del día siguiente (y la del último día del mes, en el mes
 * siguiente). Sin tocar la base, se agrupan acá las filas de `get_sales_ledger`
 * (una por venta, mismos totales) por fecha local.
 *
 * `bucket_start` es la medianoche LOCAL del corte, en ISO UTC (`…T06:00:00.000Z`).
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
    let itemsQuery = db
      .from('order_items')
      .select('sku, quantity, precio_unit, coste_final_snap, orders!inner(status, created_at, seller_uid)')
      .in('sku', skus)
      .in('orders.status', ['approved', 'paid']);

    if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
    if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);
    if (sellerUid) itemsQuery = itemsQuery.eq('orders.seller_uid', sellerUid);

    const { data: items } = await itemsQuery;
    if (items) {
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
    } else if (p.ingreso > 0) {
      margen = 35.0; // Margen promedio estimado de referencia
    }

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

// ============================================================================
// ── PAGOS DE PRÉSTAMOS Y GANANCIA REAL ──
// ============================================================================

/**
 * Normaliza una fecha ISO o Date al formato YYYY-MM-DD en la zona horaria de Nicaragua (UTC-6).
 */
export function toDateOnly(isoOrDateStr?: string | Date | null): string | null {
  if (!isoOrDateStr) return null;
  if (typeof isoOrDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr)) {
    return isoOrDateStr;
  }
  const d = typeof isoOrDateStr === 'string' ? new Date(isoOrDateStr) : isoOrDateStr;
  if (isNaN(d.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export interface LoanPaymentRecord {
  id: string;
  monto_cs: number;
  monto_usd: number | null;
  exchange_rate: number | null;
  fecha: string;
  nota: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Obtiene el listado de pagos de préstamos en el periodo con total acumulado.
 */
export async function listLoanPayments(
  startDate?: string,
  endDate?: string
): Promise<{ payments: LoanPaymentRecord[]; total: number }> {
  const startDay = toDateOnly(startDate);
  const endDay = toDateOnly(endDate);

  let query = db
    .from('loan_payments')
    .select('id, monto_cs, monto_usd, exchange_rate, fecha, nota, created_by, created_at')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  if (startDay) {
    query = query.gte('fecha', startDay);
  }
  if (endDay) {
    query = query.lte('fecha', endDay);
  }

  const { data, error } = await query;
  let rawRows: any[] = (data as any[]) || [];
  if (error && (error.message?.includes('monto_usd') || error.message?.includes('column'))) {
    // Fallback si las columnas monto_usd / exchange_rate aún no se han creado en la BD
    let fallbackQuery = db
      .from('loan_payments')
      .select('id, monto_cs, fecha, nota, created_by, created_at')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (startDay) fallbackQuery = fallbackQuery.gte('fecha', startDay);
    if (endDay) fallbackQuery = fallbackQuery.lte('fecha', endDay);

    const fallbackRes = await fallbackQuery;
    if (fallbackRes.error) throw fallbackRes.error;
    rawRows = (fallbackRes.data as any[]) || [];
  } else if (error) {
    throw error;
  }

  const payments: LoanPaymentRecord[] = rawRows.map((row: any) => ({
    id: row.id,
    monto_cs: Number(row.monto_cs),
    monto_usd: row.monto_usd ? Number(row.monto_usd) : null,
    exchange_rate: row.exchange_rate ? Number(row.exchange_rate) : null,
    fecha: row.fecha,
    nota: row.nota ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
  }));

  const total = round(
    payments.reduce((acc, curr) => acc + curr.monto_cs, 0),
    2
  );

  return { payments, total };
}

/**
 * Retorna la suma total de pagos de préstamos en el periodo.
 */
export async function getLoanPaymentsSummary(
  startDate?: string,
  endDate?: string
): Promise<number> {
  const res = await listLoanPayments(startDate, endDate);
  return res.total;
}

/**
 * Registra un nuevo pago de préstamo (soporta Córdobas y Dólares con conversión).
 */
export async function createLoanPayment(
  input: CreateLoanPaymentInput,
  authorUid: string
): Promise<LoanPaymentRecord> {
  const inputMonto = Number(input.monto ?? input.monto_cs);
  let montoCs = round(inputMonto, 2);
  let montoOriginalUsd: number | null = null;
  let tasaUsada: number | null = null;

  if (input.moneda === 'USD') {
    const config = await getFinancialConfig();
    tasaUsada = config.exchangeRate;
    montoOriginalUsd = montoCs;
    montoCs = round(inputMonto * tasaUsada, 2);
  }

  let { data, error } = await db
    .from('loan_payments')
    .insert({
      monto_cs: montoCs,
      monto_usd: montoOriginalUsd,
      exchange_rate: tasaUsada,
      fecha: input.fecha,
      nota: input.nota?.trim() || null,
      created_by: authorUid,
    })
    .select('id, monto_cs, monto_usd, exchange_rate, fecha, nota, created_by, created_at')
    .single();

  let resultRow: any = data;
  if (error && (error.message?.includes('monto_usd') || error.message?.includes('column'))) {
    // Fallback si las columnas monto_usd / exchange_rate aún no están en la tabla
    const fallbackRes = await db
      .from('loan_payments')
      .insert({
        monto_cs: montoCs,
        fecha: input.fecha,
        nota: input.nota?.trim() || null,
        created_by: authorUid,
      })
      .select('id, monto_cs, fecha, nota, created_by, created_at')
      .single();

    if (fallbackRes.error) throw fallbackRes.error;
    resultRow = {
      ...fallbackRes.data,
      monto_usd: montoOriginalUsd,
      exchange_rate: tasaUsada,
    };
  } else if (error) {
    throw error;
  }

  if (!resultRow) {
    throw new Error('No se pudo registrar el pago de préstamo');
  }

  return {
    id: resultRow.id,
    monto_cs: Number(resultRow.monto_cs),
    monto_usd: resultRow.monto_usd ? Number(resultRow.monto_usd) : null,
    exchange_rate: resultRow.exchange_rate ? Number(resultRow.exchange_rate) : null,
    fecha: resultRow.fecha,
    nota: resultRow.nota ?? null,
    created_by: resultRow.created_by ?? null,
    created_at: resultRow.created_at,
  };
}

/**
 * Elimina un pago de préstamo por su ID.
 */
export async function deleteLoanPayment(id: string): Promise<{ success: boolean; id: string }> {
  const { data: existing, error: checkError } = await db
    .from('loan_payments')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (checkError) throw checkError;
  if (!existing) {
    throw new NotFoundError('El pago de préstamo no existe.');
  }

  const { error } = await db.from('loan_payments').delete().eq('id', id);
  if (error) throw error;

  return { success: true, id };
}

