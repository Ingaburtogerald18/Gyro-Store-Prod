import { z } from 'zod';
import { db } from '../supabase';
import { parseDbRows } from '../utils/parseDbRows';
import { buildPage, type PaginationParams, type PaginatedResult } from '../utils/pagination';
import { BadRequestError, NotFoundError } from '../utils/httpError';
import { round } from './finance';
import type { CreateExpenseInput } from '../../shared/schemas';
import { getFinancialConfig } from './appConfig';
import { businessDateStartIso, toBusinessDate } from '../utils/businessDay';
import { fetchAllRows } from '../utils/fetchAllRows';
import { getPozoLedger, ledgerMonthOf, type MonthLedger } from './pozoLedger';

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
  /** Todo lo que los gastos del mes tomaron de la ganancia (pozos que se pasaron, préstamos y salario). */
  gastos_de_ganancia: z.number().default(0),
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
  const data = await fetchAllRows((from, to) => {
    let query = db.from('expenses').select('monto_cs').eq('pozo', 'prestamos');
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    return query.order('id').range(from, to);
  });

  const total = data.reduce((acc, row: any) => acc + (Number(row.monto_cs) || 0), 0);
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
    const orderItems = await fetchAllRows((from, to) => {
      let itemsQuery = db
        .from('order_items')
        .select('pozos, orders!inner(status, created_at)')
        .in('orders.status', ['approved', 'paid']);
      if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
      if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);
      return itemsQuery.order('id').range(from, to);
    });

    let totalCollected = 0;
    for (const it of orderItems) {
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
 * Período contra el que se compara `[startDate, endDate]`.
 *
 * Si el rango es un mes calendario completo en hora de Nicaragua (lo que manda
 * el selector de mes), el anterior es el MES CALENDARIO anterior. Para
 * cualquier otro rango, el mismo largo justo antes (criterio del RPC).
 */
function previousPeriod(
  startDate?: string,
  endDate?: string,
): { startIso: string; endIso: string; isCalendarMonth: boolean } | null {
  if (!startDate || !endDate) return null;
  const s = Date.parse(startDate);
  const e = Date.parse(endDate);
  if (isNaN(s) || isNaN(e) || e < s) return null;

  const startLocal = toBusinessDate(new Date(s));
  const monthStart = `${startLocal.slice(0, 8)}01`;
  const [y, m] = monthStart.split('-').map(Number) as [number, number];
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const prevMonthStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);

  const isCalendarMonth =
    businessDateStartIso(monthStart) === new Date(s).toISOString() &&
    Math.abs(Date.parse(businessDateStartIso(nextMonthStart)) - 1 - e) < 1000;

  if (isCalendarMonth) {
    return {
      startIso: businessDateStartIso(prevMonthStart),
      endIso: new Date(Date.parse(businessDateStartIso(monthStart)) - 1).toISOString(),
      isCalendarMonth,
    };
  }
  return { startIso: new Date(s - (e - s)).toISOString(), endIso: new Date(s).toISOString(), isCalendarMonth };
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

  const prev = previousPeriod(startDate, endDate);
  const prevStartDate = prev?.startIso;
  const prevEndDate = prev?.endIso;

  const rpcData = { ...((data ?? {}) as Record<string, any>) };

  // El RPC calcula su "_prev" con la misma DURACIÓN justo antes del rango, y
  // para un mes eso no es el mes anterior (septiembre comparaba contra 2–31 de
  // agosto). Cuando el rango es un mes calendario, se pide el mes anterior
  // completo y sus totales reemplazan los "_prev" del RPC.
  if (prev?.isCalendarMonth) {
    const { data: prevData, error: prevError } = await db.rpc('get_financial_kpis', {
      p_start_date: prev.startIso,
      p_end_date: prev.endIso,
      p_seller_uid: sellerUid ?? null,
    }).single();
    if (prevError) throw prevError;
    const p = (prevData ?? {}) as Record<string, any>;
    for (const key of ['total_ventas', 'total_unidades', 'total_vendido', 'coste_total', 'comision_total', 'ganancia_tienda_total']) {
      rpcData[`${key}_prev`] = p[key] ?? 0;
    }
  }

  // Mes calendario de la tienda completa: la Ganancia real sale del motor de
  // pozos (pozoLedger.ts), la MISMA cifra que muestra la pestaña Gastos.
  if (prev?.isCalendarMonth && !sellerUid && startDate) {
    const month = ledgerMonthOf(startDate);
    const [ledger, prevLedger] = await Promise.all([
      getPozoLedger(month),
      getPozoLedger(ledgerMonthOf(prev.startIso)),
    ]);
    const prestamos = ledger.pozos.find((r) => r.pozo === 'prestamos')!;
    const prestamosPrev = prevLedger.pozos.find((r) => r.pozo === 'prestamos')!;
    const parsedLedger = parseDbRows(kpiSchema, [{
      ...rpcData,
      total_prestamos: prestamos.gastado,
      total_prestamos_prev: prestamosPrev.gastado,
      budget_prestamos_disponible: round(prestamos.heredado + prestamos.recogido, 2),
      prestamos_cubierto_por_budget: round(prestamos.gastado - prestamos.tomadoGanancia, 2),
      prestamos_de_ganancia: prestamos.tomadoGanancia,
      gastos_de_ganancia: ledger.deGanancia.total,
      ganancia_real: ledger.gananciaReal,
      ganancia_real_prev: prevLedger.gananciaReal,
    }], 'getFinancialKPIs');
    return parsedLedger[0]!;
  }

  // Otros rangos (o un solo vendedor): criterio anterior, solo préstamos.
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
    gastos_de_ganancia: excedenteDeGanancia,
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
  /**
   * `loan_payment`: pago de préstamo todavía en la tabla vieja (antes de correr
   * 0018_loan_payments_a_gastos.sql). Se muestra en el historial como gasto de
   * Préstamos, pero no se edita ni se borra desde acá.
   */
  source: 'expense' | 'loan_payment';
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
  utiles: 'Útiles de oficina',
  garantias: 'Garantías',
  prestamos: 'Préstamos',
  suscripciones: 'Suscripciones',
  servicios: 'Servicios básicos',
  salario: 'Fondo salario',
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

const EXPENSE_COLUMNS = 'id, pozo, monto_cs, monto_usd, exchange_rate, category, description, created_by, created_at';

/** Fecha opcional del gasto → `created_at`. No se aceptan fechas futuras. */
function expenseCreatedAt(fecha?: string): string | undefined {
  if (!fecha) return undefined;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) {
    throw new BadRequestError('Fecha de gasto inválida.');
  }
  if (d.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new BadRequestError('La fecha del gasto no puede ser futura.');
  }
  return d.toISOString();
}

