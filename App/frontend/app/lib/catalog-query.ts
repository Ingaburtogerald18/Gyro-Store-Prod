// Contrato entre la URL del catálogo y sus filtros: /catalogo o /categoria/<slug>, con el resto en la
// query (?q=…&min=…&orden=…). Parámetro ausente = valor por defecto; lo inválido se descarta.
// Probado en tests/catalog-query.test.ts.

export type CatalogSort = 'relevant' | 'price-asc' | 'price-desc';

export interface CatalogFilters {
  search: string;
  /** slug de la categoría, o null = todas. */
  category: string | null;
  priceMin: number | null;
  priceMax: number | null;
  sort: CatalogSort;
  onlyOnSale: boolean;
  onlyInStock: boolean;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  search: '',
  category: null,
  priceMin: null,
  priceMax: null,
  sort: 'relevant',
  onlyOnSale: false,
  onlyInStock: false,
};

const SORT_PARAM: Record<CatalogSort, string | null> = {
  relevant: null,
  'price-asc': 'precio-asc',
  'price-desc': 'precio-desc',
};

/** Los parámetros que este contrato administra; el resto de la URL se respeta. */
export const CATALOG_PARAMS = ['q', 'categoria', 'min', 'max', 'oferta', 'disponible', 'orden'] as const;

interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

/** Categoría por slug, id o nombre (enlaces viejos). */
export function findCategory<T extends CategoryRef>(categories: T[], value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return (
    categories.find((c) => c.slug === value) ??
    categories.find((c) => c.id === value) ??
    categories.find((c) => c.name.toLowerCase() === lower || c.slug.toLowerCase() === lower)
  );
}

function parsePrice(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseCatalogParams(params: URLSearchParams, categories: CategoryRef[] = []): CatalogFilters {
  const rawCategory = params.get('categoria')?.trim() || null;
  const category = rawCategory ? (findCategory(categories, rawCategory)?.slug ?? rawCategory) : null;
  const orden = params.get('orden');
  const sort = (Object.keys(SORT_PARAM) as CatalogSort[]).find((k) => SORT_PARAM[k] === orden) ?? 'relevant';
  return {
    search: params.get('q') ?? '',
    category,
    priceMin: parsePrice(params.get('min')),
    priceMax: parsePrice(params.get('max')),
    sort,
    onlyOnSale: params.get('oferta') === '1',
    onlyInStock: params.get('disponible') === '1',
  };
}

/** Aplica los filtros sobre una copia de `base`, sin tocar parámetros ajenos. */
export function writeCatalogParams(filters: CatalogFilters, base?: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of CATALOG_PARAMS) next.delete(key);
  const q = filters.search.trim();
  if (q) next.set('q', q);
  if (filters.category) next.set('categoria', filters.category);
  if (filters.priceMin != null) next.set('min', String(filters.priceMin));
  if (filters.priceMax != null) next.set('max', String(filters.priceMax));
  if (filters.onlyOnSale) next.set('oferta', '1');
  if (filters.onlyInStock) next.set('disponible', '1');
  const orden = SORT_PARAM[filters.sort];
  if (orden) next.set('orden', orden);
  return next;
}

/** Firma comparable de los filtros (la búsqueda sin espacios sobrantes). */
export function filtersKey(filters: CatalogFilters): string {
  return writeCatalogParams(filters).toString();
}

export const CATALOG_PATH = '/catalogo';
const CATEGORY_PREFIX = '/categoria/';

// El contrato del catálogo trae `category` como texto y `categoryId` opcional: vale cualquiera de los dos.
export function inCategory(p: { categoryId?: string | null; category: string }, c: { id: string; name: string }) {
  return p.categoryId === c.id || p.category === c.id || p.category === c.name;
}

/** Productos por categoría (id → cantidad): lo único que header, menú y pie necesitan del catálogo. */
export function countByCategory(
  products: { categoryId?: string | null; category: string }[],
  categories: { id: string; name: string }[],
): Record<string, number> {
  return Object.fromEntries(categories.map((c) => [c.id, products.filter((p) => inCategory(p, c)).length]));
}

/** Las categorías con productos. Sin conteos, o con el catálogo vacío, van todas. */
export function categoriesWithProducts<T extends { id: string }>(categories: T[], counts: Record<string, number> | undefined): T[] {
  if (!counts || !Object.values(counts).some((n) => n > 0)) return categories;
  return categories.filter((c) => (counts[c.id] ?? 0) > 0);
}

export function categoryHref(slug: string | null): string {
  return slug ? `${CATEGORY_PREFIX}${encodeURIComponent(slug)}` : CATALOG_PATH;
}

/** La categoría que fija la ruta (/categoria/<slug>); null en cualquier otra. */
export function categoryFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CATEGORY_PREFIX)) return null;
  const raw = pathname.slice(CATEGORY_PREFIX.length).split('/')[0] ?? '';
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return null;
  }
}

export function isCatalogPath(pathname: string): boolean {
  return pathname === CATALOG_PATH || categoryFromPath(pathname) !== null;
}

/** Filtros de un listado: la categoría sale de la ruta y el resto de la query. */
export function parseCatalogLocation(pathname: string, params: URLSearchParams, categories: CategoryRef[] = []): CatalogFilters {
  const fromPath = categoryFromPath(pathname);
  return {
    ...parseCatalogParams(params, categories),
    category: fromPath ? (findCategory(categories, fromPath)?.slug ?? fromPath) : null,
  };
}

/** URL del listado para estos filtros, sin tocar los parámetros ajenos de `base`. */
export function catalogHref(filters: CatalogFilters, base?: URLSearchParams): string {
  const query = writeCatalogParams({ ...filters, category: null }, base).toString();
  const path = categoryHref(filters.category);
  return query ? `${path}?${query}` : path;
}

/** Hay búsqueda, filtro u orden en la query: esa vista no se indexa. */
export function hasCatalogParams(params: URLSearchParams): boolean {
  return CATALOG_PARAMS.some((key) => params.has(key));
}

/**
 * Destino nuevo de un enlace viejo (/?categoria=…, /?q=…, /catalogo?categoria=…); null si ya es el correcto.
 * Una categoría desconocida va al catálogo completo; sin categorías cargadas se confía en el valor.
 */
export function legacyCatalogRedirect(pathname: string, params: URLSearchParams, categories: CategoryRef[] = []): string | null {
  const legacy = params.get('categoria')?.trim() || null;
  const fromHome = pathname === '/' && hasCatalogParams(params);
  if (!legacy && !fromHome) return null;
  const category = legacy
    ? (findCategory(categories, legacy)?.slug ?? (categories.length ? null : legacy))
    : categoryFromPath(pathname);
  return catalogHref({ ...parseCatalogParams(params, categories), category }, params);
}

/** Un rango con mínimo mayor que el máximo no filtra: se informa junto a los campos. */
export function priceRangeError(filters: Pick<CatalogFilters, 'priceMin' | 'priceMax'>): string | null {
  if (filters.priceMin != null && filters.priceMax != null && filters.priceMin > filters.priceMax) {
    return 'El mínimo no puede ser mayor que el máximo.';
  }
  return null;
}
