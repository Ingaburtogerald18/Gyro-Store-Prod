import { getBalances, type AccountBalance } from './caja';
import { getFinancialKPIs, type FinancialKPIs } from './reports';
import { getBusinessDay } from '../utils/businessDay';
import { db } from '../supabase';

export interface CuadreDashboard {
  ventasPendientes: number;
  saldosCuentas: AccountBalance[];
  kpisHoy: FinancialKPIs;
}

export async function getCuadreDashboard(): Promise<CuadreDashboard> {
  // El día de HOY en hora de Nicaragua, con sus dos extremos.
  //
  // Antes acá se mandaba la fecha pelada dos veces (`getFinancialKPIs(hoy, hoy)`)
  // y Postgres la casteaba a medianoche en AMBOS lados: el rango era un instante
  // y los KPIs del Cuadre daban 0 aunque hubiera ventas aprobadas ese día.
  const { startIso, endIso } = getBusinessDay();

  // Ejecutar todo en paralelo para mejor rendimiento
  const [pendingResult, balances, kpis] = await Promise.all([
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval'),
    getBalances(),
    // KPIs financieros solo de hoy
    getFinancialKPIs(startIso, endIso),
  ]);

  if (pendingResult.error) throw pendingResult.error;

  return {
    ventasPendientes: pendingResult.count ?? 0,
    saldosCuentas: balances,
    kpisHoy: kpis,
  };
}