/**
 * Monto en córdobas del gasto. En dólares se convierte con `rate` (al editar,
 * la tasa con la que se registró; si no, la del día).
 */
async function expenseAmounts(
  input: Pick<CreateExpenseInput, 'monto' | 'moneda'>,
  rate?: number | null,
): Promise<{ monto_cs: number; monto_usd: number | null; exchange_rate: number | null }> {
  if (input.moneda !== 'USD') return { monto_cs: round(input.monto, 2), monto_usd: null, exchange_rate: null };
  const tasa = rate ?? (await getFinancialConfig()).exchangeRate;
  return { monto_cs: round(input.monto * tasa, 2), monto_usd: round(input.monto, 2), exchange_rate: tasa };
}

function toExpenseRecord(data: any): ExpenseRecord {
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
    source: 'expense',
  };
}

/**
 * Registra un nuevo gasto operativo en la tabla `expenses`.
 */
export async function createExpense(input: CreateExpenseInput, authorUid: string): Promise<ExpenseRecord> {
  const createdAt = expenseCreatedAt(input.fecha);
  const amounts = await expenseAmounts(input);

  const { data, error } = await db
    .from('expenses')
    .insert({
      pozo: input.pozo,
      ...amounts,
      category: input.category,
      description: input.description?.trim() || null,
      created_by: authorUid,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) throw error;
  return toExpenseRecord(data);
}

/**
 * Edita un gasto. Sin `fecha` conserva la que tenía. Un gasto en dólares
 * conserva la tasa con la que se registró: editar la descripción no debe
 * cambiar cuántos córdobas costó.
 */
export async function updateExpense(id: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
  const { data: existing, error: checkError } = await db
    .from('expenses')
    .select('id, exchange_rate')
    .eq('id', id)
    .maybeSingle();
  if (checkError) throw checkError;
  if (!existing) {
    throw new NotFoundError('El gasto no existe.');
  }

  const createdAt = expenseCreatedAt(input.fecha);
  const amounts = await expenseAmounts(input, existing.exchange_rate ? Number(existing.exchange_rate) : null);

  const { data, error } = await db
    .from('expenses')
    .update({
      pozo: input.pozo,
      ...amounts,
      category: input.category,
      description: input.description?.trim() || null,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .eq('id', id)
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) throw error;
  return toExpenseRecord(data);
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
  const pozo = filters.pozo && filters.pozo !== 'todos' ? filters.pozo : undefined;

  // Se trae el período completo (un mes son decenas de gastos) para poder
  // intercalar por fecha los pagos de préstamo que siguen en `loan_payments`.
  const rows = await fetchAllRows((from, to) => {
    let query = db
      .from('expenses')
      .select('id, pozo, monto_cs, monto_usd, exchange_rate, category, description, created_by, created_at, profiles(name, email)');
    if (pozo) query = query.eq('pozo', pozo);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);
    return query.order('created_at', { ascending: false }).order('id').range(from, to);
  });

  const all: ExpenseRecord[] = rows.map((row: any) => {
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
      source: 'expense' as const,
    };
  });

  if (!pozo || pozo === 'prestamos') {
    all.push(...(await listPendingLoanPaymentsAsExpenses(filters.startDate, filters.endDate)));
    all.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  }

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 50;
  const from = (page - 1) * pageSize;

  return {
    expenses: all.slice(from, from + pageSize),
    total: all.length,
    page,
    pageSize,
  };
}

