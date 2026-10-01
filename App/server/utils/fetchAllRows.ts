// PostgREST corta cada respuesta en 1000 filas (`max-rows`) sin avisar: la
// consulta "sale bien" y simplemente faltan datos. Para los reportes que suman
// en memoria eso es un subconteo silencioso, así que se pide por páginas hasta
// que una vuelva incompleta.
//
// La consulta que arma `page` TIENE que tener un orden total (p. ej. `.order('id')`);
// sin orden, Postgres puede devolver filas repetidas o salteadas entre páginas.

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}
