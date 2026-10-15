// 0033 agrega el texto de las categorías y la marca de las plantillas sin tocar las filas existentes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('0033 agrega texto de categoría y marca con vacío por defecto y se puede correr dos veces', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
    `);
    await pg.exec(await read('../database/01_schema.sql'));
    // Estado de producción antes de 0033.
    await pg.exec(`
      alter table categories drop column description;
      alter table templates drop column brand;
      insert into categories (id, name, slug) values ('00000000-0000-4000-8000-000000000001', 'Audífonos', 'audifonos');
      insert into templates (id, name, category_id) values
        ('00000000-0000-4000-8000-000000000002', 'KZ EDX Pro', '00000000-0000-4000-8000-000000000001');
    `);

    const migration = await read('../database/migrations/0033_texto_de_categorias_y_marca.sql');
    await pg.exec(migration);
    await pg.exec(migration);

    const category = await pg.query<{ description: string }>('select description from categories');
    assert.deepEqual(category.rows, [{ description: '' }]);
    const template = await pg.query<{ brand: string; name: string }>('select name, brand from templates');
    assert.deepEqual(template.rows, [{ name: 'KZ EDX Pro', brand: '' }]);

    await pg.exec("update templates set brand = 'KZ'");
    await assert.rejects(pg.exec(`update templates set brand = '${'x'.repeat(61)}'`));
    await assert.rejects(pg.exec(`update categories set description = '${'x'.repeat(501)}'`));

    // Una sola restricción de cada una, con el nombre de 01_schema.sql.
    const checks = await pg.query<{ conname: string }>(`select conname from pg_constraint
      where conname in ('categories_description_length', 'templates_brand_length') order by conname`);
    assert.deepEqual(checks.rows.map((r) => r.conname), ['categories_description_length', 'templates_brand_length']);
  } finally {
    await pg.close();
  }
});
