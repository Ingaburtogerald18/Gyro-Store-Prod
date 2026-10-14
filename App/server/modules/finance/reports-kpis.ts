// KPIs financieros del periodo, comparados con el periodo anterior, y pérdidas.
import { z } from 'zod';
import { db } from '../../core/supabase';
import { parseDbRows } from '../../utils/parse-db-rows';
import { buildPage, type PaginationParams, type PaginatedResult } from '../../utils/pagination';
import { round } from './costing';
import { businessDateStartIso, toBusinessDate } from '../../utils/business-day';
import { getPozoLedger, ledgerMonthOf } from './pozo-ledger';
import { getLoanPaymentsSummary } from './loan-payments';
import { getPrestamosPozoBudget } from './expenses';

// Reportes de admin: incluyen utilidad y costos.
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

  // Periodo anterior de igual duración: sin comparación, "C$1.4M" no dice si el mes fue bueno.
  // Vienen en 0 si el rango es abierto, y el panel muestra «—».
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

/**
 * Periodo de comparación: si el rango es un mes calendario, el mes anterior completo;
 * si no, el mismo largo justo antes.
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

/** KPIs financieros del periodo (ventas, utilidad, comisiones, pozos) desde `get_financial_kpis`. */
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

  // El RPC compara con la misma duración justo antes, que para un mes no es el mes anterior
  // (septiembre contra 2–31 de agosto): se pide el mes anterior completo y se reemplazan los "_prev".
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
  // pozos (pozo-ledger.ts), la MISMA cifra que muestra la pestaña Gastos.
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
