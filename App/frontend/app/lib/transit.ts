// Días de tránsito desde que la compra zarpa, no desde que se compra: sale en dos ventanas fijas al mes
// y esa espera no es responsabilidad del proveedor. Derivado, sin columnas nuevas.

/** Bandas de evaluación, en días de tránsito. */
export const TRANSIT_BANDS = {
  /** Hasta acá es bueno. */
  good: 60,
  /** Entre `good` y acá es lo normal; pasando esto, es mucho. */
  regular: 90,
} as const;

export type TransitBand = 'good' | 'regular' | 'bad';

export type TransitState =
  /** Comprada, pero todavía no zarpa: el contador aún no arranca. */
  | 'waiting'
  /** Viajando. El contador corre contra hoy. */
  | 'transit'
  /** Llegó. El número es final. */
  | 'arrived'
  /** Sin `purchaseDate` utilizable. */
  | 'unknown';

export interface TransitInfo {
  state: TransitState;
  /** Días de tránsito. `null` mientras no zarpó o si no se puede calcular. */
  days: number | null;
  /** Cuándo zarpa/zarpó. */
  departure: Date | null;
  /** Días que faltan para zarpar (solo en `waiting`). */
  daysToDeparture: number | null;
  band: TransitBand | null;
}

/** 'yyyy-MM-dd' → Date LOCAL. `new Date('yyyy-MM-dd')` se lee como UTC y puede
 *  correr un día según la zona horaria. */
function parseLocalDate(value: string): Date | null {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * Día 1–9 sale el 15; 10–24 el 30; 25–31 el 15 del mes siguiente. El 30 de febrero se arma a mano:
 * `new Date(2025, 1, 30)` da el 2 de marzo.
 */
export function getDepartureDate(purchaseDate: string): Date | null {
  const purchase = parseLocalDate(purchaseDate);
  if (!purchase) return null;

  const day = purchase.getDate();
  const year = purchase.getFullYear();
  const month = purchase.getMonth();

  if (day < 10) return new Date(year, month, 15);

  if (day < 25) {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    return lastDayOfMonth >= 30
      ? new Date(year, month, 30)
      : new Date(year, month + 1, 1); // febrero cruza al 1 del mes siguiente
  }

  return new Date(year, month + 1, 15);
}

/** Clasifica los días de tránsito. Menos es mejor. */
export function getTransitBand(days: number): TransitBand {
  if (days < TRANSIT_BANDS.good) return 'good';
  if (days <= TRANSIT_BANDS.regular) return 'regular';
  return 'bad';
}

export function getTransitInfo(purchase: {
  purchaseDate: string | null;
  arrivalDate: string | null;
  status: string;
}): TransitInfo {
  const empty: TransitInfo = {
    state: 'unknown',
    days: null,
    departure: null,
    daysToDeparture: null,
    band: null,
  };

  if (!purchase.purchaseDate) return empty;
  const departure = getDepartureDate(purchase.purchaseDate);
  if (!departure) return empty;

  const arrival = purchase.arrivalDate ? parseLocalDate(purchase.arrivalDate) : null;

  // Con `arrivalDate` el número es final; se usa la fecha y no `status`, que puede no coincidir.
  if (arrival) {
    // `max(0)` por si alguien carga una llegada anterior a la salida calculada:
    // un número negativo de días no significa nada y rompe la lectura.
    const days = Math.max(0, daysBetween(departure, arrival));
    return { state: 'arrived', days, departure, daysToDeparture: null, band: getTransitBand(days) };
  }

  if (purchase.status === 'received') return { ...empty, state: 'arrived', departure };

  const today = startOfDay(new Date());

  // Todavía no zarpa: mostrar el contador acá diría "0 días" durante dos
  // semanas y parecería que el reloj está roto.
  if (today < startOfDay(departure)) {
    return {
      state: 'waiting',
      days: null,
      departure,
      daysToDeparture: daysBetween(today, departure),
      band: null,
    };
  }

  const days = daysBetween(departure, today);
  return { state: 'transit', days, departure, daysToDeparture: null, band: getTransitBand(days) };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "15 feb" — corto, para que entre en la celda. */
export function formatShortDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
