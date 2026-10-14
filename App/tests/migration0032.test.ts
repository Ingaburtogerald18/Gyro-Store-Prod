// 0032 amplía la entrega de los pedidos web, agrega su operación y los eventos nuevos de analítica,
// sin tocar los pedidos viejos y aunque la restricción de producción tenga otro nombre.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

async function productionBefore0032(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
  `);
  await pg.exec(await read('../database/01_schema.sql'));
  // Estado de producción antes de 0032: sin columnas nuevas y con las restricciones viejas.
  await pg.exec(`
    alter table public_orders drop column shipping_quote, drop column product_paid_date,
      drop column shipping_paid_date, drop column carrier_reference, drop column received_date;
    alter table public_orders drop constraint public_orders_delivery_method_check;
    alter table public_orders add constraint public_orders_delivery_method_check1
      check (delivery_method in ('retiro', 'envio'));
    alter table analytics_events drop constraint analytics_events_type_check;
    alter table analytics_events add constraint analytics_events_type_check
      check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created'));
    insert into public_orders (id, delivery_method, total) values
      ('00000000-0000-4000-8000-000000000001', 'envio', 900);
  `);
  return pg;
}

const rejects = async (pg: PGlite, sql: string) => {
  await assert.rejects(pg.exec(sql));
};

test('0032 acepta las entregas nuevas, conserva los pedidos viejos y se puede correr dos veces', async () => {
  const pg = await productionBefore0032();
  try {
    const migration = await read('../database/migrations/0032_entregas_y_pagos_de_pedidos.sql');
    await rejects(pg, "insert into public_orders (delivery_method) values ('managua')");

    await pg.exec(migration);
    await pg.exec(migration);

    await pg.exec(`insert into public_orders (delivery_method, shipping_quote, received_date)
      values ('managua', 150, '2026-10-14'), ('cargo_trans', null, null), ('retiro', null, null)`);
    await rejects(pg, "insert into public_orders (delivery_method) values ('domicilio')");
    await rejects(pg, "insert into public_orders (delivery_method, shipping_quote) values ('managua', -1)");

    const old = await pg.query<{ delivery_method: string; total: string }>(
      "select delivery_method, total::text from public_orders where id = '00000000-0000-4000-8000-000000000001'");
    assert.deepEqual(old.rows, [{ delivery_method: 'envio', total: '900.00' }]);

    // Una sola restricción de entrega, con el nombre de 01_schema.sql.
    const checks = await pg.query<{ conname: string }>(`select conname from pg_constraint
      where conrelid = 'public_orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%delivery_method%'`);
    assert.deepEqual(checks.rows.map((r) => r.conname), ['public_orders_delivery_method_check']);

    await pg.exec("insert into analytics_events (type) values ('add_to_cart'), ('whatsapp_open'), ('page_view')");
    await rejects(pg, "insert into analytics_events (type) values ('mensaje_enviado')");
  } finally {
    await pg.close();
  }
});
