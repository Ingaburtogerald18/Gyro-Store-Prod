import { randomUUID } from 'crypto';
import { db } from '../supabase';
import { BadRequestError } from '../utils/httpError';
import type {
  RegisterMovementInput,
  RegisterTransferInput,
  Account,
  AccountMovement,
} from '../../shared/schemas';

// ── ACCOUNTS ──

const ACCOUNT_COLUMNS = `id, nombre, tipo, moneda, saldo_inicial, activo, created_at`;

function parseAccountRow(row: any): Account {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    moneda: row.moneda,
    saldo_inicial: Number(row.saldo_inicial ?? 0),
    activo: row.activo,
    created_at: row.created_at,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await db
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(parseAccountRow);
}

export async function createAccount(
  nombre: string,
  tipo: 'banco' | 'efectivo',
  moneda: string = 'NIO',
  saldoInicial: number = 0,
): Promise<Account> {
  const { data, error } = await db
    .from('accounts')
    .insert({ nombre, tipo, moneda, saldo_inicial: saldoInicial })
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) throw error;
  return parseAccountRow(data);
}

export async function toggleAccountStatus(id: string, activo: boolean): Promise<Account> {
  const { data, error } = await db
    .from('accounts')
    .update({ activo })
    .eq('id', id)
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) throw error;
  return parseAccountRow(data);
}

// ── MOVEMENTS ──

// Sin `salida_id`: la columna se cayó junto con el módulo Salidas. Volver a
// ponerla en el SELECT haría fallar la query ENTERA con 42703, no solo ese campo.
const MOVEMENT_COLUMNS = `
  id, account_id, tipo, monto, categoria, descripcion,
  comprobante_url, transfer_id, ocurrio_at, registrado_por, created_at
`;

function parseMovementRow(row: any): AccountMovement {
  return {
    id: row.id,
    account_id: row.account_id,
    tipo: row.tipo,
    monto: row.monto,
    categoria: row.categoria,
    descripcion: row.descripcion,
    comprobante_url: row.comprobante_url,
    transfer_id: row.transfer_id ?? null,
    ocurrio_at: row.ocurrio_at,
    registrado_por: row.registrado_por,
    created_at: row.created_at,
  };
}

export async function registerMovement(input: RegisterMovementInput, userId: string): Promise<AccountMovement> {
  const { data, error } = await db
    .from('account_movements')
    .insert({
      account_id: input.account_id,
      tipo: input.tipo,
      monto: input.monto,
      categoria: input.categoria,
      descripcion: input.descripcion ?? null,
      comprobante_url: input.comprobante_url ?? null,
      ocurrio_at: input.ocurrio_at ?? new Date().toISOString(),
      registrado_por: userId,
    })
    .select(MOVEMENT_COLUMNS)
    .single();

  if (error) throw error;
  return parseMovementRow(data);
}

export async function listMovements(filters?: { accountId?: string; startDate?: string; endDate?: string }): Promise<AccountMovement[]> {
  let query = db.from('account_movements').select(MOVEMENT_COLUMNS).order('ocurrio_at', { ascending: false });

  if (filters?.accountId) {
    query = query.eq('account_id', filters.accountId);
  }
  if (filters?.startDate) {
    query = query.gte('ocurrio_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('ocurrio_at', filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(parseMovementRow);
}

// ── BALANCE ──

export interface AccountBalance {
  accountId: string;
  balance: number;
}

export async function getBalances(): Promise<AccountBalance[]> {
  // Saldo por cuenta = saldo_inicial + Σ ingresos − Σ egresos. Se siembra desde
  // las cuentas (no desde los movimientos) para que una cuenta con saldo inicial
  // y CERO movimientos igual aparezca con su saldo, en vez de desaparecer.
  const [accountsRes, movementsRes] = await Promise.all([
    db.from('accounts').select('id, saldo_inicial'),
    db.from('account_movements').select('account_id, tipo, monto'),
  ]);

  if (accountsRes.error) throw accountsRes.error;
  if (movementsRes.error) throw movementsRes.error;

  const balances: Record<string, number> = {};

  for (const acc of accountsRes.data || []) {
    balances[acc.id] = Number(acc.saldo_inicial ?? 0);
  }

  for (const mov of movementsRes.data || []) {
    if (!mov.account_id) continue;
    if (balances[mov.account_id] === undefined) balances[mov.account_id] = 0;
    if (mov.tipo === 'ingreso') {
      balances[mov.account_id]! += Number(mov.monto);
    } else {
      balances[mov.account_id]! -= Number(mov.monto);
    }
  }

  return Object.entries(balances).map(([accountId, balance]) => ({
    accountId,
    balance,
  }));
}

/** Saldo actual de UNA cuenta. Lo usa el cierre para calcular el esperado. */
export async function getAccountBalance(accountId: string): Promise<number> {
  const balances = await getBalances();
  return balances.find((b) => b.accountId === accountId)?.balance ?? 0;
}

// ── TRANSFERS ──

// Traspaso entre dos cuentas: egreso en origen + ingreso en destino, ambos
// ligados por un mismo transfer_id. Se insertan como un lote; si el insert falla,
// no queda ninguna pata suelta.
export async function registerTransfer(
  input: RegisterTransferInput,
  userId: string,
): Promise<AccountMovement[]> {
  if (input.from_account_id === input.to_account_id) {
    throw new BadRequestError('El origen y el destino no pueden ser la misma cuenta');
  }

  const transferId = randomUUID();
  const ocurrio = input.ocurrio_at ?? new Date().toISOString();
  const nota = input.descripcion?.trim() || null;

  const { data, error } = await db
    .from('account_movements')
    .insert([
      {
        account_id: input.from_account_id,
        tipo: 'egreso',
        monto: input.monto,
        categoria: 'Traspaso',
        descripcion: nota,
        transfer_id: transferId,
        ocurrio_at: ocurrio,
        registrado_por: userId,
      },
      {
        account_id: input.to_account_id,
        tipo: 'ingreso',
        monto: input.monto,
        categoria: 'Traspaso',
        descripcion: nota,
        transfer_id: transferId,
        ocurrio_at: ocurrio,
        registrado_por: userId,
      },
    ])
    .select(MOVEMENT_COLUMNS);

  if (error) throw error;
  return (data || []).map(parseMovementRow);
}
