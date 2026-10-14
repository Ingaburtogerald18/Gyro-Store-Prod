// "Mis pedidos" sin cuenta: los pedidos hechos desde ESTE navegador. Solo se
// guarda el id (el link de seguimiento) y lo justo para listar; el estado real
// siempre se pide al servidor. Si se borra el navegador, el cliente sigue
// teniendo el link en su chat de WhatsApp o el rastreo por número + teléfono.
const STORAGE_KEY = 'gyro_orders';
const MAX_ORDERS = 20;

export interface SavedOrder {
  id: string;
  createdAt: string;
  total: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export function loadOrders(): SavedOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (o): o is SavedOrder =>
          Boolean(o) &&
          typeof o === 'object' &&
          typeof (o as SavedOrder).id === 'string' &&
          UUID_RE.test((o as SavedOrder).id) &&
          typeof (o as SavedOrder).createdAt === 'string' &&
          typeof (o as SavedOrder).total === 'number',
      )
      .slice(0, MAX_ORDERS);
  } catch {
    return [];
  }
}

export function saveOrder(order: SavedOrder) {
  if (typeof window === 'undefined') return;
  try {
    const next = [order, ...loadOrders().filter((o) => o.id !== order.id)].slice(0, MAX_ORDERS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage bloqueado: el pedido igual existe y el link va en el WhatsApp.
  }
}
