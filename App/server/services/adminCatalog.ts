// Catálogo desde el panel. A diferencia del servicio público, acá SÍ se ven los
// productos despublicados y los precios de la cadena financiera.
//
// El modelo reparte un "producto" en dos tablas: el nombre y las specs viven en
// `templates` (el molde reutilizable) y los precios, imágenes y estado en
// `catalog_items`. Este servicio esconde ese reparto: el panel manda un objeto
// plano y acá se traduce.
import { db } from '../supabase';
import type {
  AdminProduct,
  AdminProductInput,
  SpecRow,
  TemplateAxis,
  VariantMappings,
} from '../../shared/schemas';
import { firstOfEmbed } from '../utils/firstOfEmbed';
import { normalizeAxes } from './catalogPresenter';

// Se listan las columnas a mano (nunca `select('*')`): así una columna nueva no
// se filtra sola a una respuesta sin que nadie lo revise.
const ADMIN_COLUMNS = [
  'id',
  'template_id',
  'name',
  'description',
  'price',
  'base_price',
  'precio_sugerido',
  'precio_tentativo',
  'images',
  'published',
  'is_promo',
  'sort_order',
  'spo_link',
  'updated_at',
  'category_id',
  'axis_options',
  'variant_mappings',
  // Fotos por color. La columna se llama `images_by_color` (ver el esquema); el
  // código la llamaba `color_images` y por eso NUNCA se leía ni se escribía.
  'images_by_color',
  'template:templates(id, name, axes, specs)',
].join(', ');

interface TemplateEmbed {
  id: string;
  name: string | null;
  axes: unknown;
  specs: unknown;
}

interface AdminRow {
  id: string;
  template_id: string | null;
  name: string | null;
  description: string | null;
  price: number | null;
  base_price: number | null;
  precio_sugerido: number | null;
  precio_tentativo: number | null;
  images: unknown;
  published: boolean;
  is_promo: boolean;
  sort_order: number;
  spo_link: string | null;
  updated_at: string;
  category_id: string | null;
  axis_options: unknown;
  variant_mappings: unknown;
  images_by_color: unknown;
  template: TemplateEmbed | TemplateEmbed[] | null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function toSpecs(value: unknown): SpecRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const spec = raw as Record<string, unknown>;
      if (typeof spec.label !== 'string') return [];
      return [{ label: spec.label, value: String(spec.value ?? '') }];
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([label, v]) => ({
      label,
      value: String(v ?? ''),
    }));
  }
  return [];
}

// `axis_options` recorta las opciones del molde a las que este producto ofrece.
// Se lee tolerante: jsonb opaco, y una clave con algo que no sea un array de
// strings simplemente no recorta nada (equivale a "todas").
function toAxisOptions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, options] of Object.entries(value as Record<string, unknown>)) {
    const list = toStringArray(options);
    if (list.length) out[key] = list;
  }
  return out;
}

// Mapeo variante → códigos de lote. Acepta la forma vieja de v1 (`skus`/`sku`,
// cuando el vínculo era contra un SKU compartido) para que los datos migrados
// sigan apareciendo en el editor en vez de verse como "sin vincular".
function toVariantMappings(value: unknown): VariantMappings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: VariantMappings = {};
  for (const [combo, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const codes = [
      ...toStringArray(entry.codes),
      ...toStringArray(entry.skus),
      ...(typeof entry.sku === 'string' && entry.sku ? [entry.sku] : []),
    ];
    if (!codes.length) continue;
    const price = typeof entry.price === 'number' && entry.price > 0 ? entry.price : undefined;
    out[combo] = price === undefined
      ? { codes: [...new Set(codes)] }
      : { codes: [...new Set(codes)], price };
  }
  return out;
}

function toAdminProduct(row: AdminRow): AdminProduct {
  const template = firstOfEmbed(row.template);
  const mappings = toVariantMappings(row.variant_mappings);
  const variantPrices = Object.values(mappings)
    .map((m) => m.price)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const fallbackPrice = row.price ?? row.base_price ?? 0;
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.name ?? template?.name ?? 'Sin nombre',
    description: row.description ?? '',
    price: row.is_promo
      ? fallbackPrice
      : (variantPrices.length ? Math.min(...variantPrices) : fallbackPrice),
    basePrice: row.base_price,
    precioSugerido: row.precio_sugerido,
    precioTentativo: row.precio_tentativo,
    images: toStringArray(row.images),
    specs: toSpecs(template?.specs),
    categoryId: row.category_id,
    published: row.published,
    isPromo: row.is_promo,
    sortOrder: row.sort_order,
    spoLink: row.spo_link,
    updatedAt: row.updated_at,
    // Los ejes viajan resueltos desde el molde: el editor arma con ellos las
    // combinaciones de la tabla de mapeo sin pedir la plantilla aparte.
    axes: normalizeAxes(template?.axes).map((axis): TemplateAxis => ({
      key: axis.key,
      label: axis.label,
      options: axis.options,
      isColor: axis.isColor,
    })),
    axisOptions: toAxisOptions(row.axis_options),
    variantMappings: toVariantMappings(row.variant_mappings),
    colorImages: (row.images_by_color as Record<string, string[]>) || {},
  };
}

