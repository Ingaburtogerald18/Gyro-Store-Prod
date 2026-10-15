import type { Request, Response } from 'express';
import { rateLimit, type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import { verifiedSubject } from '../core/supabase';
import { logger } from '../utils/logger';

// Detrás de Cloudflare `req.ip` puede ser la IP del borde, compartida por muchos visitantes.
// CF-Connecting-IP es la del cliente y la escribe Cloudflare; sin ella queda la del proxy.
const clientKey = (req: Request) => req.get('cf-connecting-ip') || req.ip || 'sin-ip';

// Con sesión de firma válida se cuenta por persona: el equipo suele compartir la conexión de la tienda.
async function personOrClientKey(req: Request) {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const sub = token ? await verifiedSubject(token) : null;
  return sub ? `user:${sub}` : clientKey(req);
}

// Cada rechazo queda en el log: así se ve si un límite está frenando a gente real.
function logRejection(name: string) {
  return (req: Request, res: Response, _next: unknown, options: Options) => {
    logger.warn(`[límite] ${name}`, { path: req.originalUrl.split('?')[0], key: clientKey(req), ip: req.ip });
    res.status(options.statusCode).json(options.message);
  };
}

const shared = { standardHeaders: true, legacyHeaders: false, keyGenerator: clientKey } as const;

// Límite general para toda la API. Las escrituras anónimas tienen además su límite propio, abajo.
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  keyGenerator: personOrClientKey,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
  handler: logRejection('general'),
});

// Límite estricto para endpoints de telemetría: 20 peticiones cada 5 minutos por IP
export const telemetryLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
  handler: logRejection('telemetría'),
});

// El checkout es el único endpoint anónimo que escribe pedidos: con el límite general un script
// podría llenar `public_orders`. Un comprador real no hace más de un par seguidos.
export const publicOrderLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios pedidos desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  handler: logRejection('pedido público'),
});

// El contacto también escribe en la base sin sesión (contacts): mismo criterio que el checkout.
export const contactLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Recibimos varios mensajes desde esta conexión. Esperá unos minutos e intentá de nuevo.',
  },
  handler: logRejection('contacto'),
});
// «Avisame cuando haya» (POST /api/stock-notices): también escribe en el CRM.
// Un cliente real pide uno o dos avisos; 5 cada 15 minutos alcanza.
export const stockNoticeLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Recibimos varios avisos desde esta conexión. Esperá unos minutos e intentá de nuevo.' },
  handler: logRejection('aviso de stock'),
});

// Búsqueda anónima por número + teléfono: sin límite propio se podrían probar números en bucle.
export const trackOrderLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
  handler: logRejection('seguimiento de pedido'),
});
