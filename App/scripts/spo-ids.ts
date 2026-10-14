// Bootstrap de SharePoint: descubre los ids que van al .env y confirma que la app
// puede escribir en la biblioteca de comprobantes.
//
//   npm run spo:ids -- https://<tenant>.sharepoint.com/sites/<sitio>
//   npm run spo:ids                 (si definiste SPO_SITE_URL en el .env)
//
// Necesita solo las tres variables de autenticación (AZURE_TENANT_ID,
// AZURE_CLIENT_ID, AZURE_CLIENT_SECRET); los dos ids son justamente lo que viene
// a averiguar. El token y los reintentos viven en lib/graphBootstrap.ts, que
// explica por qué no se reusa modules/sharepoint/graph-token.ts.
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import {
  assertCredentials,
  assertSharePointRoles,
  getToken,
  graphGet,
} from './lib/graph-bootstrap';

async function run() {
  assertCredentials();

  // La URL del sitio es una constante del proyecto, así que además del argumento
  // se acepta por env: tipearla en cada corrida es una invitación a olvidarla (y
  // a que `npm run spo:ids` sin `--` imprima el uso en vez de hacer algo).
  //
  // El `\` final lo agrega el autocompletado de PowerShell y viaja en el
  // argumento. Se recorta junto con la `/` por el mismo motivo.
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

  // ── Prueba de escritura ──
  // Descubrir los ids no prueba nada: el token puede leer y aun así no poder
  // subir (fue exactamente lo que pasó con el grant en rol `read`/`write` al
  // intentar tocar el esquema de una lista). Mejor enterarse acá, con un archivo
  // de juguete, que cuando falle la primera venta real.
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
  // `process.exitCode` y no `process.exit(1)`: matar el proceso mientras undici
  // cierra los sockets keep-alive dispara una aserción de libuv en Windows
  // (`!(handle->flags & UV_HANDLE_CLOSING)`) que se imprime DESPUÉS del error
  // real y parece un crash del script.
  process.exitCode = 1;
});
