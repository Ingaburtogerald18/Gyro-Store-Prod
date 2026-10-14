// Descubre los ids de SharePoint que van al .env y prueba una subida real.
// Uso: npm run spo:ids -- https://<tenant>.sharepoint.com/sites/<sitio> (o SPO_SITE_URL en el .env).
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import {
  assertCredentials,
  assertSharePointRoles,
  getToken,
  graphGet,
} from './lib/graph-bootstrap';

async function run() {
  assertCredentials();

  // También por env para no tipearla cada vez. Se recortan la `/` y la `\` que agrega PowerShell.
  const siteUrl = (process.argv[2] || process.env.SPO_SITE_URL || '')
    .trim()
    .replace(/[/\\]+$/, '');
  if (!siteUrl) {
    throw new Error(
      'Falta la URL del sitio. Dos formas:\n' +
        '  npm run spo:ids -- https://<tenant>.sharepoint.com/sites/<sitio>\n' +
        '  o definí SPO_SITE_URL en el .env y corré `npm run spo:ids` a secas.',
    );
  }

  const parsed = new URL(siteUrl);
  const token = await getToken();
  console.log('Token OK.');
  assertSharePointRoles(token);
  console.log();

  // Graph resuelve el sitio por host + ruta: `/sites/{host}:/sites/{nombre}`.
  const site = await graphGet<{ id: string; displayName: string }>(
    token,
    `/sites/${parsed.hostname}:${parsed.pathname.replace(/\/$/, '')}`,
  );
  console.log(`Sitio: ${site.displayName}`);
  console.log(`SPO_SITE_ID=${site.id}\n`);

  const drives = await graphGet<{ value: { id: string; name: string }[] }>(
    token,
    `/sites/${site.id}/drives`,
  );
  console.log('Bibliotecas (una de estas es la de comprobantes):');
  for (const drive of drives.value) {
    const mark = /comprobante/i.test(drive.name) ? '  ← probablemente esta' : '';
    console.log(`  ${drive.name}${mark}\n    SPO_DRIVE_ID=${drive.id}`);
  }

  // ── Prueba de escritura ── Descubrir los ids no prueba nada: el token puede leer y no poder subir.
  const driveId = (process.env.SPO_DRIVE_ID || '').trim();
  if (!driveId) {
    console.log('\nSPO_DRIVE_ID todavía no está en el .env: salteo la prueba de escritura.');
    console.log('Pegá el de la biblioteca de comprobantes y volvé a correr esto.');
    return;
  }

  console.log('\nProbando escritura en la biblioteca...');
  const probePath = '_prueba-gyro/escritura.txt';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drives/${driveId}/root:/${probePath}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: `Prueba de escritura de Gyro Store — ${new Date().toISOString()}`,
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error(`  FALLÓ (${res.status}): ${body?.error?.message || res.statusText}`);
    if (res.status === 403) {
      console.error(
        '  El grant del sitio necesita rol `write`:\n' +
          '    GET   /sites/{siteId}/permissions           → id del grant\n' +
          '    PATCH /sites/{siteId}/permissions/{permId}  { "roles": ["write"] }',
      );
    }
    process.exitCode = 1;
    return;
  }

  const file = (await res.json()) as { webUrl?: string };
  console.log('  OK — la app puede subir comprobantes.');
  console.log(`  Archivo de prueba: ${file.webUrl}`);
  console.log('  (borralo cuando quieras; la carpeta `_prueba-gyro` no la usa nadie más)');
}

run().catch((err) => {
  console.error(`\n${err.message ?? err}`);
  // `exitCode` y no `exit(1)`: matar el proceso mientras undici cierra sockets dispara una aserción de
  // libuv en Windows que parece un crash.
  process.exitCode = 1;
});
