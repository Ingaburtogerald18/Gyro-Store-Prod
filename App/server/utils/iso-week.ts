// Semana ISO-8601 como string `YYYY-Www` (ej. `2026-W32`).
//
// Es la unidad de agrupación del negocio: `orders.week_of` la usa para juntar los
// pagos de comisión de un vendedor (Docs/02-Arquitectura.md §6), y las carpetas de comprobantes
// en SharePoint la usan para que una carpeta y un período de pago sean lo mismo.
//
// Vive acá y no en ventas porque tener dos implementaciones del algoritmo
// —aunque hoy sean idénticas— es cómo se llega a que una carpeta diga W32 y el
// pago diga W33 para la misma venta.
//
// Reciclado tal cual de la v1 (getISOWeekString): puro, sin dependencias.

/**
 * Regla ISO-8601: la semana 1 es la que contiene el primer jueves del año, y las
 * semanas empiezan en lunes. De ahí el corrimiento al jueves antes de contar —
 * sin eso, los días de fin de diciembre caen en la semana equivocada.
 */
export function getIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
