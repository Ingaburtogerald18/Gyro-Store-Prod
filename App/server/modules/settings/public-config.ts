import { config } from '../../core/config';

export interface PublicConfig {
  brandName: typeof config.brandName;
  contactEmail: typeof config.contactEmail;
  internalDomain: typeof config.internalDomain;
  appUrl: typeof config.appUrl;
  currency: typeof config.currency;
  exchangeRate: typeof config.exchangeRate;
  whatsapp: typeof config.whatsapp;
}

// La parte de la config pública que sale del entorno. Categorías e imágenes las agrega la ruta. Sin secretos.
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
