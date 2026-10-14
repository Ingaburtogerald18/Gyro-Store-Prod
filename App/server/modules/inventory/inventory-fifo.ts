// FIFO: reservar, consumir y liberar unidades de los lotes, el más viejo primero.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';

// ============================================================================
// ── FIFO ──
// ============================================================================
// Agrupa los lotes por `product_name`: por eso las compras nuevas toman el
// nombre que ya usan los lotes de su variante (nameForVariant).
//
// Tampoco hay una función de Postgres con locking real (`FOR UPDATE`) como
// pide la regla de stock con transacción: sin acceso a Supabase para probar una función
// plpgsql esta sesión, esto usa UPDATEs condicionados (compare-and-swap sobre
// el valor leído + el CHECK constraint de la tabla como última defensa) y una
// compensación manual best-effort si algo falla a mitad de camino. Conviene
// migrar esto a una función de Postgres con locking antes de manejar tráfico
// concurrente real.

export interface ReserveItem {
  productName: string;
  quantity: number;
}

interface FifoTakenLot {
  purchaseId: string;
  code: string;
  quantity: number;
  costeFinalUsd: number | null;
}

export const FIFO_MAX_PASSES = 3;

/** Qué lotes entran al FIFO: los de un nombre (Ventas) o los de una lista de códigos (variante del catálogo). */
type FifoTarget = string | { codes: string[]; label: string };

export async function walkFifoLots(
  target: FifoTarget,
  quantity: number,
  column: 'quantity_reserved' | 'quantity_sold',
): Promise<FifoTakenLot[]> {
  let remaining = quantity;
  const taken: FifoTakenLot[] = [];
  const productName = typeof target === 'string' ? target : target.label;

  for (let pass = 0; pass < FIFO_MAX_PASSES && remaining > 0; pass++) {
    let query = db
      .from('purchases')
      .select('id, code, quantity, quantity_sold, quantity_reserved, coste_final, exchange_rate');
    query = typeof target === 'string' ? query.eq('product_name', target) : query.in('code', target.codes);
    const { data, error } = await query
      .eq('status', 'received')
      .order('purchase_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const lots = (data ?? []) as unknown as {
      id: string;
      code: string;
      quantity: number;
      quantity_sold: number;
      quantity_reserved: number;
      coste_final: number | null;
      exchange_rate: number | null;
    }[];

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = lot.quantity - lot.quantity_sold - lot.quantity_reserved;
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      const currentValue = column === 'quantity_reserved' ? lot.quantity_reserved : lot.quantity_sold;

      const { data: updated, error: updateError } = await db
        .from('purchases')
        .update({ [column]: currentValue + take })
        .eq('id', lot.id)
        .eq(column, currentValue) // compare-and-swap: solo si nadie más lo tocó desde la lectura
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) continue; // conflicto: se reintenta este lote en la próxima pasada

      remaining -= take;
      const costeFinalUsd =
        lot.coste_final != null && lot.exchange_rate ? round(lot.coste_final / lot.exchange_rate, 4) : null;
      taken.push({ purchaseId: lot.id, code: lot.code, quantity: take, costeFinalUsd });
    }
  }

  if (remaining > 0) {
    // Compensación best-effort: no hay TX real, así que se deshace a mano lo
    // que sí se alcanzó a tomar antes de reportar el faltante.
    for (const lot of taken) {
      await releaseFifoLot(lot.purchaseId, column, lot.quantity);
    }
    throw new BadRequestError(`Stock insuficiente de "${productName}": faltan ${remaining} unidad(es).`);
  }

  return taken;
}

export async function releaseFifoLot(
  purchaseId: string,
  column: 'quantity_reserved' | 'quantity_sold',
  quantity: number,
): Promise<void> {
  // Compare-and-swap con reintentos: sin el `.eq(column, current)` dos
  // liberaciones simultáneas se pisaban y una se perdía.
  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data } = await db.from('purchases').select(column).eq('id', purchaseId).maybeSingle();
    if (!data) return; // best-effort: si esto falla queda para revisión manual
    const current = (data as unknown as Record<string, number>)[column] ?? 0;
    const { data: updated } = await db
      .from('purchases')
      .update({ [column]: Math.max(0, current - quantity) })
      .eq('id', purchaseId)
      .eq(column, current)
      .select('id')
      .maybeSingle();
    if (updated) return;
  }
  console.error(`[inventory] No se pudo liberar ${quantity} de ${column} en el lote ${purchaseId}: revisar a mano.`);
}

