// Genera el comprobante PDF de una venta a un archivo local, SIN tocar Microsoft.
//
// Sirve para validar el layout antes de configurar SharePoint: el PDF es la parte
// que más se va a querer retocar (márgenes, qué campos entran, cómo se lee un
// nombre de producto largo) y no tiene sentido descubrir eso recién cuando ya hay
// cincuenta archivos subidos a la biblioteca.
//
//   npx tsx scripts/spo-comprobante.ts             → última venta aprobada
//   npx tsx scripts/spo-comprobante.ts <orderId>   → una venta puntual
//
// El archivo sale en App/tmp/.
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../server/core/supabase';
import {
  buildComprobanteData,
  comprobanteFilename,
  renderComprobantePdf,
} from '../server/modules/sharepoint/comprobante';

async function resolveOrderId(): Promise<string | null> {
  const fromArgs = process.argv[2]?.trim();
  if (fromArgs) return fromArgs;

  // Sin argumento: la última aprobada. Es lo que uno quiere el 90 % de las veces
  // (acabás de aprobar una para probar y no querés ir a copiar el uuid).
  const { data, error } = await db
    .from('orders')
    .select('id, created_at')
    .in('status', ['approved', 'paid'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function run() {
  const orderId = await resolveOrderId();
  if (!orderId) {
    console.error('No hay ninguna venta aprobada. Aprobá una desde el panel y volvé a correr esto.');
    process.exit(1);
  }

  console.log(`Generando comprobante de la venta ${orderId}...`);
  const data = await buildComprobanteData(orderId);
  if (!data) {
    console.error('Esa venta no existe.');
    process.exit(1);
  }

  console.log(
    data.hasInvoice
      ? `  Factura ligada: ${data.ticketNumber}`
      : '  SIN factura ligada → se usó el fallback desde la orden.',
  );
  console.log(`  Cliente: ${data.customer.name} · Vendedor: ${data.sellerName}`);
  console.log(`  ${data.items.length} línea(s) · Total ${data.total}`);

  const pdf = await renderComprobantePdf(data);

  const outDir = resolve(process.cwd(), 'tmp');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, comprobanteFilename(data));
  await writeFile(outPath, pdf);

  console.log(`\nListo: ${outPath} (${(pdf.length / 1024).toFixed(1)} KB)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
