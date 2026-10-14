// Aprobar una venta (congela costos, comisión y pozos) o rechazarla.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { consumeReservation, releaseReservations } from '../inventory/inventory-fifo';
import { unlinkInvoiceFromSale } from '../invoices/invoices';
import { BadRequestError } from '../../utils/http-error';
import { computeLineCommission } from './commission';
import { firstOfEmbed } from '../../utils/first-of-embed';
import { enqueueApprovedSale } from '../sharepoint/spo-outbox';
import { getIsoWeek } from '../../utils/iso-week';

// ── Aprobar / Rechazar ──

interface PurchaseEmbed {
  product_name: string;
  coste_final: number | null;
  costo_f_u: number | null;
}

// Consume las reservas (reservado → vendido en purchases, vía inventory-fifo.ts) y
// congela el snapshot financiero de Docs/03-Finanzas.md §4 en cada order_item. El costo
// por línea sale de los lotes que stock_reservations realmente asignó a esa
// venta (promedio ponderado si abarcó más de un lote).
export async function approveSale(orderId: string): Promise<boolean> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return false;
  if (order.status !== 'pending_approval') {
    throw new BadRequestError('Solo se aprueban ventas pendientes.');
  }

  const { data: itemRows, error: itemsError } = await db
    .from('order_items')
    .select('id, sku, quantity, precio_unit')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;
  const items = (itemRows ?? []) as unknown as {
    id: string;
    sku: string;
    quantity: number;
    precio_unit: number | null;
  }[];

  const { data: reservationRows, error: reservationsError } = await db
    .from('stock_reservations')
    .select('quantity, purchases(product_name, coste_final, costo_f_u)')
    .eq('order_id', orderId)
    // 'consumed' también: si un intento anterior de aprobar se cortó a mitad
    // de camino, esas reservas ya se movieron a vendido pero siguen siendo
    // parte del costo de esta venta.
    .in('status', ['active', 'consumed']);
  if (reservationsError) throw reservationsError;
  const reservations = (reservationRows ?? []) as unknown as {
    quantity: number;
    purchases: PurchaseEmbed | PurchaseEmbed[] | null;
  }[];

  // Cada reserva tiene que corresponder a una línea (por el nombre del lote).
  // Si alguna no calza —un lote renombrado después de registrar la venta—, esa
  // línea se aprobaría con costo 0 y la comisión y los pozos saldrían
  // inflados, congelados así para siempre. Mejor frenar y avisar.
  const itemNames = new Set(items.map((item) => item.sku));
  const orphan = reservations.find((r) => !itemNames.has(firstOfEmbed(r.purchases)?.product_name ?? ''));
  if (orphan) {
    const lotName = firstOfEmbed(orphan.purchases)?.product_name ?? 'sin nombre';
    throw new BadRequestError(
      `No se puede costear la venta: el lote "${lotName}" no coincide con ningún producto de la venta (¿se renombró en Inventario?). Devolvele el nombre original o editá la venta.`,
    );
  }

  // Y cada línea tiene que tener TODAS sus unidades reservadas. Si una edición
  // o un registro se cortó a mitad de camino, la línea quedaría con menos
  // unidades costeadas que vendidas (o con costo 0 si no tiene ninguna).
  const reservedByName = new Map<string, number>();
  for (const r of reservations) {
    const name = firstOfEmbed(r.purchases)?.product_name ?? '';
    reservedByName.set(name, (reservedByName.get(name) ?? 0) + r.quantity);
  }
  const uncovered = items.find((item) => (reservedByName.get(item.sku) ?? 0) < item.quantity);
  if (uncovered) {
    const reserved = reservedByName.get(uncovered.sku) ?? 0;
    throw new BadRequestError(
      `No se puede aprobar: "${uncovered.sku}" tiene ${reserved} de ${uncovered.quantity} unidad(es) reservadas. Editá la venta para volver a reservar el stock, o rechazala.`,
    );
  }

  const config = await getFinancialConfig();
  await consumeReservation(orderId);

  for (const item of items) {
    const lots = reservations
      .map((r) => ({ quantity: r.quantity, purchase: firstOfEmbed(r.purchases) }))
      .filter((r) => r.purchase?.product_name === item.sku);
    const takenQty = lots.reduce((sum, lot) => sum + lot.quantity, 0);

    const costeFinal =
      takenQty > 0
        ? round(lots.reduce((sum, lot) => sum + (lot.purchase?.coste_final ?? 0) * lot.quantity, 0) / takenQty, 2)
        : 0;
    const costoFU =
      takenQty > 0
        ? round(lots.reduce((sum, lot) => sum + (lot.purchase?.costo_f_u ?? 0) * lot.quantity, 0) / takenQty, 2)
        : 0;

    // Mayoreo ya quedó fijado en precio_unit al registrar: acá solo corre la
    // cadena utilidad→salary→comisión→ganancia (Docs/03-Finanzas.md §4), no se reevalúa.
    const commission = computeLineCommission(
      { precioUnit: item.precio_unit ?? 0, quantity: item.quantity, costeFinal, costoFU },
      config,
    );

    const { error: updateItemError } = await db
      .from('order_items')
      .update({
        coste_final_snap: costeFinal,
        utilidad_bruta: commission.utilidadBruta,
        salary: commission.salary,
        utilidad_neta: commission.utilidadNeta,
        comision: commission.comision,
        ganancia_tienda: commission.gananciaTienda,
        pozos: commission.pozos,
      })
      .eq('id', item.id);
    if (updateItemError) throw updateItemError;
  }

  const { data: approvedRow, error: updateOrderError } = await db
    .from('orders')
    .update({ status: 'approved', week_of: getIsoWeek(new Date()) })
    .eq('id', orderId)
    .eq('status', 'pending_approval') // otra aprobación simultánea ya la cerró
    .select('id')
    .maybeSingle();
  if (updateOrderError) throw updateOrderError;
  if (!approvedRow) return true;

  // Espejo en SharePoint (Docs/04-Comprobantes-SharePoint.md y la sección `spo_outbox` del schema). Solo se
  // ENCOLA: la subida a Graph la hace un worker aparte. Va después del update
  // porque una venta que no llegó a quedar 'approved' no tiene nada que espejar,
  // y `enqueueApprovedSale` no lanza nunca — si el outbox falla, la aprobación
  // igual se completa. Se espera (await) porque es un insert local de una fila:
  // dejarlo suelto solo cambiaría milisegundos por una promesa sin dueño.
  await enqueueApprovedSale(orderId);

  return true;
}

// Libera el stock reservado y deja un rastro en audit_logs (no hay columna de
// motivo en `orders`, pero la tabla de auditoría ya existe para esto).
export async function rejectSale(orderId: string, reason: string, rejectedBy: string): Promise<boolean> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return false;
  if (order.status !== 'pending_approval') {
    throw new BadRequestError('Solo se pueden rechazar ventas pendientes.');
  }

  const { data: rejectedRow, error: updateError } = await db
    .from('orders')
    .update({ status: 'rejected' })
    .eq('id', orderId)
    .eq('status', 'pending_approval') // no rechazar una que se aprobó entre medio
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!rejectedRow) throw new BadRequestError('Solo se pueden rechazar ventas pendientes.');

  await releaseReservations(orderId);

  // La factura queda libre para registrar la venta corregida con el mismo
  // ticket. Antes quedaba "ligada" a una venta rechazada para siempre, y la
  // única salida era borrar la venta, que anula la factura.
  const freedInvoice = await unlinkInvoiceFromSale(orderId);

  const { error: auditError } = await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_rejected',
    reason: freedInvoice ? `${reason} (factura ${freedInvoice} liberada)` : reason,
    author_uid: rejectedBy,
  });
  if (auditError) throw auditError;

  return true;
}
