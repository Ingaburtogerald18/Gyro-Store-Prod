// URL de una ficha (producto o combo): solo el nombre, «/producto/kz-edx-pro». El servidor la arma para
// todo el catálogo a la vez y la manda en el JSON (`slug`); la tienda la usa tal cual.

/** "Audífonos KZ EDX Pro" → "audifonos-kz-edx-pro" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_SUFFIX = 6;
const compactId = (id: string) => id.replace(/-/g, '').toLowerCase();

/**
 * Slug de cada ficha, único en la lista. Dos que se llaman igual llevan las dos el comienzo de su id
 * («kz-edx-pro-ad611f»): ninguna se queda con la URL de la otra según cuál se publicó primero.
 */
export function uniqueSlugs(items: { id: string; name: string | null }[], fallback: string): Map<string, string> {
  const base = new Map(items.map((item) => [item.id, slugify(item.name ?? '') || fallback]));
  const groups = new Map<string, string[]>();
  for (const [id, slug] of base) groups.set(slug, [...(groups.get(slug) ?? []), id]);

  const slugs = new Map<string, string>();
  for (const [slug, ids] of groups) {
    if (ids.length === 1) {
      slugs.set(ids[0]!, slug);
      continue;
    }
    // El menor largo de id que los distingue (6 casi siempre alcanza).
    let length = ID_SUFFIX;
    while (new Set(ids.map((id) => compactId(id).slice(0, length))).size < ids.length && length < 32) length += 2;
    for (const id of ids) slugs.set(id, `${slug}-${compactId(id).slice(0, length)}`);
  }
  return slugs;
}

/** Lo que trae la URL: un id (los enlaces viejos «nombre--uuid» o el uuid solo) o un slug. */
export function parseDetailParam(raw: string): { id: string } | { slug: string } {
  const value = raw.trim().toLowerCase();
  const tail = value.split('--').pop() ?? '';
  return UUID.test(tail) ? { id: tail } : { slug: value };
}

/**
 * La ficha a la que apunta una URL, en la lista publicada. Acepta el slug actual, el id (enlaces viejos)
 * y un slug que cambió por un duplicado que apareció o dejó de estar.
 */
export function findByDetailParam<T extends { id: string; name: string | null; slug?: string }>(
  items: T[],
  raw: string,
): T | undefined {
  const parsed = parseDetailParam(raw);
  if ('id' in parsed) return items.find((item) => item.id.toLowerCase() === parsed.id);
  const exact = items.find((item) => item.slug === parsed.slug);
  if (exact) return exact;
  // «kz-edx-pro-ad611f» cuando ya no hay duplicado: el comienzo del id alcanza para encontrarla.
  const suffix = /-([0-9a-f]{6,32})$/.exec(parsed.slug)?.[1];
  if (suffix) {
    const byId = items.filter((item) => compactId(item.id).startsWith(suffix));
    if (byId.length === 1) return byId[0];
  }
  // «kz-edx-pro» cuando después se publicó otro con el mismo nombre: la primera en el orden de la tienda.
  return items.find((item) => slugify(item.name ?? '') === parsed.slug);
}
