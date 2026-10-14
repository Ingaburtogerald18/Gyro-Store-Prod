// Ventas que nacen o cambian fuera del editor:
//   · un pedido web que se convierte en venta (con su stock ya apartado), y
//   · la devolución de una línea de una venta ya aprobada (garantía o cambio).
//
// Las dos necesitan la migración 0023 (public_orders.sale_id, sale_returns y
// stock_movements). Sin ella responden con un error claro y no tocan nada.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { computeLineCommission, computeOrderLineSnapshot } from './commission';
import {
  codesForVariant,
  recordStockMovement,
  releasePublicOrderReservations,
  releaseFifoLot,
  returnSoldUnits,
  walkFifoLots,
} from '../inventory/inventory';
import { isMissingColumn } from '../orders/order-persistence';
import { recordCommissionAdjustment } from './seller-payments';
import { BadRequestError } from '../../utils/http-error';
import { firstOfEmbed } from '../../utils/first-of-embed';

const MISSING_0023 = 'Falta aplicar la migración 0023 en Supabase para usar esta función.';

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', 'PGRST205', 'PGRST204'].includes(error.code ?? '');
}

interface LotEmbed {
  code: string | null;
  product_name: string;
  coste_final: number | null;
  costo_f_u: number | null;
}

// ============================================================================
// ── Pedido web → venta ──
// ============================================================================

export interface ConvertedSale {
  saleId: string;
  /** Unidades que se apartaron recién ahora (el pedido no las tenía reservadas). */
  newlyReserved: number;
}

/**
 * Crea una venta pendiente de aprobación a partir de un pedido web. Las
 * unidades que el pedido ya tenía apartadas pasan a la venta tal cual (mismos
 * lotes); lo que falte se aparta ahora por FIFO entre los lotes de la variante.
 * El precio de cada unidad es el del pedido, con el descuento por código
 * repartido entre las líneas (igual que una factura con descuento).
 */
