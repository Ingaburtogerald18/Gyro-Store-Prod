// Semana ISO `YYYY-Www`: agrupa los pagos de comisión y las carpetas de comprobantes. Una sola
// implementación para que la carpeta y el pago de una venta no digan semanas distintas.

/** La semana 1 contiene el primer jueves y empiezan en lunes: sin correr al jueves, fin de diciembre falla. */
export function getIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
