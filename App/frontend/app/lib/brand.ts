// Marca para <title> y textos SSR (process.env en el servidor, window.ENV en el cliente).
// BRAND_NAME es opcional: sin ella se usa «Gyro Store».
const BRAND_FALLBACK = 'Gyro Store';

function readEnv(key: 'BRAND_NAME'): string {
  if (typeof window !== 'undefined') return window.ENV?.[key] ?? '';
  return process.env[key] ?? '';
}

export function getBrandName(): string {
  return readEnv('BRAND_NAME') || BRAND_FALLBACK;
}

// Compone el <title> de una página: "Sección · Marca" (o "Sección · Marca Admin").
export function pageTitle(section?: string, opts?: { admin?: boolean }): string {
  const brand = getBrandName() + (opts?.admin ? ' Admin' : '');
  return section ? `${section} · ${brand}` : brand;
}
