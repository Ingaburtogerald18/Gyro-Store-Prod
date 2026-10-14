// Comprobación SOLO DE LECTURA tras ejecutar 0021 en el SQL Editor.
import { randomUUID } from 'node:crypto';
import { db } from '../server/core/supabase';
const checks = [
  ['columnas de variantes y snapshots', () => db.from('public_order_items').select('variant_name,product_name,product_image').limit(0)],
  ['registro persistente de intentos', () => db.from('public_order_attempts').select('idempotency_key,request_hash').limit(0)],
  ['RPC de recuperación', () => db.rpc('recover_public_order_attempt', { p_key: randomUUID() })],
] as const;
let failed = false;
for (const [label, check] of checks) {
  const { error } = await check();
  if (error) { console.error('FALTA: ' + label + ' (' + error.code + ')'); failed = true; }
  else console.log('OK: ' + label);
}
if (failed) process.exitCode = 1;
