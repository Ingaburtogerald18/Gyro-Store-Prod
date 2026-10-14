import { db } from '../../core/supabase';
import { publicCatalogItemSchema, type PublicCatalogItem } from '../../../shared/schemas';
import { parseDbRows } from '../../utils/parse-db-rows';
import { withLinkedLots } from '../inventory/inventory-links';

// Columnas explícitas: con `select('*')` saldrían los precios sugeridos de la cadena financiera,
// y con ellos se puede deducir el margen del negocio.
const PUBLIC_CATALOG_COLUMNS = [
  'id',
  'template_id',
  'price',
  'base_price',
  'variant_mappings',
  'axis_options',
  'images',
  'images_by_color',
  'published',
  'is_promo',
  'sort_order',
  'created_at',
  'updated_at',
  'category_id',
  'template:templates(id, name, description, category_id, axes, specs, category:categories(id, name))',
  'category:categories(id, name)',
].join(', ');

// Ítems publicados con su plantilla, validados contra el contrato de Zod.
export async function listPublishedCatalog(): Promise<PublicCatalogItem[]> {
  const { data, error } = await db
    .from('catalog_items')
    .select(PUBLIC_CATALOG_COLUMNS)
    .eq('published', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  // Si la base no cumple el contrato es un 500, no un 400: el cliente no tiene nada que corregir.
  return withLinkedLots(parseDbRows(publicCatalogItemSchema, data, 'catalog_items'));
}

// Null si no existe o no está publicado: desde afuera es el mismo 404, así no se sondea por id.
export async function getPublishedCatalogItem(
  id: string,
): Promise<PublicCatalogItem | null> {
  const { data, error } = await db
    .from('catalog_items')
    .select(PUBLIC_CATALOG_COLUMNS)
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const [item] = await withLinkedLots(parseDbRows(publicCatalogItemSchema, [data], 'catalog_items'));
  return item ?? null;
}

// Varios ítems publicados por id, con las mismas columnas públicas. Lo usa el
// pedido para resolver precio y variante con la misma presentación que la ficha.
export async function listPublishedCatalogByIds(ids: string[]): Promise<PublicCatalogItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('catalog_items')
    .select(PUBLIC_CATALOG_COLUMNS)
    .in('id', ids)
    .eq('published', true);

  if (error) {
    throw error;
  }
  return withLinkedLots(parseDbRows(publicCatalogItemSchema, data, 'catalog_items'));
}

// Todos los productos, publicados o no, con las mismas columnas: Stock actual
// calcula con ellos el precio normal de cada color para las ofertas.
export async function listCatalogForPricing(ids?: string[]): Promise<PublicCatalogItem[]> {
  let query = db.from('catalog_items').select(PUBLIC_CATALOG_COLUMNS);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return withLinkedLots(parseDbRows(publicCatalogItemSchema, data, 'catalog_items'));
}
