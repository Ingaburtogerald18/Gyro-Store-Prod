import { publicOrderInputSchema, type PublicOrderInput, type PublicOrderItemInput } from '@shared/schemas';

// Solo mientras un envío está sin confirmar y solo en esta pestaña. No guardamos
// el formulario normal en localStorage. El request exacto permite reintentar una
// respuesta perdida sin cambiar cliente, opciones o cupón.
export const CHECKOUT_ATTEMPT_KEY = 'gyro:checkout-attempt:v1';
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function session(): AttemptStorage | undefined {
  try { return typeof window !== 'undefined' ? window.sessionStorage : undefined; } catch { return undefined; }
}
export function loadCheckoutAttempt(storage = session()): PublicOrderInput | null {
  try {
    const raw = storage?.getItem(CHECKOUT_ATTEMPT_KEY);
    if (!raw) return null;
    const parsed = publicOrderInputSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.idempotencyKey) return parsed.data;
    storage?.removeItem(CHECKOUT_ATTEMPT_KEY);
  } catch { /* JSON inválido o storage bloqueado. */ }
  return null;
}
export function saveCheckoutAttempt(input: PublicOrderInput, storage = session()): PublicOrderInput {
  const parsed = publicOrderInputSchema.parse(input);
  if (!parsed.idempotencyKey) throw new Error('Falta la clave del intento.');
  if (!storage) throw new Error('No pudimos conservar el intento en esta pestaña. Habilitá el almacenamiento del navegador para registrar el pedido.');
  // Si no se puede guardar, NO enviamos: tras una recarga se perdería la clave.
  storage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(parsed));
  return parsed;
}
export function clearCheckoutAttempt(storage = session()) {
  try { storage?.removeItem(CHECKOUT_ATTEMPT_KEY); } catch { /* Puede haberse bloqueado después del envío. */ }
}
export function matchesAttemptItems(a: PublicOrderItemInput[], b: PublicOrderItemInput[]) {
  const normalize = (items: PublicOrderItemInput[]) => items.map(i => ({
    catalogItemId: i.catalogItemId ?? null, comboId: i.comboId ?? null,
    variantName: i.variantName ?? '', quantity: i.quantity, unitPrice: i.unitPrice ?? null,
  }));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
export function newCheckoutAttemptKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
}
