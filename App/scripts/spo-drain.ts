// Fuerza un ciclo del outbox y muestra la cola. `--status`: solo el estado.
// `--retry`: vuelve a `pending` las filas en `error` y drena.
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import { config } from '../server/core/config';
import { db } from '../server/core/supabase';
import { drainSpoOutbox } from '../server/modules/sharepoint/spo-worker';

async function printStatus() {
  const { data, error } = await db
    .from('spo_outbox')
    .select('status, order_id, attempts, last_error, comprobante_url, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('No se pudo leer spo_outbox:', error.message);
    console.error('¿Aplicaste database/01_schema.sql (sección `spo_outbox`) en Supabase?');
    process.exit(1);
  }

  const rows = data || [];
  const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nÚltimas ${rows.length} filas del outbox:`, byStatus);
  for (const row of rows) {
    const mark = row.status === 'synced' ? 'OK ' : row.status === 'error' ? 'ERR' : '···';
    console.log(
      `  ${mark} ${row.order_id}  intentos=${row.attempts}` +
        (row.comprobante_url ? `\n        ↳ ${row.comprobante_url}` : '') +
        (row.last_error ? `\n        ↳ ${row.last_error}` : ''),
    );
  }
}

async function run() {
  console.log(
    config.spo.enabled
      ? `SharePoint HABILITADO (site ${config.spo.siteId})`
      : 'SharePoint DESHABILITADO: faltan credenciales. El drenado va a ser un no-op.',
  );

  await printStatus();

  if (process.argv.includes('--status')) return;

  if (process.argv.includes('--retry')) {
    const { error } = await db
      .from('spo_outbox')
      .update({ status: 'pending', attempts: 0, last_error: null })
      .eq('status', 'error');
    if (error) throw error;
    console.log('\nFilas en `error` devueltas a `pending`.');
  }

  console.log('\nDrenando...');
  const synced = await drainSpoOutbox();
  console.log(`Sincronizadas en este ciclo: ${synced}`);

  await printStatus();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
