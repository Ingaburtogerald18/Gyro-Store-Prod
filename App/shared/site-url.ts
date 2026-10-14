// Origen público de la tienda a partir de una variable de entorno. El canonical y los enlaces salen de
// la configuración, no del Host de la petición, para que un dominio alternativo no se anuncie como el propio.
export function originFromEnv(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}
