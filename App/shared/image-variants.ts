// Las fotos que sube el panel se guardan como `<hash de 16 hex>.webp` (hasta 1200 px) y, al lado, su
// miniatura `<hash>-480.webp` para tarjetas y listados. Otras direcciones no tienen miniatura.
export const THUMBNAIL_WIDTH = 480;

const UPLOADED_IMAGE = /(^|\/)[0-9a-f]{16}\.webp$/;

/** Sirve con la dirección pública o con la clave del bucket. */
export function thumbnailUrl(url: string | null | undefined): string | null {
  return url && UPLOADED_IMAGE.test(url) ? url.replace(/\.webp$/, `-${THUMBNAIL_WIDTH}.webp`) : null;
}
