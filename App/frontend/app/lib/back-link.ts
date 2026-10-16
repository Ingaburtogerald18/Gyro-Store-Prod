// «Volver» de la ficha: al listado de donde se vino (con su búsqueda, filtros, orden y posición) o, si se
// entró directo, a la categoría del producto. El listado viaja en el estado del historial, no en la URL.
import { CATALOG_PATH, categoryFromPath, findCategory } from './catalog-query';

export interface BackState {
  /** Ruta del listado de origen, con su query. */
  backTo: string;
  /** Cuántas entradas atrás está: abrir relacionados suma una por ficha. */
  steps: number;
}

const DETAIL = /^\/(producto|combo)\//;

export function readBackState(state: unknown): BackState | null {
  const s = state as Partial<BackState> | null;
  return s && typeof s.backTo === 'string' && /^\/(?!\/)/.test(s.backTo) && !s.backTo.includes('\\') && Number.isInteger(s.steps) && (s.steps ?? 0) > 0
    ? { backTo: s.backTo, steps: s.steps! }
    : null;
}

/** El estado que lleva un enlace a una ficha desde la página actual. */
export function backStateFor(location: { pathname: string; search: string; state: unknown }): BackState | undefined {
  if (DETAIL.test(location.pathname)) {
    const previous = readBackState(location.state);
    return previous ? { backTo: previous.backTo, steps: previous.steps + 1 } : undefined;
  }
  return { backTo: `${location.pathname}${location.search}`, steps: 1 };
}

/** «Volver a …» en palabras: la búsqueda, una categoría, el catálogo o el inicio. */
export function backLabel(backTo: string, categories: { id: string; slug: string; name: string }[]): string {
  const url = new URL(backTo, 'http://tienda');
  if (url.pathname === '/') return 'Volver al inicio';
  if (url.searchParams.get('q')?.trim()) return 'Volver a la búsqueda';
  const slug = categoryFromPath(url.pathname);
  const category = slug ? findCategory(categories, slug) : undefined;
  if (category) return `Volver a ${category.name}`;
  if (url.pathname === CATALOG_PATH) return 'Volver al catálogo';
  return 'Volver';
}
