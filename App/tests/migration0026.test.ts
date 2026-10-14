// 0026 mueve la descripción vieja (nota interna) a `internal_note` una sola vez.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
  `);
  await pg.exec(await read('../database/01_schema.sql'));
  return pg;
}

test('0026 separa la nota interna de la descripción para la tienda', async () => {
  const pg = await freshDb();
  try {
    const migration = await read('../database/historial/migrations/0026_plantilla_por_modelo.sql');
    // Estado de producción antes de 0026: sin la columna nueva.
    await pg.exec('alter table templates drop column internal_note');
    await pg.exec(`insert into templates (name, description) values
      ('KZ EDX Pro', 'Pedir al proveedor de siempre'), ('KZ Castor', null)`);

    const first = await pg.exec(migration);
    assert.equal(first.at(-1)?.rows[0]?.problema, 'Todo en orden');

    const rows = async () => (await pg.query<{ name: string; description: string | null; internal_note: string }>(
      'select name, description, internal_note from templates order by name')).rows;
    assert.deepEqual(await rows(), [
      { name: 'KZ Castor', description: null, internal_note: '' },
      { name: 'KZ EDX Pro', description: '', internal_note: 'Pedir al proveedor de siempre' },
    ]);

    // Una descripción escrita después de la migración no se mueve al reaplicarla.
    await pg.exec("update templates set description = 'Para la tienda' where name = 'KZ Castor'");
    await pg.exec(migration);
    assert.equal((await rows())[0]?.description, 'Para la tienda');
  } finally {
    await pg.close();
  }
});

test('0026 sobre una base nueva no cambia nada', async () => {
  const pg = await freshDb();
  try {
    const result = await pg.exec(await read('../database/historial/migrations/0026_plantilla_por_modelo.sql'));
    assert.equal(result.at(-1)?.rows[0]?.problema, 'Todo en orden');
  } finally {
    await pg.close();
  }
});
