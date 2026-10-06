import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBoundedPages } from '../server/utils/readBoundedPages';
import { BadRequestError } from '../server/utils/httpError';

test('lee todas las filas cuando la API devuelve páginas menores a las solicitadas', async () => {
  const expected = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const offsets: number[] = [];
  const rows = await readBoundedPages(async (from, to) => {
    offsets.push(from);
    return { data: expected.slice(from, Math.min(to + 1, from + 200)), error: null, count: from === 0 ? expected.length : null };
  }, 2000);
  assert.deepEqual(rows, expected);
  assert.deepEqual(offsets, [0, 200, 400, 600, 800, 1000, 1200]);
});

test('rechaza el rango completo en lugar de mostrar totales truncados', async () => {
  await assert.rejects(
    readBoundedPages(async () => ({ data: [1], error: null, count: 1001 }), 1000),
    BadRequestError,
  );
});

test('acepta rangos vacíos y el límite exacto', async () => {
  assert.deepEqual(await readBoundedPages(async () => ({ data: [], error: null, count: 0 }), 10), []);
  const rows = [1, 2, 3];
  assert.deepEqual(await readBoundedPages(async () => ({ data: rows, error: null, count: 3 }), 3), rows);
});

test('propaga errores y detecta páginas incompletas sin continuar en bucle', async () => {
  const error = new Error('API no disponible');
  await assert.rejects(readBoundedPages(async () => ({ data: null, error, count: null }), 100), error);
  await assert.rejects(
    readBoundedPages(async () => ({ data: [], error: null, count: 1 }), 100),
    /página vacía/,
  );
  await assert.rejects(
    readBoundedPages(async () => ({ data: [], error: null, count: null }), 100),
    /conteo exacto/,
  );
});
