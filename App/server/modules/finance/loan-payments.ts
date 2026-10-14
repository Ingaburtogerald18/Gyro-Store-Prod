// Pagos de la tabla vieja loan_payments. Se retira al correr la migración 0018
// (Docs/03-Finanzas.md §13).
import { db } from '../../core/supabase';
import { round } from './costing';

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
