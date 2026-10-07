import { createHash } from 'node:crypto';
import type { PublicOrderInput } from '../../shared/schemas';

export class OrderAttemptConflict extends Error {
  status = 409;
  constructor() {
    super('Este intento corresponde a otro pedido. Recuperá el pedido anterior antes de enviar uno nuevo.');
  }
}

/** Excluye analítica: cambiar de sesión no convierte un reintento en otra compra. */
export function orderRequestHash(input: PublicOrderInput): string {
  return createHash('sha256').update(JSON.stringify({
    customerName: input.customerName, phone: input.phone, deliveryMethod: input.deliveryMethod,
    address: input.address ?? '', locationUrl: input.locationUrl ?? '', note: input.note ?? '',
    discountCode: input.discountCode?.trim().toUpperCase().replace(/\s+/g, '') ?? '',
    items: input.items.map(item => ({
      catalogItemId: item.catalogItemId ?? null, comboId: item.comboId ?? null,
      variantName: item.variantName ?? '', quantity: item.quantity, unitPrice: item.unitPrice ?? null,
    })),
  })).digest('hex');
}

/** Optimización local. La garantía entre procesos/reinicios vive en la transacción SQL. */
export function createAttemptRegistry<T>() {
  const running = new Map<string, { hash: string; promise: Promise<T> }>();
  return {
    run(key: string, hash: string, task: () => Promise<T>): Promise<T> {
      const previous = running.get(key);
      if (previous) return previous.hash === hash ? previous.promise : Promise.reject(new OrderAttemptConflict());
      const promise = Promise.resolve().then(task);
      running.set(key, { hash, promise });
      void promise.finally(() => {
        if (running.get(key)?.promise === promise) running.delete(key);
      }).catch(() => {});
      return promise;
    },
    clear() { running.clear(); },
  };
}

