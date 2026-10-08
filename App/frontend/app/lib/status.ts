// Mapas de estado → etiqueta + tono, en un solo lugar.
//
// Estaban duplicados en `admin.ventas.tsx`, `PurchasesTable.tsx` y
// `SaleDetailDrawer.tsx`, con las mismas claves y traducciones. Tres copias
// significan que agregar un estado nuevo al enum de la base obliga a acordarse
// de tres archivos — y el que se olvide muestra el valor crudo de Postgres al
// usuario.
import type { BadgeStatus } from '~/components/ui/StatusBadge';

export interface StatusMeta {
  label: string;
  status: BadgeStatus;
}

/** `orders.status` (enum `order_status`). */
export const SALE_STATUS: Record<string, StatusMeta> = {
  pending_approval: { label: 'Pendiente', status: 'pending' },
  approved: { label: 'Aprobada', status: 'success' },
  paid: { label: 'Pagada', status: 'success' },
  rejected: { label: 'Rechazada', status: 'error' },
};

/** `purchases.status` (enum `purchase_status`). */
export const PURCHASE_STATUS: Record<string, StatusMeta> = {
  china: { label: 'En China', status: 'pending' },
  pending: { label: 'En tránsito', status: 'pending' },
  received: { label: 'Recibido', status: 'success' },
};

/** `invoices.status` (enum `invoice_status`). */
export const INVOICE_STATUS: Record<string, StatusMeta> = {
  unlinked: { label: 'Sin vincular', status: 'pending' },
  linked: { label: 'Vinculada', status: 'success' },
  void: { label: 'Anulada', status: 'error' },
};

/**
 * `public_orders.status` (pedidos web). 'shipped' es el mismo paso para las dos
 * entregas; la etiqueta cambia según `delivery_method` (ver `publicOrderStatusLabel`).
 */
export const PUBLIC_ORDER_STATUS: Record<string, StatusMeta> = {
  new: { label: 'Recibido', status: 'info' },
  preparing: { label: 'En preparación', status: 'pending' },
  shipped: { label: 'En camino', status: 'pending' },
  delivered: { label: 'Entregado', status: 'success' },
  cancelled: { label: 'Cancelado', status: 'error' },
};

/** Pasos que ve el cliente, en orden. `cancelled` queda fuera: corta la línea. */
export const PUBLIC_ORDER_STEPS = ['new', 'preparing', 'shipped', 'delivered'] as const;

export function publicOrderStatusLabel(status: string, deliveryMethod: string | null): string {
  if (status === 'shipped' && deliveryMethod === 'retiro') return 'Listo para retiro';
  return statusMeta(PUBLIC_ORDER_STATUS, status).label;
}

/**
 * Resuelve el estado con un fallback honesto: si la base devuelve un valor que
 * el front no conoce (enum ampliado sin actualizar el mapa), se muestra el
 * valor crudo en tono neutro en vez de romper con `undefined.label`.
 */
export function statusMeta(map: Record<string, StatusMeta>, value: string): StatusMeta {
  return map[value] ?? { label: value, status: 'neutral' };
}
