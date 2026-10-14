// Movimientos de stock: devoluciones, ajustes y su historial.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import { FIFO_MAX_PASSES } from './inventory-fifo';

// ============================================================================
// ── Movimientos de stock (devoluciones, merma, ajustes) ──
// ============================================================================
// Todo cambio de stock que NO es una venta normal queda registrado en
// `stock_movements` (migración 0023): devolución a bodega, merma y ajuste de
// conteo. Antes un ajuste solo se podía hacer editando la cantidad del lote, y
// no quedaba rastro de por qué cambió.

export type StockMovementKind = 'return_to_stock' | 'write_off' | 'adjust_in' | 'adjust_out';

export interface StockMovement {
  id: string;
  purchaseId: string | null;
  code: string | null;
  kind: StockMovementKind;
  quantity: number;
  unitCostCs: number | null;
  reason: string;
  orderId: string | null;
  createdBy: string | null;
  createdAt: string;
}

const MISSING_0023 = 'Falta aplicar la migración 0023 en Supabase para registrar movimientos de stock.';

export async function hasStockMovementsTable(): Promise<boolean> {
  const { error } = await db.from('stock_movements').select('id').limit(1);
  if (!error) return true;
  // 42P01 = tabla inexistente; PGRST205 = PostgREST no la tiene en caché.
  const code = (error as { code?: string }).code;
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return false;
  throw error;
}

export async function recordStockMovement(input: {
  purchaseId: string;
  kind: StockMovementKind;
  quantity: number;
  reason: string;
  orderId?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  const { data: lot } = await db
    .from('purchases')
    .select('code, coste_final')
    .eq('id', input.purchaseId)
    .maybeSingle();
  const { error } = await db.from('stock_movements').insert({
    purchase_id: input.purchaseId,
    code: (lot?.code as string | undefined) ?? null,
    kind: input.kind,
    quantity: input.quantity,
    unit_cost_cs: (lot?.coste_final as number | null | undefined) ?? null,
    reason: input.reason,
    order_id: input.orderId ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) throw error;
}

// Mueve unidades vendidas de un lote: `stock` las vuelve disponibles
// (quantity_sold − n); `merma` las saca del lote (quantity − n y
// quantity_sold − n), así no vuelven a venderse pero el lote cuadra.
export async function returnSoldUnits(
  purchaseId: string,
  quantity: number,
  destination: 'stock' | 'merma',
): Promise<void> {
  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data, error } = await db
      .from('purchases')
      .select('quantity, quantity_sold')
      .eq('id', purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El lote de esa venta ya no existe.');
    const lot = data as { quantity: number; quantity_sold: number };
    if (lot.quantity_sold < quantity) {
      throw new BadRequestError('El lote no tiene tantas unidades vendidas para devolver.');
    }
    const patch =
      destination === 'stock'
        ? { quantity_sold: lot.quantity_sold - quantity }
        : { quantity: lot.quantity - quantity, quantity_sold: lot.quantity_sold - quantity };
    const { data: updated, error: updateError } = await db
      .from('purchases')
      .update(patch)
      .eq('id', purchaseId)
      .eq('quantity', lot.quantity) // compare-and-swap
      .eq('quantity_sold', lot.quantity_sold)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) return;
  }
  throw new BadRequestError('El stock del lote cambió mientras se procesaba la devolución. Intentá de nuevo.');
}

// Ajuste manual de conteo o merma sobre un lote recibido. Una salida no puede
// dejar el lote por debajo de lo vendido + reservado.
export async function adjustStock(
  purchaseId: string,
  input: { kind: 'adjust_in' | 'adjust_out' | 'write_off'; quantity: number; reason: string },
  authorUid: string,
): Promise<{ quantity: number; available: number }> {
  if (!(await hasStockMovementsTable())) throw new BadRequestError(MISSING_0023);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new BadRequestError('La cantidad tiene que ser un entero mayor a 0.');
  }
  if (!input.reason.trim()) throw new BadRequestError('Escribí el motivo del ajuste.');

  const delta = input.kind === 'adjust_in' ? input.quantity : -input.quantity;

  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data, error } = await db
      .from('purchases')
      .select('status, quantity, quantity_sold, quantity_reserved')
      .eq('id', purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El lote no existe.');
    const lot = data as { status: string; quantity: number; quantity_sold: number; quantity_reserved: number };
    if (lot.status !== 'received') throw new BadRequestError('Solo se ajusta stock de lotes ya recibidos.');

    const next = lot.quantity + delta;
    const free = lot.quantity - lot.quantity_sold - lot.quantity_reserved;
    if (next < lot.quantity_sold + lot.quantity_reserved) {
      throw new BadRequestError(`Solo hay ${free} unidad(es) libres en este lote para sacar.`);
    }

    const { data: updated, error: updateError } = await db
      .from('purchases')
      .update({ quantity: next })
      .eq('id', purchaseId)
      .eq('quantity', lot.quantity) // compare-and-swap
      .eq('quantity_sold', lot.quantity_sold)
      .eq('quantity_reserved', lot.quantity_reserved)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) continue;

    await recordStockMovement({
      purchaseId,
      kind: input.kind,
      quantity: input.quantity,
      reason: input.reason.trim(),
      createdBy: authorUid,
    });
    return { quantity: next, available: next - lot.quantity_sold - lot.quantity_reserved };
  }
  throw new BadRequestError('El stock del lote cambió mientras se ajustaba. Intentá de nuevo.');
}

export async function listStockMovements(purchaseId?: string, limit = 200): Promise<StockMovement[]> {
  if (!(await hasStockMovementsTable())) return [];
  let query = db
    .from('stock_movements')
    .select('id, purchase_id, code, kind, quantity, unit_cost_cs, reason, order_id, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (purchaseId) query = query.eq('purchase_id', purchaseId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    purchase_id: string | null;
    code: string | null;
    kind: StockMovementKind;
    quantity: number;
    unit_cost_cs: number | null;
    reason: string;
    order_id: string | null;
    created_by: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    purchaseId: r.purchase_id,
    code: r.code,
    kind: r.kind,
    quantity: r.quantity,
    unitCostCs: r.unit_cost_cs == null ? null : Number(r.unit_cost_cs),
    reason: r.reason,
    orderId: r.order_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}
