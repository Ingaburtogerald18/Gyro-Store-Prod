// Fuerza UN ciclo de sincronización del outbox y muestra el estado de la cola.
//
// El worker corre solo cada 60 s dentro del server, pero esperar un minuto entre
// cada prueba (y leer el resultado en los logs mezclado con los requests) es
// horrible. Esto hace lo mismo, a demanda, con la salida a la vista.
//
//   npx tsx scripts/spo-drain.ts           → estado + un ciclo
//   npx tsx scripts/spo-drain.ts --status  → solo el estado, sin tocar Graph
//   npx tsx scripts/spo-drain.ts --retry   → devuelve a `pending` las filas en
//                                            `error` y drena (tras arreglar la
//                                            causa: un nombre de columna, un
//                                            permiso que faltaba conceder…)
import '../server/loadEnv.js'; // Fuente única de variables de entorno. Debe ir primero.
import { config } from '../server/config.js';
import { db } from '../server/supabase.js';
import { drainSpoOutbox } from '../server/services/spoWorker.js';

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
