import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

// Límite general para toda la API: 300 peticiones cada 15 minutos por IP
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite estricto para endpoints de telemetría: 20 peticiones cada 5 minutos por IP
export const telemetryLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite estricto para el checkout público (POST /api/orders/public): 10 pedidos
// cada 15 minutos por IP. Es el único endpoint anónimo que ESCRIBE en la base, así
// que el límite general de 300/15min es demasiado holgado: bastaría un script para
// llenar `public_orders` de basura y ensuciar el CRM. Un comprador real no hace
// más de un par de pedidos seguidos.
export const publicOrderLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios pedidos desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Mismo criterio que publicOrderLimiter: POST /api/contact es el otro
// endpoint anónimo que escribe en la base (crea/actualiza un contacto del
// CRM). Sin esto, un script podría llenar `contacts`/`contact_activities` de
// basura tan fácil como el checkout público.
export const contactLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios mensajes desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});