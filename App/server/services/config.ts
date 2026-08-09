import { config } from '../config';

export interface PublicConfig {
  brandName: typeof config.brandName;
  contactEmail: typeof config.contactEmail;
  internalDomain: typeof config.internalDomain;
  appUrl: typeof config.appUrl;
  currency: typeof config.currency;
  exchangeRate: typeof config.exchangeRate;
  whatsapp: typeof config.whatsapp;
}

// Devuelve la parte de la config pública que sale de env (síncrona). Las
// categorías y las imágenes viven en `app_config` (BD) y las agrega la ruta
// GET /api/config de forma asíncrona. Nada de secretos acá.
export function getPublicConfig(): PublicConfig {
  return {
    brandName: config.brandName,
    contactEmail: config.contactEmail,
    internalDomain: config.internalDomain,
    appUrl: config.appUrl,
    currency: config.currency,
    exchangeRate: config.exchangeRate,
    whatsapp: config.whatsapp,
  };
}
