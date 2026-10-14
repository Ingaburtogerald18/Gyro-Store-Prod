import { config as loadDotenv } from 'dotenv';
import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Variables para el SSR de dev con la misma cadena que server/core/load-env.ts (GYRO_ENV_FILE primero),
// replicada porque importar TS desde la config de Vite es frágil.
const customEnvFile = process.env.GYRO_ENV_FILE?.trim();
if (customEnvFile && !existsSync(customEnvFile)) {
  throw new Error('GYRO_ENV_FILE apunta a un archivo que no existe. Revisa la ruta en esta terminal.');
}

for (const candidate of [
  customEnvFile,
  path.resolve(dirname, '../.env'), // App/.env
  path.resolve(dirname, '.env'), // frontend/.env (compatibilidad)
]) {
  if (candidate && existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(name => !process.env[name]?.trim());
    if (missing.length) {
      throw new Error(
        `Faltan ${missing.join(', ')} para el frontend. Define GYRO_ENV_FILE en esta terminal ` +
        'con la ruta del archivo de configuración y reinicia npm run dev.',
      );
    }
  }
  return {
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        // single-fetch apagado: el adaptador Express↔Fetch (serve-frontend.ts) no cierra el stream y la
        // hidratación nunca terminaba. En modo clásico el loaderData va inline.
        v3_singleFetch: false,
        // lazyRouteDiscovery apagado: el adaptador no responde /__manifest y navegar a /admin daba 404.
        v3_lazyRouteDiscovery: false,
      },
    }),
    tsconfigPaths(),
    tailwindcss(),
  ],
  resolve: {
    // Contrato único front/back: los forms extienden shared/schemas/.
    alias: {
      '@shared': path.resolve(dirname, '../shared'),
      // App/shared no tiene node_modules: se fuerza la copia de zod del frontend.
      zod: path.resolve(dirname, 'node_modules/zod'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Monolito híbrido (Docs/02-Arquitectura.md): en dev el front corre en 5173 y proxya /api al
    // Express de :3000. En prod Express sirve el build de Remix y no hay proxy.
    proxy: {
      '/api': {
        // 127.0.0.1 y no localhost: en Windows localhost resuelve a ::1 y el backend escucha solo en IPv4.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  };
});
