// Marca / negocio de forma ISOMORFA, para <title> (meta) y textos SSR donde no
// hay acceso a la query RTK de /api/config. En el server lee process.env; en el
// cliente, window.ENV (inyectado por root.tsx). Para UI reactiva, preferí
// useGetConfigQuery() (misma fuente en el server).
//
// Los valores reales SIEMPRE vienen de env: el backend hace fail-fast si falta
// BRAND_NAME (ver server/config.ts). El fallback de abajo es solo una red de
// seguridad de render, para que nunca se pinte un título vacío.
const BRAND_FALLBACK = 'Gyro Store';

function readEnv(key: 'BRAND_NAME' | 'INTERNAL_DOMAIN' | 'APP_URL'): string {
  if (typeof window !== 'undefined') return window.ENV?.[key] ?? '';
  return process.env[key] ?? '';
}

export function getBrandName(): string {
  return readEnv('BRAND_NAME') || BRAND_FALLBACK;
}

export function getInternalDomain(): string {
  return readEnv('INTERNAL_DOMAIN');
}

export function getAppUrl(): string {
  return readEnv('APP_URL');
}

// Compone el <title> de una página: "Sección · Marca" (o "Sección · Marca Admin").
export function pageTitle(section?: string, opts?: { admin?: boolean }): string {
  const brand = getBrandName() + (opts?.admin ? ' Admin' : '');
  return section ? `${section} · ${brand}` : brand;
}
