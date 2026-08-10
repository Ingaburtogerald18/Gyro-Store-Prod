import { config as loadDotenv } from 'dotenv';
import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Variables de entorno para el SSR de dev ──
// Los loaders de Remix corren en Node y leen SUPABASE_URL / SUPABASE_ANON_KEY de
// `process.env` (no de `VITE_*`), así que hay que cargarlas acá.
//
// Se usa la MISMA cadena que `server/loadEnv.ts`, empezando por GYRO_ENV_FILE.
// Antes esto era un `import 'dotenv/config'` que solo miraba `frontend/.env`, lo
// que obligaba a mantener una segunda copia de esas dos claves: el día que se
// rote la anon key o se cambie de proyecto Supabase, se actualiza el archivo de
// secretos y esa copia queda atrás — y el frontend le habla al proyecto viejo sin
// avisar. Con una sola fuente, ese desfase no puede ocurrir.
//
// La lógica está replicada (12 líneas) en vez de importar `server/loadEnv.ts`: un
// import cruzado de TS desde la config de Vite es frágil de resolver, y si falla
// no arranca el dev server. En producción no se ejecuta nada de esto — Render
// inyecta las variables y Express sirve el build.
for (const candidate of [
  process.env.GYRO_ENV_FILE?.trim(),
  path.resolve(dirname, '../.env'), // App/.env
  path.resolve(dirname, '.env'), // frontend/.env (compatibilidad)
]) {
  if (candidate && existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        // v3_singleFetch DESACTIVADO a propósito. Con single-fetch, el SSR entrega
        // los datos del loader por un stream (`__remixContext.streamController`) que
        // el cliente espera que se CIERRE para hidratar. En prod servimos el SSR con
        // el adaptador manual Express↔Fetch de server/serveFrontend.ts (no podemos
        // usar @remix-run/express porque exige Express 4), y ese adaptador NO emite
        // la cola del stream (el `.close()`): el cliente se queda esperando y la
        // HIDRATACIÓN NUNCA COMPLETA — botones/menús muertos, sin error en consola.
        // Con single-fetch en false, Remix usa el modo clásico: loaderData inline en
        // `__remixContext`, sin stream que esperar → hidrata bien bajo el adaptador.
        // (Con `remix-serve` nativo sí funcionaba el stream; es específico del
        // adaptador. Verificado comparando el HTML de ambos.)
        v3_singleFetch: false,
        // v3_lazyRouteDiscovery DESACTIVADO por el mismo motivo. Con esta feature,
        // al navegar el cliente pide `/__manifest?p=…` para "descubrir" la ruta;
        // pero el adaptador Express↔Fetch de serveFrontend.ts NO responde ese
        // endpoint (404), así que la navegación a /admin (tras el login) reventaba
        // con `Error: 404`. En false, Remix incluye TODAS las rutas en el manifest
        // inicial → el cliente nunca pide `/__manifest` y navega cargando el módulo
        // de la ruta directo de /assets. Costo despreciable (el manifest es chico).
        v3_lazyRouteDiscovery: false,
      },
    }),
    tsconfigPaths(),
    tailwindcss(),
  ],
  resolve: {
    // Contrato único front/back: los forms extienden shared/schemas.ts (doc 05 §6).
    alias: {
      '@shared': path.resolve(dirname, '../shared'),
      // App/shared vive fuera de esta carpeta y no tiene su propio node_modules,
      // así que la resolución normal de Node (subiendo desde shared/) no encuentra
      // 'zod'. Se fuerza a usar la copia ya instalada en frontend/node_modules.
      zod: path.resolve(dirname, 'node_modules/zod'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Monolito híbrido (doc 02): en dev el front corre en 5173 y proxya /api al
    // Express de :3000. En prod Express sirve el build de Remix y no hay proxy.
    proxy: {
      '/api': {
        // `127.0.0.1` y NO `localhost`: en Windows, `localhost` resuelve primero
        // a `::1` (IPv6), pero el backend escucha en `0.0.0.0`, que es SOLO IPv4
        // (ver server/index.ts). Con `localhost`, Node prueba ambas y el fallo de
        // la v6 aparece como un `AggregateError` de `internalConnectMultiple`
        // —un error opaco que parece "backend caído" incluso cuando está arriba.
        // Con la IP literal no hay ambigüedad que resolver.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
