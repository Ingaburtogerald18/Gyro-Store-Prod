import { originFromEnv } from '@shared/site-url';

// Canonical, sitemap y robots usan APP_URL (el dominio propio). Sin ella, el de la petición: en
// producción conviene cargarla para que el dominio de Render no aparezca como el principal.
export function siteOrigin(request: Request): string {
  return originFromEnv(process.env.APP_URL) ?? new URL(request.url).origin;
}
