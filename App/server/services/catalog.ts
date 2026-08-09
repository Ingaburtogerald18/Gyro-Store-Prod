import { db } from '../supabase';
import { publicCatalogItemSchema, type PublicCatalogItem } from '../../shared/schemas';
import { parseDbRows } from '../utils/parseDbRows';

// Columnas que el storefront puede ver. Se listan explícitamente en vez de usar
// `select('*')`: la tabla `catalog_items` tiene columnas de la cadena financiera
// (precio_sugerido, precio_tentativo y lo que venga después) y un `*` las publicaría
// solas, sin que nadie lo note, en cuanto la migración las agregue. Un competidor
// que lea el JSON del catálogo puede derivar el margen del negocio (doc 11 §3).
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
  'template:templates(id, name, axes, specs)',
  'category:categories(id, name)',
].join(', ');

// Obtiene los ítems del catálogo publicados junto con su template embebido.
// Valida la respuesta contra el contrato único de Zod antes de retornarla
// para asegurar que el frontend siempre reciba la estructura esperada.
export async function listPublishedCatalog(): Promise<PublicCatalogItem[]> {
  const { data, error } = await db
    .from('catalog_items')
    .select(PUBLIC_CATALOG_COLUMNS)
    .eq('published', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  // Validamos el array completo y retornamos el tipo inferido de forma segura.
  // Si la base devuelve algo que no cumple el contrato es un 500, no un 400: el
  // cliente no tiene nada que corregir en su request (ver parseDbRows).
  return parseDbRows(publicCatalogItemSchema, data, 'catalog_items');
}

// Un ítem publicado por id, para la ficha de producto. Devuelve null si no
// existe o no está publicado: desde afuera son el mismo 404, y así un producto
// despublicado no se puede sondear por id.
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

  return parseDbRows(publicCatalogItemSchema, [data], 'catalog_items')[0] ?? null;
}
