// SQL real en PostgreSQL embebido y aislado. No usa credenciales ni Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('migración y registro atómico de pedidos en PostgreSQL', async t => {
  const pg = new PGlite();
  try {
    const schema = await readFile(new URL('../database/01_schema.sql', import.meta.url), 'utf8');
    const migration = await readFile(new URL('../database/migrations/0021_atomic_public_order_checkout.sql', import.meta.url), 'utf8');
    const table = (name: string) => {
      const start = schema.indexOf('create table ' + name + ' (');
      assert.ok(start >= 0);
      const statement = schema.slice(start).match(/^[\s\S]*?^\);/m);
      assert.ok(statement);
      return statement[0];
    };
    const redeemStart = schema.indexOf('create or replace function redeem_discount_code(');
    const redeem = schema.slice(redeemStart, schema.indexOf('$$;', redeemStart) + 3);
    await pg.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create type payment_method as enum ('efectivo','transferencia','tarjeta');
      create type discount_type as enum ('percent','fixed');
      create type redemption_source as enum ('checkout','invoice','sale');
      create sequence discount_code_seq;
      create table contacts(id uuid primary key);
    `);
    await pg.exec(table('public_orders'));
    await pg.exec(table('public_order_items').replace(/^.*(?:variant_name|product_name|product_image).*$/gm, ''));
    await pg.exec(table('discount_codes'));
    await pg.exec(table('discount_code_redemptions'));
    await pg.exec(redeem);
    await pg.exec(migration);
    await pg.exec(migration); // reaplicarla no altera filas ni falla
    const count = async (tableName: string) => Number((await pg.query<{ n: number }>('select count(*) as n from ' + tableName)).rows[0]!.n);
    const make = (code: string | null = null, discount = 0, quantity = 1) => {
      const id = randomUUID();
      return {
        header: { id, phone: '88888888', customer_name: 'Prueba', delivery_method: 'retiro',
          total: 500 * quantity - discount, discount_code: code, code_discount: discount },
        rows: [{ sku: 'catalog-id', quantity, precio_unit: 500, variant_name: 'Negro / Jack',
          product_name: 'Audífono original', product_image: 'https://example.test/original.png' }],
        response: { id, phone: '88888888', total: 500 * quantity - discount, status: 'new',
          items: [{ catalogItemId: 'catalog-id', quantity, unitPrice: 500, variantName: 'Negro / Jack' }],
          whatsappUrl: 'https://wa.me/test' },
      };
    };
    const commit = async (key: string, hash: string, draft: ReturnType<typeof make>) =>
      (await pg.query<{ result: { response: typeof draft.response; replayed: boolean } }>(
        'select register_public_order_attempt($1,$2,$3,$4,$5) as result',
        [key, hash, JSON.stringify(draft.header), JSON.stringify(draft.rows), JSON.stringify(draft.response)],
      )).rows[0]!.result;

    await t.test('persiste variante y nombres/fotos originales; reintentos concurrentes no duplican', async () => {
      const key = randomUUID(), draft = make();
      const before = await count('public_orders');
      const results = await Promise.all([commit(key, 'a'.repeat(64), draft), commit(key, 'a'.repeat(64), make())]);
      assert.deepEqual(results.map(r => r.response.id), [draft.header.id, draft.header.id]);
      assert.deepEqual(results.map(r => r.replayed), [false, true]);
      assert.equal(await count('public_orders'), before + 1);
      const line = (await pg.query('select variant_name, product_name, product_image from public_order_items where public_order_id=$1', [draft.header.id])).rows[0];
      assert.deepEqual(line, { variant_name: 'Negro / Jack', product_name: 'Audífono original', product_image: 'https://example.test/original.png' });
      // Recuperación usa la base, sin depender de caché o proceso de Node.
      const recovered = (await pg.query<{ result: { requestHash: string; response: typeof draft.response } }>(
        'select recover_public_order_attempt($1) as result', [key])).rows[0]!.result;
      assert.deepEqual(recovered.response, draft.response);
      await assert.rejects(commit(key, 'b'.repeat(64), make()), /otro pedido/);
    });
    await t.test('si una línea falla se revierte cabecera y clave; se puede reintentar', async () => {
      const key = randomUUID(), before = await count('public_orders');
      await assert.rejects(commit(key, 'c'.repeat(64), make(null, 0, 0)), /check constraint/);
      assert.equal(await count('public_orders'), before);
      assert.equal((await pg.query<{ result: null }>('select recover_public_order_attempt($1) as result', [key])).rows[0]!.result, null);
      assert.equal((await commit(key, 'c'.repeat(64), make())).replayed, false);
    });
    await t.test('el cupón se canjea una vez; el segundo pedido falla y se revierte entero', async () => {
      await pg.exec("insert into discount_codes(code,type,value) values ('GS-TEST','fixed',50)");
      const key = randomUUID(), before = await count('public_orders'), draft = make('GS-TEST', 50);
      const first = await commit(key, 'd'.repeat(64), draft);
      const retry = await commit(key, 'd'.repeat(64), make('GS-TEST', 50));
      assert.equal(retry.response.id, first.response.id);
      await assert.rejects(commit(randomUUID(), 'e'.repeat(64), make('GS-TEST', 50)), /canjeado/);
      assert.equal(await count('public_orders'), before + 1);
      assert.equal(Number((await pg.query<{ used_count: number }>("select used_count from discount_codes where code='GS-TEST'")).rows[0]!.used_count), 1);
      assert.equal(await count('discount_code_redemptions'), 1);
    });
    await t.test('un fallo después del canje revierte también el cupón', async () => {
      await pg.exec("insert into discount_codes(code,type,value) values ('GS-ROLLBACK','fixed',50)");
      await pg.exec(`create function fail_attempt_test() returns trigger language plpgsql as $$
        begin raise exception 'fallo final'; end; $$;
        create trigger fail_attempt_test before insert on public_order_attempts for each row execute function fail_attempt_test();`);
      const before = await count('public_orders');
      await assert.rejects(commit(randomUUID(), 'f'.repeat(64), make('GS-ROLLBACK',50)), /fallo final/);
      assert.equal(await count('public_orders'), before);
      assert.equal(Number((await pg.query<{ used_count: number }>("select used_count from discount_codes where code='GS-ROLLBACK'")).rows[0]!.used_count), 0);
      assert.equal(await count('discount_code_redemptions'), 1);
      await pg.exec('drop trigger fail_attempt_test on public_order_attempts');
    });
    await t.test('si cambia el descuento, no se registra un total distinto al mostrado', async () => {
      const before = await count('public_orders');
      await assert.rejects(commit(randomUUID(), 'a'.repeat(64), make('GS-ROLLBACK', 40)), /descuento/);
      assert.equal(await count('public_orders'), before);
    });
    await t.test('las funciones y el registro privado no son accesibles desde el cliente', async () => {
      const privileges = (await pg.query<{ can_read: boolean; can_register: boolean; can_recover: boolean }>(`
        select has_table_privilege('anon','public_order_attempts','SELECT') as can_read,
          has_function_privilege('authenticated','register_public_order_attempt(uuid,text,jsonb,jsonb,jsonb)','EXECUTE') as can_register,
          has_function_privilege('anon','recover_public_order_attempt(uuid)','EXECUTE') as can_recover
      `)).rows[0]!;
      assert.deepEqual(privileges, { can_read: false, can_register: false, can_recover: false });
    });
  } finally { await pg.close(); }
});
