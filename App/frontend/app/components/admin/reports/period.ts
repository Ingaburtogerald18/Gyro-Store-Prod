// Periodo del reporte: presets, rango ISO y grano del gráfico. Aparte porque lo usan el Dashboard y
// el panel del vendedor, y son funciones puras.
import type { TrendBucket } from '~/state/api/reports-api';

export type PeriodId = 'today' | '7d' | '30d' | 'month' | 'quarter' | 'year' | 'range';

export interface PeriodRange {
  startDate?: string;
  endDate?: string;
}

/** Rango libre elegido con el DatePicker, en 'yyyy-MM-dd' (hora local). */
export interface CustomRange {
  from: string;
  to: string;
}

export const PERIOD_TABS: { id: PeriodId; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 Días' },
  { id: '30d', label: '30 Días' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Año' },
  { id: 'range', label: 'Rango' },
];

/** 'yyyy-MM-dd' → Date LOCAL. `new Date('yyyy-MM-dd')` se lee como UTC y puede
 *  correr un día según la zona horaria; parseando a mano se evita. */
function parseLocalYmd(ymd: string): Date | null {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** `{}` = sin filtro: pasa con un rango libre a medio llenar. */
export function getPeriodRange(period: PeriodId, custom?: CustomRange): PeriodRange {
  if (period === 'range') {
    const from = custom?.from ? parseLocalYmd(custom.from) : null;
    const to = custom?.to ? parseLocalYmd(custom.to) : null;
    if (!from || !to) return {};
    // El rango es INCLUSIVO en los dos extremos: quien elige "1 al 5" espera
    // que las ventas del 5 por la tarde entren, no que se corten a medianoche.
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (from > to) return {};
    return { startDate: from.toISOString(), endDate: to.toISOString() };
  }

  const end = new Date();
  const start = new Date();

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (period === '30d') {
    start.setDate(start.getDate() - 30);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'quarter') {
    // Trimestre CALENDARIO en curso (ene-mar, abr-jun, jul-sep, oct-dic), no
    // "los últimos 90 días": es como se cierran las metas del negocio.
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    return {};
  }

  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** Un rango vacío para el backend significa «sin filtro» y traería todo el histórico: no se dispara. */
export function isPeriodReady(range: PeriodRange): boolean {
  return Boolean(range.startDate && range.endDate);
}

/** Grano según el largo del rango: un año en barras diarias son 365 barras de un pixel. */
export function pickBucket({ startDate, endDate }: PeriodRange): TrendBucket {
  if (!startDate || !endDate) return 'month';
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
  if (!Number.isFinite(days)) return 'month';
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

/** Etiqueta corta del eje X, acorde al grano elegido. */
export function formatBucketLabel(iso: string, bucket: TrendBucket): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (bucket === 'month') {
    return d.toLocaleDateString('es-NI', { month: 'short', year: '2-digit', timeZone: 'America/Managua' });
  }
  // Día y semana comparten formato: la semana se rotula con su día de inicio.
  return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short', timeZone: 'America/Managua' });
}
