import { db } from '../supabase';
import { getAccountBalance, registerMovement } from './caja';
import type { CashClosure, CreateCashClosureInput } from '../../shared/schemas';

const CLOSURE_COLUMNS = `
  id, account_id, fecha, saldo_esperado, saldo_contado,
  diferencia, notas, cerrado_por, created_at
`;

function parseClosureRow(row: any): CashClosure {
  return {
    id: row.id,
    account_id: row.account_id,
    fecha: row.fecha,
    saldo_esperado: Number(row.saldo_esperado),
    saldo_contado: Number(row.saldo_contado),
    diferencia: Number(row.diferencia),
    notas: row.notas ?? null,
    cerrado_por: row.cerrado_por ?? null,
    created_at: row.created_at,
  };
}

// Redondeo a 2 decimales: numeric(12,2) en la BD y evita que el ruido de coma
// flotante haga aparecer una "diferencia" de 0.0000001 que no existe.
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fecha de hoy en formato YYYY-MM-DD (UTC), la misma base que usa el cuadre. */
function todayISODate(): string {
  return new Date().toISOString().split('T')[0]!;
}

export async function listClosures(accountId?: string, limit = 60): Promise<CashClosure[]> {
  let query = db
    .from('cash_closures')
    .select(CLOSURE_COLUMNS)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (accountId) query = query.eq('account_id', accountId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(parseClosureRow);
}

// Cierra el día de una cuenta: compara el conteo físico contra el saldo que el
// sistema tiene calculado (el esperado) y guarda el arqueo. Si hay diferencia,
// registra un movimiento de ajuste para que el libro quede IGUAL a lo contado —
// el conteo físico manda; si no, el descuadre se arrastraría a mañana.
export async function createClosure(
  input: CreateCashClosureInput,
  userId: string,
): Promise<CashClosure> {
  const esperado = round2(await getAccountBalance(input.account_id));
  const contado = round2(input.saldo_contado);
  const diferencia = round2(contado - esperado);

  // Solo ajustamos si el descuadre es real (≥ 1 centavo).
  if (Math.abs(diferencia) >= 0.01) {
    await registerMovement(
      {
        account_id: input.account_id,
        tipo: diferencia > 0 ? 'ingreso' : 'egreso',
        monto: Math.abs(diferencia),
        categoria: 'Ajuste de cierre',
        descripcion:
          input.notas?.trim() ||
          (diferencia > 0 ? 'Sobrante detectado en el arqueo' : 'Faltante detectado en el arqueo'),
      },
      userId,
    );
  }

  // Upsert por (cuenta, fecha): re-cerrar el mismo día sobrescribe el arqueo en
  // vez de duplicarlo.
  const { data, error } = await db
    .from('cash_closures')
    .upsert(
      {
        account_id: input.account_id,
        fecha: todayISODate(),
        saldo_esperado: esperado,
        saldo_contado: contado,
        diferencia,
        notas: input.notas?.trim() || null,
        cerrado_por: userId,
      },
      { onConflict: 'account_id,fecha' },
    )
    .select(CLOSURE_COLUMNS)
    .single();

  if (error) throw error;
  return parseClosureRow(data);
}
