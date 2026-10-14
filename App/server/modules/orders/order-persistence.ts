import { OrderAttemptConflict } from './order-idempotency';

export interface StoredOrderAttempt<T> { requestHash: string; response: T; }
export interface OrderAttemptStore<T, Draft> {
  find(key: string): Promise<StoredOrderAttempt<T> | null>;
  /** Cabecera, líneas, cupón y respuesta se guardan en una única transacción. */
  commit(key: string, hash: string, draft: Draft): Promise<{ response: T; replayed: boolean }>;
}
export const isMissingColumn = (error: { code?: string; message?: string } | null | undefined) =>
  Boolean(error && ['42703', 'PGRST204'].includes(error.code ?? ''));

export async function restoreOrderAttempt<T, Draft>(
  store: OrderAttemptStore<T, Draft>, key: string, hash?: string,
): Promise<T | null> {
  const stored = await store.find(key);
  if (!stored) return null;
  if (hash !== undefined && hash !== stored.requestHash) throw new OrderAttemptConflict();
  return stored.response;
}
export async function persistOrder<T, Draft>(
  store: OrderAttemptStore<T, Draft>, key: string, hash: string, draft: Draft,
): Promise<{ response: T; replayed: boolean }> {
  // La transacción vuelve a comprobar la clave bajo bloqueo: no basta con el
  // find previo, porque otro servidor puede estar registrando el mismo intento.
  return store.commit(key, hash, draft);
}
