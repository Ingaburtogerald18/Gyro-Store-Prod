// URLs del negocio compartidas por varias piezas (footer, banners, modales).
// Centralizadas aquí para no duplicar en cada componente.
//
// Las redes sociales están hardcoded hasta que el endpoint /api/config exponga
// socialLinks en el schema. Para actualizar, cambia solo este archivo.

/** Ficha de Google Maps → el cliente puede tocar "Escribir una reseña" directamente. */
export const GOOGLE_REVIEW_URL = 'https://maps.app.goo.gl/G7t4aYcJ8Npu4eY46';

/** Página de Facebook del negocio (reseñas y seguimiento). */
export const FACEBOOK_REVIEW_URL =
  'https://www.facebook.com/profile.php?id=61589182888082&sk=reviews';

/** Mensaje por defecto del CTA genérico de WhatsApp (cuando no es de un producto específico). */
export const WHATSAPP_DEFAULT_MESSAGE = 'Hola, quiero más información sobre un producto.';

/** URLs de redes sociales del negocio.
 *  TODO: mover a /api/config una vez que socialLinks se agregue al schema. */
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/gyro_store/',
  facebook: 'https://www.facebook.com/profile.php?id=61589182888082',
  tiktok: 'https://www.tiktok.com/@gyro_store',
} as const;
