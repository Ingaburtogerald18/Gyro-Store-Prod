// Piezas comunes de las órdenes de compra: tabla faltante, duplicados y búsquedas.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';

const MISSING_0024 = 'Falta aplicar la migración 0024 en Supabase para registrar órdenes de compra.';

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', 'PGRST205', 'PGRST204'].includes(error.code ?? '');
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

// Comodines de LIKE escapados: un nombre con "%" o "_" no debe matchear otros.
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export async function hasPurchaseOrdersTable(): Promise<boolean> {
  const { error } = await db.from('purchase_orders').select('id').limit(1);
  if (!error) return true;
  if (isMissingTable(error)) return false;
  throw error;
}

export async function requireOrdersTable(): Promise<void> {
  if (!(await hasPurchaseOrdersTable())) throw new BadRequestError(MISSING_0024);
}

// Los números de orden se guardan en mayúsculas, igual que se guardaban los
// lotes: "lt1" y "LT1" son la misma orden.
export function normalizeOrderNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
