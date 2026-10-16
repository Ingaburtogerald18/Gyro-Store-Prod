import type { StoreConfig } from '~/state/api/session-api';

/** Enlace a Maps del punto de retiro: el de Configuración manda; si no hay, se busca la dirección. */
export function storeMapsUrl(config: Pick<StoreConfig, 'address' | 'locationUrl'> | undefined): string {
  const address = config?.address?.trim();
  return config?.locationUrl?.trim() || (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '');
}

/** Hay algo que consultar en «Ubicación y horarios»: sin dirección ni horarios cargados, no se ofrece. */
export function hasLocationInfo(config: Pick<StoreConfig, 'address' | 'businessHours'> | undefined): boolean {
  return Boolean(config?.address?.trim()) || (config?.businessHours?.length ?? 0) > 0;
}

// Rutas de las páginas informativas: header, footer, ficha, sitemap y las propias páginas las leen de acá.
export const STORE_PAGES = {
  help: '/ayuda',
  howToBuy: '/ayuda/como-comprar',
  paymentsDelivery: '/ayuda/pagos-y-entregas',
  warranty: '/ayuda/garantia-y-cambios',
  wholesale: '/por-mayor',
  contact: '/contacto',
  orders: '/mis-pedidos',
} as const;

/** Dirección y horarios dentro de Contacto: el footer del celular lleva directo ahí. */
export const LOCATION_ANCHOR = 'ubicacion';
export const CONTACT_LOCATION = `${STORE_PAGES.contact}#${LOCATION_ANCHOR}`;
