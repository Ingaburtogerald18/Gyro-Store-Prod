// Piezas comunes de las ventas: costo estimado de una línea, margen mínimo, cliente y vendedor.
import { db } from '../../core/supabase';
import { round, computeCosteFinal } from '../finance/costing';
import { getCurrentInventory, type InventoryRow } from '../inventory/inventory';
import { BadRequestError } from '../../utils/http-error';

// Costo estimado (sin reservar): promedio de los lotes que cubrirían `quantity` en orden FIFO,
// leyendo lo que ya devuelve getAvailableInventory.
export function estimateLineCost(
  productName: string,
  quantity: number,
  availableRows: InventoryRow[],
): { costeFinal: number; costoFU: number; available: number } {
  const lots = availableRows.filter((row) => row.productName === productName);
  const available = lots.reduce((sum, lot) => sum + (lot.available ?? 0), 0);

  let remaining = quantity;
  let costeFinalWeighted = 0;
  let costoFUWeighted = 0;
  let taken = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const lotAvailable = lot.available ?? 0;
    if (lotAvailable <= 0) continue;
    const take = Math.min(lotAvailable, remaining);
    const costeFinal = computeCosteFinal(lot.costRealCordobas ?? 0, lot.costoFijoCordobas ?? 0);
    costeFinalWeighted += costeFinal * take;
    costoFUWeighted += (lot.costoFijoCordobas ?? 0) * take;
    taken += take;
    remaining -= take;
  }

  return {
    costeFinal: taken > 0 ? round(costeFinalWeighted / taken, 2) : 0,
    costoFU: taken > 0 ? round(costoFUWeighted / taken, 2) : 0,
    available,
  };
}

// Un precio bajo el mínimo no bloquea: la venta entra marcada y el admin decide. Bloquear rebotaba
// facturas ya cobradas y dejaba tantear precios hasta encontrar el costo.
export function isBelowMinMargin(precioUnit: number, costeFinal: number, minMargin: number): boolean {
  return costeFinal > 0 && precioUnit < round(costeFinal * minMargin, 2);
}

export async function logBelowMinMargin(
  orderId: string,
  lines: { productName: string; precioUnit: number; costeFinal: number }[],
  minMargin: number,
  authorUid: string,
): Promise<void> {
  const below = lines.filter((l) => isBelowMinMargin(l.precioUnit, l.costeFinal, minMargin));
  if (!below.length) return;
  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'below_min_margin',
    reason: below
      .map((l) => `${l.productName}: C$ ${l.precioUnit.toFixed(2)} (mínimo C$ ${round(l.costeFinal * minMargin, 2).toFixed(2)})`)
      .join(' · '),
    author_uid: authorUid,
  });
}

// Con teléfono se reusa el contacto y el nombre solo se completa si estaba vacío (o con
// `overwriteName`); sin teléfono se busca por nombre. Nunca frena la venta.
export async function resolveContact(
  rawName: string | null | undefined,
  rawPhone: string | null | undefined,
  opts: { overwriteName?: boolean } = {},
): Promise<string | null> {
  const name = rawName?.trim() || null;
  const phone = rawPhone?.trim() || null;
  if (!name && !phone) return null;

  try {
    if (phone) {
      const findByPhone = () =>
        db.from('contacts').select('id, name').eq('phone', phone).maybeSingle();
      let { data: existing } = await findByPhone();
      if (!existing) {
        const { data: created, error } = await db
          .from('contacts')
          .insert({ phone, name })
          .select('id, name')
          .single();
        if (!error && created) return created.id as string;
        // Otro registro lo creó entre medio (unique por teléfono): se relee.
        ({ data: existing } = await findByPhone());
        if (!existing) return null;
      }
      const currentName = (existing.name as string | null)?.trim() || null;
      if (name && (!currentName || (opts.overwriteName && currentName !== name))) {
        await db.from('contacts').update({ name }).eq('id', existing.id);
      }
      return existing.id as string;
    }

    const { data: sameName } = await db
      .from('contacts')
      .select('id')
      .is('phone', null)
      .ilike('name', name!.replace(/[%_\\]/g, (c) => `\\${c}`))
      .limit(1);
    if (sameName && sameName.length > 0) return (sameName[0] as { id: string }).id;

    const { data: created } = await db.from('contacts').insert({ name }).select('id').single();
    return (created?.id as string) ?? null;
  } catch (err) {
    console.error('[sales] No se pudo resolver el contacto del cliente:', err);
    return null;
  }
}

// Si el vendedor elegido no existe se corta: si no, la comisión iría a la persona equivocada.
export async function resolveOverrideSeller(sellerId: string): Promise<{ uid: string; email: string }> {
  const { data, error } = await db.from('profiles').select('email').eq('id', sellerId).maybeSingle();
  if (error) throw error;
  if (!data?.email) {
    throw new BadRequestError('El vendedor elegido no existe o no tiene correo. Elegí otro o recargá la lista.');
  }
  return { uid: sellerId, email: data.email as string };
}

// Las unidades que la propia venta tiene reservadas o vendidas cuentan como disponibles: se devuelven
// antes de reservar de nuevo.
export async function inventoryForEdit(
  orderId: string,
  reservationStatus: 'active' | 'consumed',
): Promise<InventoryRow[]> {
  const [rows, { data, error }] = await Promise.all([
    getCurrentInventory(),
    db
      .from('stock_reservations')
      .select('purchase_id, quantity')
      .eq('order_id', orderId)
      .eq('status', reservationStatus),
  ]);
  if (error) throw error;

  const own = new Map<string, number>();
  for (const r of (data ?? []) as { purchase_id: string; quantity: number }[]) {
    own.set(r.purchase_id, (own.get(r.purchase_id) ?? 0) + Number(r.quantity));
  }

  return rows
    .map((row) => ({ ...row, available: (row.available ?? 0) + (own.get(row.id) ?? 0) }))
    .filter((row) => row.available > 0);
}
