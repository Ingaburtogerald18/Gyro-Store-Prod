// Combos desde Inventario: nombre, precio e incluidos (fotos y visibilidad van en el modo edición).
// El precio es el del paquete: `items` es solo informativo y el pedido usa `combos.price`.
import { db } from '../../core/supabase';
import type { AdminCombo, AdminComboInput, ComboItem } from '../../../shared/schemas';

const COMBO_COLUMNS = 'id, name, price, items, images, published, sort_order, updated_at';

interface ComboRow {
  id: string;
  name: string | null;
  price: number | null;
  items: unknown;
  images: unknown;
  published: boolean;
  sort_order: number;
  updated_at: string;
}

// `items` es jsonb opaco en la base: se lee tolerante y se descarta cualquier
// entrada que no tenga la forma esperada, en vez de romper el listado entero.
function toItems(value: unknown): ComboItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const it = raw as Record<string, unknown>;
    if (typeof it.catalogItemId !== 'string' || typeof it.name !== 'string') return [];
    const qty = Math.floor(Number(it.quantity));
    return [{ catalogItemId: it.catalogItemId, name: it.name, quantity: qty > 0 ? qty : 1 }];
  });
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toAdminCombo(row: ComboRow): AdminCombo {
  return {
    id: row.id,
    name: row.name ?? '',
    price: row.price ?? 0,
    items: toItems(row.items),
    images: toStringArray(row.images),
    published: row.published,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function toRow(input: AdminComboInput) {
  return { name: input.name.trim(), price: input.price, items: input.items };
}

export async function listAdminCombos(): Promise<AdminCombo[]> {
  const { data, error } = await db
    .from('combos')
    .select(COMBO_COLUMNS)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as ComboRow[]).map(toAdminCombo);
}

export async function getAdminCombo(id: string): Promise<AdminCombo | null> {
  const { data, error } = await db
    .from('combos')
    .select(COMBO_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toAdminCombo(data as unknown as ComboRow) : null;
}

export async function createAdminCombo(input: AdminComboInput): Promise<AdminCombo> {
  // Nace oculto y al final: se muestra al publicar desde el modo edición.
  const { data: last } = await db
    .from('combos')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from('combos')
    .insert({ ...toRow(input), images: [], published: false, sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1 })
    .select(COMBO_COLUMNS)
    .single();
  if (error) throw error;
  return toAdminCombo(data as unknown as ComboRow);
}

export async function updateAdminCombo(
  id: string,
  input: AdminComboInput,
): Promise<AdminCombo | null> {
  const { data, error } = await db
    .from('combos')
    .update(toRow(input))
    .eq('id', id)
    .select(COMBO_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toAdminCombo(data as unknown as ComboRow) : null;
}

// Borrado real. Si el combo ya figura en pedidos, Postgres lo rechaza por FK
// (23503): se traduce a un 400 con mensaje claro, no un 500.
export async function deleteAdminCombo(id: string): Promise<boolean> {
  const { error } = await db.from('combos').delete().eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23503') {
      throw new Error('No se puede eliminar: ya hay pedidos asociados a este combo.');
    }
    throw error;
  }
  return true;
}