export async function convertPublicOrderToSale(
  publicOrderId: string,
  user: { uid: string; email: string },
  opts: { sellerId?: string } = {},
): Promise<ConvertedSale> {
  const { data: orderRow, error: orderError } = await db
    .from('public_orders')
    .select('id, status, phone, contact_id, total, code_discount, sale_id')
    .eq('id', publicOrderId)
    .maybeSingle();
  if (isMissingColumn(orderError)) throw new BadRequestError(MISSING_0023);
  if (orderError) throw orderError;
  if (!orderRow) throw new BadRequestError('El pedido no existe.');
  const order = orderRow as {
    id: string;
    status: string;
    phone: string | null;
    contact_id: string | null;
    total: number | null;
    code_discount: number | null;
    sale_id: string | null;
  };
  if (order.sale_id) throw new BadRequestError('Este pedido ya se convirtió en venta.');
  if (order.status === 'cancelled') throw new BadRequestError('Un pedido cancelado no se puede convertir en venta.');

  type Line = { sku: string | null; quantity: number; precio_unit: number | null; variant_name?: string | null; product_name?: string | null };
  const readLines = (columns: string) =>
    db.from('public_order_items').select(columns).eq('public_order_id', publicOrderId);
  let { data: lineRows, error: linesError } = await readLines('sku, quantity, precio_unit, variant_name, product_name');
  if (isMissingColumn(linesError)) ({ data: lineRows, error: linesError } = await readLines('sku, quantity, precio_unit'));
  if (linesError) throw linesError;
  const lines = (lineRows ?? []) as unknown as Line[];
  if (!lines.length) throw new BadRequestError('El pedido no tiene productos.');
  if (lines.some((l) => !l.sku || l.sku.startsWith('combo:'))) {
    throw new BadRequestError('El pedido tiene combos: por ahora registralo a mano en Ventas.');
  }

  // Vendedor: el elegido, o quien convierte.
  let sellerUid: string = user.uid;
  let sellerEmail: string = user.email;
  if (opts.sellerId) {
    const { data, error } = await db.from('profiles').select('email').eq('id', opts.sellerId).maybeSingle();
    if (error) throw error;
    if (!data?.email) throw new BadRequestError('El vendedor elegido no existe. Elegí otro.');
    sellerUid = opts.sellerId;
    sellerEmail = data.email as string;
  }

  // Descuento por código: se reparte proporcional entre las líneas.
  const rawSubtotal = lines.reduce((sum, l) => sum + l.quantity * Number(l.precio_unit ?? 0), 0);
  const discount = Number(order.code_discount ?? 0);
  const factor = rawSubtotal > 0 ? Math.max(0, (rawSubtotal - discount) / rawSubtotal) : 1;

  // Reservas que el pedido ya tenía (0022). Sin la columna no hay ninguna.
  type Reservation = { id: string; purchase_id: string; quantity: number; purchases: LotEmbed | LotEmbed[] | null };
  let pool: Reservation[] = [];
  {
    const { data, error } = await db
      .from('stock_reservations')
      .select('id, purchase_id, quantity, purchases(code, product_name, coste_final, costo_f_u)')
      .eq('public_order_id', publicOrderId)
      .eq('status', 'active');
    if (error && !isMissingColumn(error)) throw error;
    pool = (data ?? []) as unknown as Reservation[];
  }

  // Cada unidad que termina en la venta, con su lote, su costo y su precio.
  type Chunk = { purchaseId: string; quantity: number; productName: string; costeFinal: number; costoFU: number; price: number };
  const chunks: Chunk[] = [];
  const transferredIds: string[] = [];
  const newlyTaken: { purchaseId: string; code: string; quantity: number; costeFinalUsd: number | null }[] = [];

  const rollbackNewlyTaken = async () => {
    for (const lot of newlyTaken) await releaseFifoLot(lot.purchaseId, 'quantity_reserved', lot.quantity);
  };

  try {
    for (const line of lines) {
      const price = round(Number(line.precio_unit ?? 0) * factor, 2);
      const label = [line.product_name || 'Producto', line.variant_name ?? ''].filter(Boolean).join(' · ');
      const codes = await codesForVariant({ catalogItemId: line.sku!, variantKey: line.variant_name ?? '' });
      if (!codes.length) {
        throw new BadRequestError(`"${label}" no tiene lotes vinculados en Inventario: vinculalo antes de convertir.`);
      }

      let need = line.quantity;
      for (const r of pool) {
        if (need <= 0) break;
        const lot = firstOfEmbed(r.purchases);
        if (!lot?.code || !codes.includes(lot.code) || transferredIds.includes(r.id)) continue;
        if (r.quantity > need) continue; // se apartó para otra línea más grande
        transferredIds.push(r.id);
        need -= r.quantity;
        chunks.push({
          purchaseId: r.purchase_id,
          quantity: r.quantity,
          productName: lot.product_name,
          costeFinal: Number(lot.coste_final ?? 0),
          costoFU: Number(lot.costo_f_u ?? 0),
          price,
        });
      }

      if (need > 0) {
        const taken = await walkFifoLots({ codes, label }, need, 'quantity_reserved');
        newlyTaken.push(...taken);
        const { data: lotRows, error: lotError } = await db
          .from('purchases')
          .select('id, product_name, coste_final, costo_f_u')
          .in('id', taken.map((t) => t.purchaseId));
        if (lotError) throw lotError;
        const byId = new Map(
          ((lotRows ?? []) as { id: string; product_name: string; coste_final: number | null; costo_f_u: number | null }[]).map((r) => [r.id, r]),
        );
        for (const t of taken) {
          const lot = byId.get(t.purchaseId);
          chunks.push({
            purchaseId: t.purchaseId,
            quantity: t.quantity,
            productName: lot?.product_name ?? label,
            costeFinal: Number(lot?.coste_final ?? 0),
            costoFU: Number(lot?.costo_f_u ?? 0),
            price,
          });
        }
      }
    }
  } catch (err) {
    await rollbackNewlyTaken();
    throw err;
  }

  // Una línea de venta por nombre de lote: es la llave con que `approveSale`
  // costea cada línea contra sus reservas.
  const config = await getFinancialConfig();
  const groups = new Map<string, { quantity: number; revenue: number; cost: number; costFU: number }>();
  for (const c of chunks) {
    const g = groups.get(c.productName) ?? { quantity: 0, revenue: 0, cost: 0, costFU: 0 };
    g.quantity += c.quantity;
    g.revenue += c.price * c.quantity;
    g.cost += c.costeFinal * c.quantity;
    g.costFU += c.costoFU * c.quantity;
    groups.set(c.productName, g);
  }
  const saleLines = [...groups.entries()].map(([productName, g]) => {
    const snapshot = computeOrderLineSnapshot(
      {
        sku: productName,
        quantity: g.quantity,
        basePrice: round(g.revenue / g.quantity, 2),
        costeFinal: round(g.cost / g.quantity, 2),
        costoFU: round(g.costFU / g.quantity, 2),
      },
      config,
    );
    return { productName, snapshot };
  });

  const { data: sale, error: saleError } = await db
    .from('orders')
    .insert({
      status: 'pending_approval',
      sale_origin: 'native',
      seller_uid: sellerUid,
      seller_email: sellerEmail,
      phone: order.phone,
      contact_id: order.contact_id,
      total: Number(order.total ?? 0),
    })
    .select('id')
    .single();
  if (saleError) {
    await rollbackNewlyTaken();
    throw saleError;
  }
  const saleId = sale.id as string;

  try {
    const { error: itemsError } = await db.from('order_items').insert(
      saleLines.map(({ productName, snapshot }) => ({
        order_id: saleId,
        sku: productName,
        quantity: snapshot.quantity,
        precio_unit: snapshot.precioUnit,
        coste_final_snap: snapshot.costeFinalSnap,
        utilidad_bruta: snapshot.utilidadBruta,
        salary: snapshot.salary,
        utilidad_neta: snapshot.utilidadNeta,
        comision: snapshot.comision,
        ganancia_tienda: snapshot.gananciaTienda,
        pozos: snapshot.pozos,
      })),
    );
    if (itemsError) throw itemsError;

    if (transferredIds.length) {
      const { error } = await db
        .from('stock_reservations')
        .update({ order_id: saleId, public_order_id: null })
        .in('id', transferredIds)
        .eq('status', 'active');
      if (error) throw error;
    }
    for (const lot of newlyTaken) {
      const { error } = await db.from('stock_reservations').insert({
        order_id: saleId,
        purchase_id: lot.purchaseId,
        code: lot.code,
        quantity: lot.quantity,
        unit_final_usd: lot.costeFinalUsd,
        status: 'active',
      });
      if (error) throw error;
    }

    // Compare-and-swap: si otro admin lo convirtió al mismo tiempo, se deshace.
    const { data: marked, error: markError } = await db
      .from('public_orders')
      .update({ sale_id: saleId })
      .eq('id', publicOrderId)
      .is('sale_id', null)
      .select('id')
      .maybeSingle();
    if (markError) throw markError;
    if (!marked) throw new BadRequestError('Este pedido ya se convirtió en venta.');
  } catch (err) {
    if (transferredIds.length) {
      await db
        .from('stock_reservations')
        .update({ order_id: null, public_order_id: publicOrderId })
        .in('id', transferredIds);
    }
    await db.from('stock_reservations').delete().eq('order_id', saleId);
    await rollbackNewlyTaken();
    await db.from('orders').delete().eq('id', saleId);
    throw err;
  }

  // Lo que el pedido tenía apartado y no pasó a la venta (p. ej. una reserva
  // más grande que la línea) se libera: desde ahora el stock lo maneja la venta.
  await releasePublicOrderReservations(publicOrderId);

  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: saleId,
    action: 'from_public_order',
    reason: `Venta creada desde el pedido web #${publicOrderId.slice(0, 8).toUpperCase()}`,
    author_uid: user.uid,
  });

  return { saleId, newlyReserved: newlyTaken.reduce((sum, l) => sum + l.quantity, 0) };
}

