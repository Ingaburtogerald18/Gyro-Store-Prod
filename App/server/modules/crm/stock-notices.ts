// «Avisame cuando haya» (migración 0028): el pedido de aviso entra al CRM como
// seguimiento. Nadie recibe mensajes automáticos: el equipo escribe por WhatsApp
// cuando la agenda marca «Ya llegó, avisar».
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import type { StockNotice } from '../../../shared/schemas';
import { buildVariants, collectMappedCodes, toCatalogDetail } from '../catalog/catalog-presenter';
import { getPublishedCatalogItem, listCatalogForPricing } from '../catalog/catalog';
import { getLotsByCodes } from '../inventory/inventory';
import { pickVariant } from '../orders/order-lines';

export interface StockNoticeResult {
  /** true si ya había un aviso abierto para ese teléfono y variante. */
  already: boolean;
}

// Los contactos viejos pueden tener el número con el código de país.
const phoneForms = (phone: string) => [phone, `505${phone}`, `+505${phone}`];

async function findOrCreateStoreContact(phone: string, name: string): Promise<string> {
  const find = () => db.from('contacts').select('id').in('phone', phoneForms(phone)).limit(1).maybeSingle();
  const { data: existing, error } = await find();
  if (error) throw error;
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await db
    .from('contacts')
    .insert({ phone, name, origin: 'store' })
    .select('id')
    .single();
  if (created) return created.id as string;
  // Carrera con otro pedido del mismo teléfono (contacts.phone es único): se relee.
  const { data: retry } = await find();
  if (retry) return retry.id as string;
  throw createError;
}

export async function createStockNotice(input: StockNotice): Promise<StockNoticeResult> {
  const item = await getPublishedCatalogItem(input.catalogItemId);
  if (!item) throw new BadRequestError('Este producto ya no está en la tienda.');

  const detail = toCatalogDetail(item, await getLotsByCodes(collectMappedCodes(item)));
  const picked = pickVariant(detail, input.variantName);
  if (!('variant' in picked)) throw new BadRequestError('Elegí la opción que querés que te avisemos.');
  const { variant } = picked;
  if (variant.availability === 'available') {
    throw new BadRequestError('Esta opción ya está disponible: podés pedirla ahora.');
  }
  if (variant.availability !== 'sold_out' && variant.availability !== 'coming_soon') {
    throw new BadRequestError('De esta opción no tenemos la disponibilidad confirmada: consultanos por WhatsApp.');
  }

  const contactId = await findOrCreateStoreContact(input.phone, input.name);
  const label = variant.variantName ? `${detail.name} · ${variant.variantName}` : detail.name;

  const { data: open, error: openError } = await db
    .from('stock_notices')
    .select('id, follow_ups!inner(status)')
    .eq('contact_id', contactId)
    .eq('catalog_item_id', item.id)
    .eq('variant_name', variant.variantName)
    .eq('follow_ups.status', 'pending')
    .limit(1);
  if (openError) throw openError;
  if (open && open.length > 0) return { already: true };

  const { data: followUp, error: followUpError } = await db
    .from('follow_ups')
    .insert({ contact_id: contactId, reason: `Avisar cuando llegue: ${label}`, status: 'pending' })
    .select('id')
    .single();
  if (followUpError) throw followUpError;

  const { error: noticeError } = await db.from('stock_notices').insert({
    contact_id: contactId,
    follow_up_id: followUp.id,
    catalog_item_id: item.id,
    variant_name: variant.variantName,
    label,
  });
  if (noticeError) {
    await db.from('follow_ups').delete().eq('id', followUp.id);
    throw noticeError;
  }

  await db
    .from('contact_activities')
    .insert({ contact_id: contactId, type: 'stock_notice', note: `Pidió aviso desde la tienda: ${label}.` });
  return { already: false };
}

interface NoticeRow {
  follow_up_id: string;
  catalog_item_id: string;
  variant_name: string;
  label: string;
}

/** Aviso de cada seguimiento, y si su variante ya tiene stock. */
export async function noticesForFollowUps(
  followUpIds: string[],
): Promise<Map<string, { label: string; arrived: boolean }>> {
  const out = new Map<string, { label: string; arrived: boolean }>();
  if (followUpIds.length === 0) return out;

  const { data, error } = await db
    .from('stock_notices')
    .select('follow_up_id, catalog_item_id, variant_name, label')
    .in('follow_up_id', followUpIds);
  // Sin la migración 0028 no hay avisos: la agenda sigue igual.
  if (error && ['42P01', 'PGRST205'].includes(error.code ?? '')) return out;
  if (error) throw error;
  const rows = (data ?? []) as NoticeRow[];
  if (rows.length === 0) return out;

  const items = await listCatalogForPricing([...new Set(rows.map((r) => r.catalog_item_id))]);
  const lots = await getLotsByCodes(items.flatMap(collectMappedCodes));
  const availableByItem = new Map(
    items.map((item) => [
      item.id,
      new Set(buildVariants(item, lots).filter((v) => v.availability === 'available').map((v) => v.variantName)),
    ]),
  );
  for (const row of rows) {
    out.set(row.follow_up_id, {
      label: row.label,
      arrived: availableByItem.get(row.catalog_item_id)?.has(row.variant_name) ?? false,
    });
  }
  return out;
}
