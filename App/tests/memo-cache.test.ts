// Copia en memoria de la tienda: una sola lectura para visitas simultáneas, nada de errores guardados.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemo } from '../server/utils/memo-cache';

test('dos lecturas a la vez esperan la misma consulta y la segunda vez sale de memoria', async () => {
  const memo = createMemo(60_000);
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { items: [1, 2] };
  };
  const [a, b] = await Promise.all([memo.get('catalog', load), memo.get('catalog', load)]);
  assert.equal(a, b);
  await memo.get('catalog', load);
  assert.equal(calls, 1);
});

test('un error no queda guardado: la siguiente lectura vuelve a consultar', async () => {
  const memo = createMemo(60_000);
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error('base caída');
    return 'ok';
  };
  await assert.rejects(memo.get('config', load));
  assert.equal(await memo.get('config', load), 'ok');
  assert.equal(calls, 2);
});

test('clear y el vencimiento obligan a leer de nuevo', async () => {
  const memo = createMemo(0);
  let calls = 0;
  const load = async () => ++calls;
  await memo.get('k', load);
  await memo.get('k', load);
  assert.equal(calls, 2);

  const lasting = createMemo(60_000);
  await lasting.get('k', load);
  lasting.clear();
  await lasting.get('k', load);
  assert.equal(calls, 4);
});

test('el techo de entradas saca la más vieja', async () => {
  const memo = createMemo(60_000, 2);
  let calls = 0;
  const load = async () => ++calls;
  await memo.get('a', load);
  await memo.get('b', load);
  await memo.get('c', load);
  await memo.get('b', load);
  assert.equal(calls, 3);
  await memo.get('a', load);
  assert.equal(calls, 4);
});
