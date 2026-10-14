// Gastos operativos por pozo: alta, edición con vista previa del desborde, listado y totales.
import { db } from '../../core/supabase';
import { BadRequestError, NotFoundError } from '../../utils/http-error';
import { round } from './costing';
import type { CreateExpenseInput } from '../../../shared/schemas';
import { getFinancialConfig } from '../settings/app-config';
import { fetchAllRows } from '../../utils/fetch-all-rows';
import { getPozoLedger, ledgerMonthOf, type LedgerPozo, type MonthLedger } from './pozo-ledger';
import { listLoanPayments } from './loan-payments';

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

/** Lo disponible del pozo Préstamos en un rango: lo recogido por ventas menos sus gastos. */
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
  /** Pago todavía en la tabla vieja (antes de la migración 0018): se muestra, pero no se edita. */
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
 * Sin `fecha` conserva la anterior. Un gasto en dólares conserva su tasa: editar el texto no cambia
 * cuántos córdobas costó.
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

export interface ExpensePreview {
  month: string;
  pozo: string;
  label: string;
  montoCs: number;
  /** Saldo del pozo antes de este gasto (heredado + recogido − otros gastos del mes). */
  saldoPozo: number;
  /** De dónde sale el monto. Suma = montoCs. */
  cubre: {
    propio: number;
    extra: number;
    pozos: { pozo: string; label: string; monto: number }[];
    ganancia: number;
  };
  /** true si el gasto no cabe en su pozo y toma de otro lado. */
  excede: boolean;
  gananciaRealAntes: number;
  gananciaRealDespues: number;
}

/** Vista previa: calcula el mes sin y con el gasto, y la diferencia dice de dónde sale cada córdoba. */
export async function previewExpense(input: CreateExpenseInput, excludeId?: string): Promise<ExpensePreview> {
  let rate: number | null = null;
  let createdAt = expenseCreatedAt(input.fecha);
  if (excludeId) {
    const { data: existing, error } = await db
      .from('expenses')
      .select('exchange_rate, created_at')
      .eq('id', excludeId)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new NotFoundError('El gasto no existe.');
    rate = existing.exchange_rate ? Number(existing.exchange_rate) : null;
    createdAt ??= existing.created_at;
  }
  createdAt ??= new Date().toISOString();
  const { monto_cs } = await expenseAmounts(input, rate);

  const month = ledgerMonthOf(createdAt);
  const pozo = input.pozo as LedgerPozo;
  const [before, after] = await Promise.all([
    getPozoLedger(month, { removeExpenseId: excludeId }),
    getPozoLedger(month, { removeExpenseId: excludeId, add: { pozo, montoCs: monto_cs, createdAt } }),
  ]);

  const extra = Math.max(0, round(after.extraUsado - before.extraUsado, 2));
  const ganancia = Math.max(0, round(after.deGanancia.total - before.deGanancia.total, 2));
  const pozos = after.pozos
    .map((row) => ({
      pozo: row.pozo,
      label: row.label,
      monto: round(row.prestado - (before.pozos.find((b) => b.pozo === row.pozo)?.prestado ?? 0), 2),
    }))
    .filter((p) => p.monto > 0);
  const deOtros = round(extra + ganancia + pozos.reduce((acc, p) => acc + p.monto, 0), 2);
  const target = before.pozos.find((b) => b.pozo === pozo)!;

  return {
    month,
    pozo,
    label: target.label,
    montoCs: monto_cs,
    saldoPozo: target.disponible,
    cubre: { propio: Math.max(0, round(monto_cs - deOtros, 2)), extra, pozos, ganancia },
    excede: deOtros > 0,
    gananciaRealAntes: before.gananciaReal,
    gananciaRealDespues: after.gananciaReal,
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

/** Libro de pozos del mes que contiene `startDate` (hora de Nicaragua). */
export async function getExpensesOverflow(startDate?: string): Promise<MonthLedger> {
  return getPozoLedger(ledgerMonthOf(startDate));
}