// Campos que el producto posee (los del molde NO se tocan desde acá — ver la
// nota de `createAdminProduct`).
function toItemRow(input: AdminProductInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    price: input.price,
    base_price: input.basePrice ?? null,
    images: input.images,
    published: input.published,
    is_promo: input.isPromo,
    sort_order: input.sortOrder,
    spo_link: input.spoLink?.trim() || null,
    category_id: input.categoryId ?? null,
    template_id: input.templateId ?? null,
    axis_options: input.axisOptions ?? {},
    variant_mappings: input.variantMappings ?? {},
    // `images_by_color`, NO `color_images`: ese era el nombre que usaba el código
    // y no existe en la tabla. PostgREST rechaza el INSERT entero con "Could not
    // find the 'color_images' column", así que crear o editar CUALQUIER producto
    // fallaba — no solo los que tienen fotos por color.
    images_by_color: input.colorImages ?? {},
  };
}

export async function listAdminCatalog(): Promise<AdminProduct[]> {
  const { data, error } = await db
    .from('catalog_items')
    .select(ADMIN_COLUMNS)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as AdminRow[]).map(toAdminProduct);
}

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  const { data, error } = await db
    .from('catalog_items')
    .select(ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toAdminProduct(data as unknown as AdminRow) : null;
}

// El editor de producto NUNCA escribe en `templates`.
//
// Antes lo hacía porque había un molde por producto (relación 1:1 de hecho).
// Ahora los moldes se COMPARTEN: guardar el nombre o las specs del producto en
// su plantilla se los cambiaría, en silencio, a todos los demás productos que
// la usan. Los moldes se editan en su propia pestaña (`services/templates.ts`).
//
// Único caso en que sí se crea uno: un producto sin plantilla. Necesita dónde
// guardar sus specs, así que nace con un molde propio y sin ejes; de ahí en
// adelante es una plantilla normal, editable desde su pestaña.
async function createOwnTemplate(input: AdminProductInput): Promise<string> {
  const { data, error } = await db
    .from('templates')
    .insert({ name: input.name.trim(), specs: input.specs, axes: [] })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function createAdminProduct(input: AdminProductInput): Promise<AdminProduct> {
  const templateId = input.templateId ?? (await createOwnTemplate(input));
  const ownsTemplate = !input.templateId;

  const { data: item, error: itemError } = await db
    .from('catalog_items')
    .insert({ ...toItemRow(input), template_id: templateId })
    .select('id')
    .single();

  if (itemError) {
    // Solo se limpia el molde si lo creamos nosotros en esta misma llamada:
    // borrar una plantilla compartida dejaría sin ejes a otros productos.
    if (ownsTemplate) await db.from('templates').delete().eq('id', templateId);
    throw itemError;
  }

  const created = await getAdminProduct(item.id);
  if (!created) throw new Error('El producto se creó pero no se pudo leer de vuelta.');
  return created;
}

export async function updateAdminProduct(
  id: string,
  input: AdminProductInput,
): Promise<AdminProduct | null> {
  const existing = await getAdminProduct(id);
  if (!existing) return null;

  // Un ítem viejo sin molde: se le crea uno para que sus specs tengan dónde
  // vivir. Si ya tiene, se respeta lo que eligió el editor.
  const templateId = input.templateId ?? existing.templateId ?? (await createOwnTemplate(input));

  const { error } = await db
    .from('catalog_items')
    .update({ ...toItemRow(input), template_id: templateId })
    .eq('id', id);

  if (error) throw error;
  return getAdminProduct(id);
}

// Guarda el orden tras el drag & drop de la grilla. Se emiten los UPDATEs en
// paralelo y se revisa TODO el lote: con `Promise.all` a secas, un fallo
// posterior queda sin reportar y la grilla mostraría un orden que no se guardó.
export async function reorderAdminCatalog(items: { id: string; sortOrder: number }[]): Promise<void> {
  const results = await Promise.all(
    items.map(({ id, sortOrder }) =>
      db.from('catalog_items').update({ sort_order: sortOrder }).eq('id', id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

// Realizamos un borrado real de la base de datos. Si el producto ya tiene pedidos, 
// la base de datos (Postgres) rechazará el borrado por llave foránea, lo cual es correcto.
export async function archiveAdminProduct(id: string): Promise<boolean> {
  const { error } = await db
    .from('catalog_items')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503') { // foreign_key_violation
      throw new Error('No se puede eliminar porque ya hay pedidos o datos asociados a este producto.');
    }
    throw error;
  }
  return true;
}