// Reserva stock para las líneas de un pedido/cotización (quantity_reserved),
// creando una fila en `stock_reservations` por cada lote que aporta unidades.
export async function reserveForItems(
  orderId: string,
  items: ReserveItem[],
): Promise<FifoTakenLot[]> {
  const allTaken: FifoTakenLot[] = [];

  try {
    for (const item of items) {
      const taken = await walkFifoLots(item.productName, item.quantity, 'quantity_reserved');
      for (const lot of taken) {
        const { error } = await db.from('stock_reservations').insert({
          order_id: orderId,
          purchase_id: lot.purchaseId,
          code: lot.code,
          quantity: lot.quantity,
          unit_final_usd: lot.costeFinalUsd,
          status: 'active',
        });
        if (error) throw error;
      }
      allTaken.push(...taken);
    }
    return allTaken;
  } catch (err) {
    // Compensación best-effort de las líneas anteriores que sí se alcanzaron
    // a reservar antes de que fallara esta.
    for (const lot of allTaken) {
      await releaseFifoLot(lot.purchaseId, 'quantity_reserved', lot.quantity);
    }
    await db
      .from('stock_reservations')
      .delete()
      .eq('order_id', orderId)
      .eq('status', 'active');
    throw err;
  }
}

// Venta directa sin reserva previa (ej. POS/factura inmediata): suma
// directamente a quantity_sold en vez de pasar por quantity_reserved.
export async function takeFifo(productName: string, quantity: number): Promise<FifoTakenLot[]> {
  return walkFifoLots(productName, quantity, 'quantity_sold');
}

// Confirma una reserva existente (ej. al aprobar el pedido): mueve lo
// reservado a vendido en cada lote y marca las reservas como consumidas.
export async function consumeReservation(orderId: string): Promise<{ consumed: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'active');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { consumed: 0 };

  // En serie y con reintentos: antes, si el compare-and-swap no encontraba la
  // fila (otro proceso tocó el lote en el medio) no había error, la reserva se
  // marcaba consumida igual y esas unidades quedaban reservadas para siempre.
  for (const reservation of reservations) {
    let done = false;
    for (let pass = 0; pass < FIFO_MAX_PASSES && !done; pass++) {
      const { data: purchase, error: purchaseError } = await db
        .from('purchases')
        .select('quantity_sold, quantity_reserved')
        .eq('id', reservation.purchase_id)
        .single();
      if (purchaseError) throw purchaseError;

      const { data: updated, error: updateError } = await db
        .from('purchases')
        .update({
          quantity_sold: purchase.quantity_sold + reservation.quantity,
          quantity_reserved: purchase.quantity_reserved - reservation.quantity,
        })
        .eq('id', reservation.purchase_id)
        .eq('quantity_reserved', purchase.quantity_reserved) // compare-and-swap
        .eq('quantity_sold', purchase.quantity_sold)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      done = !!updated;
    }
    if (!done) {
      throw new BadRequestError('El stock del lote cambió mientras se aprobaba la venta. Intentá aprobarla de nuevo.');
    }
    // Se marca una por una: si la siguiente falla, un reintento solo procesa
    // las que siguen activas y no vuelve a sumar a vendido las ya movidas.
    const { error: markError } = await db
      .from('stock_reservations')
      .update({ status: 'consumed' })
      .eq('id', reservation.id);
    if (markError) throw markError;
  }

  return { consumed: reservations.length };
}

// Contraparte de consumeReservation: libera reservas activas de un pedido sin
// convertirlas en venta (rechazo de pedido, o limpieza si el registro falló a
// mitad de camino). Devuelve quantity_reserved en cada lote y marca las
// reservas como liberadas.
export async function releaseReservations(orderId: string): Promise<{ released: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'active');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { released: 0 };

  const releasePromises = reservations.map(reservation => 
    releaseFifoLot(reservation.purchase_id, 'quantity_reserved', reservation.quantity)
  );
  await Promise.all(releasePromises);

  const reservationIds = reservations.map(r => r.id);
  const { error: markError } = await db
    .from('stock_reservations')
    .update({ status: 'released' })
    .in('id', reservationIds);
  if (markError) throw markError;

  return { released: reservations.length };
}

export async function releaseConsumedReservations(orderId: string): Promise<{ released: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'consumed');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { released: 0 };

  const releasePromises = reservations.map(reservation => 
    releaseFifoLot(reservation.purchase_id, 'quantity_sold', reservation.quantity)
  );
  await Promise.all(releasePromises);

  const reservationIds = reservations.map(r => r.id);
  const { error: markError } = await db
    .from('stock_reservations')
    .update({ status: 'released' })
    .in('id', reservationIds);
  if (markError) throw markError;

  return { released: reservations.length };
}