// ============================================================================
// ── Devolución de una línea ──
// ============================================================================

export interface SaleReturnInput {
  productName: string;
  quantity: number;
  destination: 'stock' | 'merma';
  /** Lo que se le devuelve al cliente. Por defecto, precio × cantidad. 0 si fue un cambio. */
  refundAmount?: number;
  reason: string;
}

export interface SaleReturn {
  id: string;
  orderId: string;
  productName: string;
  quantity: number;
  destination: 'stock' | 'merma';
  refundAmount: number;
  comisionBefore: number | null;
  comisionAfter: number | null;
  reason: string;
  createdAt: string;
}

/**
 * Devuelve unidades de una venta aprobada o pagada. La unidad vuelve a bodega
 * (`stock`) o sale del lote como merma (`merma`, defecto de fábrica). La línea
 * se recalcula con su costo congelado; si la venta ya se pagó, la diferencia
 * de comisión queda como ajuste para el próximo pago.
 */
export async function returnSaleLine(
  orderId: string,
  input: SaleReturnInput,
  user: { uid: string },
): Promise<SaleReturn> {
  {
    const { error } = await db.from('sale_returns').select('id').limit(1);
    if (isMissingTable(error)) throw new BadRequestError(MISSING_0023);
    if (error) throw error;
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new BadRequestError('La cantidad tiene que ser un entero mayor a 0.');
  }
  if (!input.reason.trim()) throw new BadRequestError('Escribí el motivo de la devolución.');

  const { data: orderRow, error: orderError } = await db
    .from('orders')
    .select('id, status, total, seller_uid, seller_email')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) throw new BadRequestError('Venta no encontrada.');
  const order = orderRow as { id: string; status: string; total: number | null; seller_uid: string | null; seller_email: string };
  if (order.status !== 'approved' && order.status !== 'paid') {
    throw new BadRequestError('Solo se devuelven productos de ventas aprobadas o pagadas. Una pendiente se edita.');
  }

  const { data: itemRow, error: itemError } = await db
    .from('order_items')
    .select('id, sku, quantity, precio_unit, coste_final_snap, comision, pozos')
    .eq('order_id', orderId)
    .eq('sku', input.productName)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!itemRow) throw new BadRequestError('Ese producto no está en la venta.');
  const item = itemRow as {
    id: string;
    sku: string;
    quantity: number;
    precio_unit: number | null;
    coste_final_snap: number | null;
    comision: number | null;
    pozos: Record<string, number> | null;
  };
  if (input.quantity > item.quantity) {
    throw new BadRequestError(`La venta tiene ${item.quantity} unidad(es) de ese producto.`);
  }

  // Lotes de donde salió: las reservas consumidas de esa línea, la más nueva
  // primero (se devuelve contra el último lote que se tocó).
  const { data: resRows, error: resError } = await db
    .from('stock_reservations')
    .select('id, purchase_id, code, quantity, unit_final_usd, created_at, purchases(product_name)')
    .eq('order_id', orderId)
    .eq('status', 'consumed')
    .order('created_at', { ascending: false });
  if (resError) throw resError;
  const reservations = ((resRows ?? []) as unknown as {
    id: string;
    purchase_id: string;
    code: string | null;
    quantity: number;
    unit_final_usd: number | null;
    purchases: { product_name: string } | { product_name: string }[] | null;
  }[]).filter((r) => firstOfEmbed(r.purchases)?.product_name === item.sku);
  const available = reservations.reduce((sum, r) => sum + r.quantity, 0);
  if (available < input.quantity) {
    throw new BadRequestError('No se encontraron los lotes de esa venta para devolver las unidades. Revisalo a mano en Inventario.');
  }

  const reason = input.reason.trim();
  let remaining = input.quantity;
  for (const r of reservations) {
    if (remaining <= 0) break;
    const take = Math.min(r.quantity, remaining);
    await returnSoldUnits(r.purchase_id, take, input.destination);

    if (take === r.quantity) {
      const { error } = await db.from('stock_reservations').update({ status: 'returned' }).eq('id', r.id);
      if (error) throw error;
    } else {
      // Se parte la reserva: lo que sigue vendido y lo devuelto, para que
      // la venta siga cuadrando con sus lotes.
      const { error } = await db.from('stock_reservations').update({ quantity: r.quantity - take }).eq('id', r.id);
      if (error) throw error;
      const { error: insertError } = await db.from('stock_reservations').insert({
        order_id: orderId,
        purchase_id: r.purchase_id,
        code: r.code,
        quantity: take,
        unit_final_usd: r.unit_final_usd,
        status: 'returned',
      });
      if (insertError) throw insertError;
    }

    await recordStockMovement({
      purchaseId: r.purchase_id,
      kind: input.destination === 'stock' ? 'return_to_stock' : 'write_off',
      quantity: take,
      reason: `Devolución: ${reason}`,
      orderId,
      createdBy: user.uid,
    });
    remaining -= take;
  }

  // La línea se recalcula con su costo congelado (no con el de hoy).
  const comisionBefore = Number(item.comision ?? 0);
  const newQty = item.quantity - input.quantity;
  let comisionAfter = 0;
  if (newQty === 0) {
    const { error } = await db.from('order_items').delete().eq('id', item.id);
    if (error) throw error;
  } else {
    const config = await getFinancialConfig();
    const pozosTotal = Object.values(item.pozos ?? {}).reduce((sum, v) => sum + Number(v || 0), 0);
    const commission = computeLineCommission(
      {
        precioUnit: Number(item.precio_unit ?? 0),
        quantity: newQty,
        costeFinal: Number(item.coste_final_snap ?? 0),
        costoFU: round(pozosTotal / item.quantity, 2),
      },
      config,
    );
    comisionAfter = commission.comision;
    const { error } = await db
      .from('order_items')
      .update({
        quantity: newQty,
        utilidad_bruta: commission.utilidadBruta,
        salary: commission.salary,
        utilidad_neta: commission.utilidadNeta,
        comision: commission.comision,
        ganancia_tienda: commission.gananciaTienda,
        pozos: commission.pozos,
      })
      .eq('id', item.id);
    if (error) throw error;
  }

  const refund = round(
    input.refundAmount ?? Number(item.precio_unit ?? 0) * input.quantity,
    2,
  );
  const { error: totalError } = await db
    .from('orders')
    .update({ total: Math.max(0, round(Number(order.total ?? 0) - refund, 2)) })
    .eq('id', orderId);
  if (totalError) throw totalError;

  if (order.status === 'paid') {
    await recordCommissionAdjustment({
      sellerEmail: order.seller_email,
      sellerUid: order.seller_uid,
      orderId,
      comisionVieja: comisionBefore,
      comisionNueva: comisionAfter,
      reason: `Devolución de ${input.quantity} × ${item.sku}`,
      createdBy: user.uid,
    });
  }

  const { data: saved, error: saveError } = await db
    .from('sale_returns')
    .insert({
      order_id: orderId,
      sku: item.sku,
      quantity: input.quantity,
      destination: input.destination,
      refund_amount: refund,
      comision_before: comisionBefore,
      comision_after: comisionAfter,
      reason,
      created_by: user.uid,
    })
    .select('id, created_at')
    .single();
  if (saveError) throw saveError;

  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_return',
    reason: `${input.quantity} × ${item.sku} → ${input.destination === 'stock' ? 'bodega' : 'merma'}: ${reason}`,
    author_uid: user.uid,
  });

  return {
    id: saved.id as string,
    orderId,
    productName: item.sku,
    quantity: input.quantity,
    destination: input.destination,
    refundAmount: refund,
    comisionBefore,
    comisionAfter,
    reason,
    createdAt: saved.created_at as string,
  };
}

export async function listSaleReturns(orderId: string): Promise<SaleReturn[]> {
  const { data, error } = await db
    .from('sale_returns')
    .select('id, order_id, sku, quantity, destination, refund_amount, comision_before, comision_after, reason, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    order_id: string;
    sku: string;
    quantity: number;
    destination: 'stock' | 'merma';
    refund_amount: number;
    comision_before: number | null;
    comision_after: number | null;
    reason: string;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    productName: r.sku,
    quantity: r.quantity,
    destination: r.destination,
    refundAmount: Number(r.refund_amount),
    comisionBefore: r.comision_before == null ? null : Number(r.comision_before),
    comisionAfter: r.comision_after == null ? null : Number(r.comision_after),
    reason: r.reason,
    createdAt: r.created_at,
  }));
}
