// Motor de reglas de los pozos (Docs/03-Finanzas.md §12).
//
// ── Reglas ──
// R2  El saldo que le sobra a un pozo al cerrar el mes lo hereda el mismo pozo
//     el mes siguiente. Arranca en agosto 2026 (RULES_START_MONTH).
// R3  Si un pozo común se pasa, el faltante sale, en este orden, de:
//     1. la bolsa extra (sobrantes de salario de meses anteriores, acumulados),
//     2. los otros pozos comunes con saldo, en proporción a su saldo,
//     3. la ganancia.
// R4  Préstamos no comparte: su saldo (heredado + recogido) y después la ganancia.
// R5  El salario es intocable en el mes. Si sobra, va a la bolsa extra del mes
//     siguiente (no vuelve al salario). Si falta, sale de la ganancia.
//
// ── Qué se guarda y qué se calcula ──
// Nada de esto se guarda: se recalcula desde agosto en cada pedido. Los gastos
// son editables, y un saldo guardado de un mes cerrado quedaría viejo al editar
// un gasto de ese mes. Son 8 pozos × pocos meses: cuesta milisegundos.
//
// El desborde se reparte a nivel MES, no gasto por gasto: así el resultado no
// depende del orden en que se cargaron los gastos.
//
// ── Préstamos antes y después de la migración ──
// Los pagos viejos viven en `loan_payments` hasta que se corra
// 0018_loan_payments_a_gastos.sql. Hasta entonces se leen como gastos del pozo
// Préstamos (por su `fecha`). La migración marca cada gasto con
// `[loan_payment:<id>]`; un pago con su marca ya en `expenses` no se cuenta dos veces.

import { db } from '../supabase';
import { round } from './finance';
import { businessDateStartIso, toBusinessDate } from '../utils/businessDay';
import { fetchAllRows } from '../utils/fetchAllRows';

export const RULES_START_MONTH = '2026-08';

export const POZOS_COMUNES = ['publicidad', 'mantenimiento', 'utiles', 'garantias', 'suscripciones', 'servicios'] as const;
export const LEDGER_POZOS = [...POZOS_COMUNES, 'prestamos', 'salario'] as const;
export type LedgerPozo = (typeof LEDGER_POZOS)[number];

export const LEDGER_POZO_LABELS: Record<LedgerPozo, string> = {
  publicidad: 'Publicidad',
  mantenimiento: 'Mantenimiento',
  utiles: 'Útiles de oficina',
  garantias: 'Garantías',
  suscripciones: 'Suscripciones',
  servicios: 'Servicios básicos',
  prestamos: 'Préstamos',
  salario: 'Fondo salario',
};

const LOAN_MARKER = /\[loan_payment:([0-9a-f-]{36})\]/i;

export interface PozoLedgerRow {
  pozo: LedgerPozo;
  label: string;
  /** Lo que aportaron las ventas del mes. */
  recogido: number;
  /** Saldo final del mes anterior (siempre 0 para salario: su sobrante va a la bolsa extra). */
  heredado: number;
  gastado: number;
  /** heredado + recogido − gastado, antes de cubrir desbordes. Negativo = se pasó. */
  disponible: number;
  tomadoExtra: number;
  tomadoPozos: number;
  tomadoGanancia: number;
  /** Lo que este pozo le prestó a otros pozos comunes que se pasaron. */
  prestado: number;
  /** Lo que hereda el mes siguiente (≥ 0). Para salario: el sobrante que va a la bolsa extra. */
  saldoFinal: number;
}

export interface MonthLedger {
  month: string;
  pozos: PozoLedgerRow[];
  extraInicio: number;
  extraUsado: number;
  /** Bolsa extra para el mes siguiente: lo que no se usó + el sobrante de salario de este mes. */
  extraSiguiente: number;
  sobranteSalario: number;
  gananciaTienda: number;
  deGanancia: { comunes: number; prestamos: number; salario: number; total: number };
  gananciaReal: number;
}

interface MonthInputs {
  recogido: Record<LedgerPozo, number>;
  gastado: Record<LedgerPozo, number>;
  gananciaTienda: number;
}

/** Cambio hipotético para la vista previa de un gasto (crear o editar). */
export interface LedgerAdjustment {
  /** Gasto existente que se saca del cálculo (al editarlo). */
  removeExpenseId?: string;
  /** Gasto que se agrega (el nuevo, o el editado con sus valores nuevos). */
  add?: { pozo: LedgerPozo; montoCs: number; createdAt: string };
}

