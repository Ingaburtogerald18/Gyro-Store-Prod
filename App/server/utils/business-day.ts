// Fechas del negocio en hora de Nicaragua. Offset fijo: no hay horario de verano
// y así no depende de la zona horaria del contenedor de Render.
const UTC_OFFSET_HOURS = -6;

/** `YYYY-MM-DD` local (Nicaragua) del instante `iso`. */
export function toBusinessDate(iso: string | Date): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(ms + UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 00:00 local de la fecha `YYYY-MM-DD`, en ISO UTC (`…T06:00:00.000Z`). */
export function businessDateStartIso(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString();
}
