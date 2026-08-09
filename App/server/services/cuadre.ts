import { getBalances, type AccountBalance } from './caja';
import { getFinancialKPIs, type FinancialKPIs } from './reports';
import { db } from '../supabase';

export interface CuadreDashboard {
  ventasPendientes: number;
  saldosCuentas: AccountBalance[];
  kpisHoy: FinancialKPIs;
}

export async function getCuadreDashboard(): Promise<CuadreDashboard> {
  // Hoy en UTC o local (simplificado a ISO string del día)
  const hoy = new Date().toISOString().split('T')[0];

  // Ejecutar todo en paralelo para mejor rendimiento
  const [pendingResult, balances, kpis] = await Promise.all([
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval'),
    getBalances(),
    // KPIs financieros solo de hoy
    getFinancialKPIs(hoy, hoy),
  ]);

  if (pendingResult.error) throw pendingResult.error;

  return {
    ventasPendientes: pendingResult.count ?? 0,
    saldosCuentas: balances,
    kpisHoy: kpis,
  };
}