const zeros = (): Record<LedgerPozo, number> =>
  Object.fromEntries(LEDGER_POZOS.map((p) => [p, 0])) as Record<LedgerPozo, number>;

const isPozo = (p: unknown): p is LedgerPozo => typeof p === 'string' && (LEDGER_POZOS as readonly string[]).includes(p);

const monthOf = (iso: string) => toBusinessDate(iso).slice(0, 7);

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

async function loadInputs(fromMonth: string, toMonth: string, adjust?: LedgerAdjustment): Promise<Map<string, MonthInputs>> {
  const fromIso = businessDateStartIso(`${fromMonth}-01`);
  const toIso = new Date(Date.parse(businessDateStartIso(`${nextMonth(toMonth)}-01`)) - 1).toISOString();

  const [items, expenses, loans] = await Promise.all([
    fetchAllRows((from, to) =>
      db
        .from('order_items')
        .select('pozos, salary, ganancia_tienda, orders!inner(status, created_at)')
        .in('orders.status', ['approved', 'paid'])
        .gte('orders.created_at', fromIso)
        .lte('orders.created_at', toIso)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      db
        .from('expenses')
        .select('id, pozo, monto_cs, description, created_at')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('id')
        .range(from, to),
    ),
    // Todos los pagos (sin filtro de fecha) para poder reconocer los ya migrados.
    fetchAllRows((from, to) => db.from('loan_payments').select('id, monto_cs, fecha').order('id').range(from, to)),
  ]);

  const byMonth = new Map<string, MonthInputs>();
  const get = (month: string) => {
    let m = byMonth.get(month);
    if (!m) {
      m = { recogido: zeros(), gastado: zeros(), gananciaTienda: 0 };
      byMonth.set(month, m);
    }
    return m;
  };

  for (const it of items) {
    const order = Array.isArray(it.orders) ? it.orders[0] : it.orders;
    if (!order?.created_at) continue;
    const m = get(monthOf(order.created_at));
    if (it.pozos && typeof it.pozos === 'object') {
      for (const [key, val] of Object.entries(it.pozos as Record<string, unknown>)) {
        if (isPozo(key) && key !== 'salario') m.recogido[key] += Number(val) || 0;
      }
    }
    m.recogido.salario += Number(it.salary) || 0;
    m.gananciaTienda += Number(it.ganancia_tienda) || 0;
  }

  const migratedLoans = new Set<string>();
  for (const e of expenses) {
    const marker = typeof e.description === 'string' ? LOAN_MARKER.exec(e.description) : null;
    if (marker?.[1]) migratedLoans.add(marker[1].toLowerCase());
    if (adjust?.removeExpenseId && e.id === adjust.removeExpenseId) continue;
    if (!isPozo(e.pozo)) continue;
    get(monthOf(e.created_at)).gastado[e.pozo] += Number(e.monto_cs) || 0;
  }

  for (const lp of loans) {
    if (migratedLoans.has(String(lp.id).toLowerCase())) continue;
    const month = String(lp.fecha).slice(0, 7);
    if (month < fromMonth || month > toMonth) continue;
    get(month).gastado.prestamos += Number(lp.monto_cs) || 0;
  }

  if (adjust?.add) {
    const month = monthOf(adjust.add.createdAt);
    if (month >= fromMonth && month <= toMonth) get(month).gastado[adjust.add.pozo] += adjust.add.montoCs;
  }

  return byMonth;
}

