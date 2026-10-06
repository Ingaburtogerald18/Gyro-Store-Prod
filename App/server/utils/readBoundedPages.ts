import { BadRequestError } from './httpError';

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
  count: number | null;
}

// Avanza por las filas recibidas, incluso si PostgREST aplica un límite menor.
export async function readBoundedPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows: number,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | undefined;
  do {
    const { data, error, count } = await page(rows.length, Math.min(rows.length + 499, maxRows - 1));
    if (error) throw error;
    if (total === undefined) {
      if (count == null) throw new Error('La consulta paginada requiere un conteo exacto.');
      total = count;
    }
    if (total > maxRows) {
      throw new BadRequestError('El período contiene demasiados eventos. Selecciona un rango menor.');
    }
    const chunk = data ?? [];
    if (!chunk.length && rows.length < total) {
      throw new Error('La consulta devolvió una página vacía antes de completar los resultados.');
    }
    rows.push(...chunk);
  } while (rows.length < total);
  return rows;
}