/** Pagos de `loan_payments` que la migración todavía no pasó a `expenses`, con forma de gasto. */
async function listPendingLoanPaymentsAsExpenses(startDate?: string, endDate?: string): Promise<ExpenseRecord[]> {
  const [{ payments }, migrated] = await Promise.all([
    listLoanPayments(startDate, endDate),
    fetchAllRows((from, to) =>
      db.from('expenses').select('description').like('description', '%[loan_payment:%').order('id').range(from, to),
    ),
  ]);
  const migratedIds = new Set(
    migrated.map((m) => /\[loan_payment:([0-9a-f-]{36})\]/i.exec(String(m.description))?.[1]?.toLowerCase()).filter(Boolean),
  );
  return payments
    .filter((p) => !migratedIds.has(p.id.toLowerCase()))
    .map((p) => ({
      id: `loan:${p.id}`,
      pozo: 'prestamos',
      monto: p.monto_cs,
      montoUsd: p.monto_usd,
      exchangeRate: p.exchange_rate,
      category: 'Pago de préstamo',
      description: p.nota,
      createdBy: p.created_by,
      createdByName: null,
      createdByEmail: null,
      // Mediodía de Nicaragua del día del pago: mismo criterio que la migración.
      createdAt: new Date(Date.parse(`${p.fecha}T12:00:00.000Z`) + 6 * 60 * 60 * 1000).toISOString(),
      source: 'loan_payment' as const,
    }));
}

/**
 * Obtiene los "gastos por pozo" agrupados, incluyendo el pozo virtual 'salario'.
 */
export async function getExpensesByPozo(startDate?: string, endDate?: string) {
  const expRows = await fetchAllRows((from, to) => {
    let expensesQuery = db.from('expenses').select('pozo, monto_cs');
    if (startDate) expensesQuery = expensesQuery.gte('created_at', startDate);
    if (endDate) expensesQuery = expensesQuery.lte('created_at', endDate);
    return expensesQuery.order('id').range(from, to);
  });

  const gastadoByPozo: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    gastadoByPozo[p] = 0;
  });

  for (const row of expRows) {
    if (row.pozo && ALL_POZOS.includes(row.pozo as any)) {
      gastadoByPozo[row.pozo] = (gastadoByPozo[row.pozo] ?? 0) + (Number(row.monto_cs) || 0);
    }
  }

  // Recogido en el periodo
  const orderItems = await fetchAllRows((from, to) => {
    let itemsQuery = db
      .from('order_items')
      .select('pozos, salary, orders!inner(status, created_at)')
      .in('orders.status', ['approved', 'paid']);
    if (startDate) itemsQuery = itemsQuery.gte('orders.created_at', startDate);
    if (endDate) itemsQuery = itemsQuery.lte('orders.created_at', endDate);
    return itemsQuery.order('id').range(from, to);
  });

  const recogidoByPozo: Record<string, number> = {};
  ALL_POZOS.forEach((p) => {
    recogidoByPozo[p] = 0;
  });

  for (const it of orderItems) {
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
 * Libro de pozos del mes (pestaña Gastos): herencia, desbordes, bolsa extra y
 * Ganancia real según las reglas de pozoLedger.ts. El mes es el que contiene
 * `startDate` (hora de Nicaragua).
 */
export async function getExpensesOverflow(startDate?: string): Promise<MonthLedger> {
  return getPozoLedger(ledgerMonthOf(startDate));
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

