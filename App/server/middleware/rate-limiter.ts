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

// El checkout es el único endpoint anónimo que escribe pedidos: con el límite general un script
// podría llenar `public_orders`. Un comprador real no hace más de un par seguidos.
export const publicOrderLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios pedidos desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// El contacto también escribe en la base sin sesión (contacts): mismo criterio que el checkout.
export const contactLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios mensajes desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
// «Avisame cuando haya» (POST /api/stock-notices): también escribe en el CRM.
// Un cliente real pide uno o dos avisos; 5 cada 15 minutos alcanza.
export const stockNoticeLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Recibimos varios avisos desde esta conexión. Esperá unos minutos e intentá de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Búsqueda anónima por número + teléfono: sin límite propio se podrían probar números en bucle.
export const trackOrderLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false,
});