function computeMonth(month: string, input: MonthInputs, heredado: Record<LedgerPozo, number>, extraInicio: number): MonthLedger {
  const { recogido, gastado } = input;
  const rows = {} as Record<LedgerPozo, PozoLedgerRow>;
  const base = (p: LedgerPozo, h: number): PozoLedgerRow => ({
    pozo: p,
    label: LEDGER_POZO_LABELS[p],
    recogido: recogido[p],
    heredado: h,
    gastado: gastado[p],
    disponible: h + recogido[p] - gastado[p],
    tomadoExtra: 0,
    tomadoPozos: 0,
    tomadoGanancia: 0,
    prestado: 0,
    saldoFinal: 0,
  });

  // ── Pozos comunes ──
  for (const p of POZOS_COMUNES) rows[p] = base(p, heredado[p]);
  const enDeficit = POZOS_COMUNES.filter((p) => rows[p].disponible < 0);
  const deficit = enDeficit.reduce((s, p) => s + -rows[p].disponible, 0);

  const deExtra = Math.min(extraInicio, deficit);
  const donantes = POZOS_COMUNES.filter((p) => rows[p].disponible > 0);
  const saldoDonantes = donantes.reduce((s, p) => s + rows[p].disponible, 0);
  const dePozos = Math.min(saldoDonantes, deficit - deExtra);
  const deGananciaComunes = deficit - deExtra - dePozos;

  for (const p of enDeficit) {
    const share = -rows[p].disponible / deficit;
    rows[p].tomadoExtra = deExtra * share;
    rows[p].tomadoPozos = dePozos * share;
    rows[p].tomadoGanancia = deGananciaComunes * share;
  }
  for (const p of donantes) {
    rows[p].prestado = saldoDonantes > 0 ? dePozos * (rows[p].disponible / saldoDonantes) : 0;
    rows[p].saldoFinal = rows[p].disponible - rows[p].prestado;
  }

  // ── Préstamos: aislado ──
  rows.prestamos = base('prestamos', heredado.prestamos);
  const deGananciaPrestamos = Math.max(0, -rows.prestamos.disponible);
  rows.prestamos.tomadoGanancia = deGananciaPrestamos;
  rows.prestamos.saldoFinal = Math.max(0, rows.prestamos.disponible);

  // ── Salario: intocable; el sobrante va a la bolsa extra del mes siguiente ──
  rows.salario = base('salario', 0);
  const deGananciaSalario = Math.max(0, -rows.salario.disponible);
  rows.salario.tomadoGanancia = deGananciaSalario;
  const sobranteSalario = Math.max(0, rows.salario.disponible);
  rows.salario.saldoFinal = sobranteSalario;

  const deGananciaTotal = deGananciaComunes + deGananciaPrestamos + deGananciaSalario;
  const r2 = (n: number) => round(n, 2);

  return {
    month,
    pozos: LEDGER_POZOS.map((p) => {
      const r = rows[p];
      return {
        ...r,
        recogido: r2(r.recogido),
        heredado: r2(r.heredado),
        gastado: r2(r.gastado),
        disponible: r2(r.disponible),
        tomadoExtra: r2(r.tomadoExtra),
        tomadoPozos: r2(r.tomadoPozos),
        tomadoGanancia: r2(r.tomadoGanancia),
        prestado: r2(r.prestado),
        saldoFinal: r2(r.saldoFinal),
      };
    }),
    extraInicio: r2(extraInicio),
    extraUsado: r2(deExtra),
    extraSiguiente: r2(extraInicio - deExtra + sobranteSalario),
    sobranteSalario: r2(sobranteSalario),
    gananciaTienda: r2(input.gananciaTienda),
    deGanancia: {
      comunes: r2(deGananciaComunes),
      prestamos: r2(deGananciaPrestamos),
      salario: r2(deGananciaSalario),
      total: r2(deGananciaTotal),
    },
    gananciaReal: r2(input.gananciaTienda - deGananciaTotal),
  };
}

/**
 * Libro de pozos de `month` (`YYYY-MM`, hora de Nicaragua), con la herencia
 * calculada mes a mes desde agosto 2026. Un mes anterior al arranque se
 * calcula solo, sin herencia.
 */
export async function getPozoLedger(month: string, adjust?: LedgerAdjustment): Promise<MonthLedger> {
  const from = month < RULES_START_MONTH ? month : RULES_START_MONTH;
  const inputs = await loadInputs(from, month, adjust);
  const empty = (): MonthInputs => ({ recogido: zeros(), gastado: zeros(), gananciaTienda: 0 });

  if (month < RULES_START_MONTH) return computeMonth(month, inputs.get(month) ?? empty(), zeros(), 0);

  let heredado = zeros();
  let extra = 0;
  let current = RULES_START_MONTH;
  for (;;) {
    const result = computeMonth(current, inputs.get(current) ?? empty(), heredado, extra);
    if (current === month) return result;
    heredado = zeros();
    for (const row of result.pozos) if (row.pozo !== 'salario') heredado[row.pozo] = row.saldoFinal;
    extra = result.extraSiguiente;
    current = nextMonth(current);
  }
}

/** Mes (`YYYY-MM`, Nicaragua) que contiene el instante `iso`. */
export function ledgerMonthOf(iso: string | undefined): string {
  return monthOf(iso ?? new Date().toISOString());
}
