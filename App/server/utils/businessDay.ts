// El "día de hoy" del negocio, en hora de Nicaragua.
//
// ── Por qué existe ──
// El arqueo y el Cuadre calculaban el día con `new Date().toISOString()`, que es
// UTC. Nicaragua es UTC−6 y no cambia de horario, así que a partir de las 18:00
// locales el UTC ya está en el día siguiente: "las ventas de hoy" pasaban a ser
// las de mañana y el resumen del día se vaciaba justo en el horario en que se
// cierra la tienda. El offset fijo es exacto acá (mismo criterio que el
// `formatDate` de comprobante.ts) y no depende de la tz del contenedor de Render.
//
// ── El segundo problema que resuelve ──
// `getCuadreDashboard` llamaba a `getFinancialKPIs(hoy, hoy)` con la fecha
// pelada (`2026-08-18`). Postgres castea eso a `2026-08-18 00:00:00+00`, así que
// el filtro `created_at >= inicio and created_at <= fin` quedaba reducido a UN
// INSTANTE: la medianoche. Los KPIs del día daban 0 SIEMPRE, hubiera o no ventas
// aprobadas. Por eso esto devuelve el rango completo ya armado y no una fecha
// suelta que cada llamador tenga que acordarse de expandir.

/** Nicaragua: UTC−6 todo el año (no hay horario de verano). */
const UTC_OFFSET_HOURS = -6;

export interface BusinessDay {
  /** `YYYY-MM-DD` en hora local — la fecha que ve el usuario. */
  date: string;
  /** 00:00:00.000 local, en ISO UTC. Inclusive. */
  startIso: string;
  /** 23:59:59.999 local, en ISO UTC. Inclusive. */
  endIso: string;
}

/**
 * Devuelve el día local que contiene `now` y sus dos extremos en UTC, listos
 * para mandarle a los RPC de reportería (que comparan contra `created_at`,
 * un `timestamptz`).
 */
export function getBusinessDay(now: Date = new Date()): BusinessDay {
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;

  const date = new Date(now.getTime() + offsetMs).toISOString().slice(0, 10);

  const startMs = Date.parse(`${date}T00:00:00.000Z`) - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;

  return {
    date,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/** `YYYY-MM-DD` local (Nicaragua) del instante `iso`. */
export function toBusinessDate(iso: string | Date): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(ms + UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 00:00 local de la fecha `YYYY-MM-DD`, en ISO UTC (`…T06:00:00.000Z`). */
export function businessDateStartIso(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString();
}
