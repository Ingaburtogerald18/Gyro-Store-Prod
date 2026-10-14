// Reserva de stock para los pedidos web según su estado.
import { db } from '../../core/supabase';
import { isMissingColumn } from '../orders/order-persistence';
import { releaseFifoLot, walkFifoLots } from './inventory-fifo';
import { codesForVariant, getAvailableByCodes } from './inventory-links';

// ============================================================================
// ── Reservas de pedidos web ──
// ============================================================================
// Regla del negocio: el pedido web NO descuenta al crearse (se coordina por
// WhatsApp). Cuando la tienda lo confirma (pasa a "preparing" o "shipped") se
// apartan sus unidades para que la tienda no se las prometa a otro cliente; al
// entregarse, cancelarse o volver a "new" se liberan. La venta formal se sigue
// registrando en Ventas, que es la que descuenta el stock de verdad.
//
// Requiere la migración 0022 (stock_reservations.public_order_id). Sin ella no
// hace nada.

const RESERVING_STATUSES = new Set(['preparing', 'shipped']);

export interface PublicOrderReservationResult {
  reserved: number;
  /** Unidades que no se pudieron apartar (sin stock o variante sin lotes). */
  missing: { name: string; quantity: number }[];
}

// Requiere la 0023 (public_orders.sale_id). Sin ella ningún pedido figura
// como convertido.
export async function isPublicOrderConverted(publicOrderId: string): Promise<boolean> {
  const { data, error } = await db.from('public_orders').select('sale_id').eq('id', publicOrderId).maybeSingle();
  if (isMissingColumn(error)) return false;
  if (error) throw error;
  return !!(data as { sale_id?: string | null } | null)?.sale_id;
}

async function hasPublicReservationColumn(): Promise<boolean> {
  const { error } = await db.from('stock_reservations').select('public_order_id').limit(1);
  if (isMissingColumn(error)) return false;
  if (error) throw error;
  return true;
}

export async function releasePublicOrderReservations(publicOrderId: string): Promise<{ released: number }> {
  if (!(await hasPublicReservationColumn())) return { released: 0 };
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('public_order_id', publicOrderId)
    .eq('status', 'active');
  if (error) throw error;
  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  for (const r of reservations) {
    await releaseFifoLot(r.purchase_id, 'quantity_reserved', r.quantity);
    const { error: markError } = await db.from('stock_reservations').update({ status: 'released' }).eq('id', r.id);
    if (markError) throw markError;
  }
  return { released: reservations.length };
}

export async function reservePublicOrder(publicOrderId: string): Promise<PublicOrderReservationResult> {
  const result: PublicOrderReservationResult = { reserved: 0, missing: [] };
  if (!(await hasPublicReservationColumn())) return result;

  // Ya se convirtió en venta: su stock lo maneja la venta, no el pedido.
  if (await isPublicOrderConverted(publicOrderId)) return result;

  // Ya tiene reservas activas: no se aparta dos veces (preparing → shipped).
  const { data: active, error: activeError } = await db
    .from('stock_reservations')
    .select('id')
    .eq('public_order_id', publicOrderId)
    .eq('status', 'active')
    .limit(1);
  if (activeError) throw activeError;
  if (active?.length) return result;

  type Line = { sku: string | null; quantity: number; variant_name?: string | null; product_name?: string | null };
  const readLines = (columns: string) =>
    db.from('public_order_items').select(columns).eq('public_order_id', publicOrderId);
  let { data: lines, error } = await readLines('sku, quantity, variant_name, product_name');
  // Sin 0019/0021 esas columnas no existen: sin variante solo se puede apartar
  // en productos de una sola combinación ('').
  if (isMissingColumn(error)) ({ data: lines, error } = await readLines('sku, quantity'));
  if (error) throw error;

  for (const line of (lines ?? []) as unknown as Line[]) {
    // Los combos no tienen stock propio.
    if (!line.sku || line.sku.startsWith('combo:')) continue;
    const variantKey = line.variant_name ?? '';
    const label = [line.product_name || 'Producto', variantKey].filter(Boolean).join(' · ');
    const codes = await codesForVariant({ catalogItemId: line.sku, variantKey });
    if (!codes.length) {
      result.missing.push({ name: label, quantity: line.quantity });
      continue;
    }

    const free = [...(await getAvailableByCodes(codes)).values()].reduce((a, b) => a + b, 0);
    const want = Math.min(line.quantity, free);
    if (want < line.quantity) result.missing.push({ name: label, quantity: line.quantity - want });
    if (want <= 0) continue;

    const taken = await walkFifoLots({ codes, label }, want, 'quantity_reserved');
    for (const lot of taken) {
      const { error: insertError } = await db.from('stock_reservations').insert({
        public_order_id: publicOrderId,
        purchase_id: lot.purchaseId,
        code: lot.code,
        quantity: lot.quantity,
        unit_final_usd: lot.costeFinalUsd,
        status: 'active',
      });
      if (insertError) {
        await releaseFifoLot(lot.purchaseId, 'quantity_reserved', lot.quantity);
        throw insertError;
      }
      result.reserved += lot.quantity;
    }
  }
  return result;
}

/** Ajusta las reservas de un pedido web a su nuevo estado. */
export async function syncPublicOrderReservation(
  publicOrderId: string,
  status: string,
): Promise<PublicOrderReservationResult | { released: number }> {
  return RESERVING_STATUSES.has(status)
    ? reservePublicOrder(publicOrderId)
    : releasePublicOrderReservations(publicOrderId);
}
