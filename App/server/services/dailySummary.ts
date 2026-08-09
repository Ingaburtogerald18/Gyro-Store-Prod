import { getSalesBreakdown } from './reports';
import { listMovements } from './caja';

// Resumen del día para el arqueo: qué se vendió hoy y por qué canal debería
// haber entrado el dinero, más lo que efectivamente se movió en caja. Sirve para
// contestar "vendimos tanto, ¿está la plata en efectivo o en el banco?".
//
// El desglose por método sale de las FACTURAS (invoices.method): una venta sin
// factura no tiene método, así que su dinero queda en "sin factura / otro" — hay
// que revisar a mano dónde entró.
export interface DailySummary {
  fecha: string; // YYYY-MM-DD
  ventas: {
    total: number;
    count: number;
    efectivo: number;
    transferencia: number;
    tarjeta: number;
    // Facturadas sin método + ventas sin factura: dinero cuyo destino no se
    // deduce del dato. Se muestra aparte para que no se cuele como "cuadrado".
    sinDefinir: number;
  };
  caja: {
    ingresos: number; // ingresos registrados hoy en cualquier cuenta
    egresos: number; // egresos registrados hoy
  };
}

const sumBy = (rows: Array<{ key: string; total: number }>, key: string) =>
  rows.find((r) => r.key === key)?.total ?? 0;

export async function getDailySummary(): Promise<DailySummary> {
  const hoy = new Date().toISOString().split('T')[0]!;
  const startIso = `${hoy}T00:00:00.000Z`;
  const endIso = `${hoy}T23:59:59.999Z`;

  const [breakdown, movimientos] = await Promise.all([
    getSalesBreakdown(startIso, endIso),
    listMovements({ startDate: startIso, endDate: endIso }),
  ]);

  const efectivo = sumBy(breakdown.by_method, 'efectivo');
  const transferencia = sumBy(breakdown.by_method, 'transferencia');
  const tarjeta = sumBy(breakdown.by_method, 'tarjeta');

  // Total de TODAS las ventas del día (facturadas o no): by_origin agrupa la
  // base completa, así que su suma es el total real vendido.
  const total = breakdown.by_origin.reduce((acc, r) => acc + r.total, 0);
  const count = breakdown.by_origin.reduce((acc, r) => acc + r.count, 0);

  // Lo que no cae en un método conocido: el resto del total. Nunca negativo por
  // ruido de redondeo.
  const sinDefinir = Math.max(0, Math.round((total - efectivo - transferencia - tarjeta) * 100) / 100);

  let ingresos = 0;
  let egresos = 0;
  for (const m of movimientos) {
    if (m.tipo === 'ingreso') ingresos += Number(m.monto);
    else egresos += Number(m.monto);
  }

  return {
    fecha: hoy,
    ventas: { total, count, efectivo, transferencia, tarjeta, sinDefinir },
    caja: { ingresos, egresos },
  };
}
