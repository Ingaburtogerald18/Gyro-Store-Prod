// Config pública de la tienda (logo, categorías, WhatsApp, moneda) disponible
// también en el HTML del servidor.
//
// El header, el pie y el hero leían la config solo de RTK Query, que en el SSR
// no tiene datos: la página salía sin logo, sin categorías en el header y sin
// número de WhatsApp hasta que el cliente terminaba su propio fetch. Las rutas
// públicas ya traen esa misma config en su loader, así que se usa como respaldo
// mientras RTK no responde. RTK sigue siendo la fuente de verdad en el cliente
// (refleja cambios del panel sin recargar).
import { useMatches } from '@remix-run/react';

import type { LandingConfig } from '@shared/schemas';
import { useGetConfigQuery, type StoreConfig } from '~/store/api/sessionApi';
import { useGetLandingConfigQuery } from '~/store/api/storefrontApi';

function configFromMatches(matches: ReturnType<typeof useMatches>): StoreConfig | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].data as { config?: StoreConfig | null } | undefined;
    if (data && typeof data === 'object' && data.config) return data.config;
  }
  return undefined;
}

export function useStoreConfig(): StoreConfig | undefined {
  const { data } = useGetConfigQuery();
  const matches = useMatches();
  return data ?? configFromMatches(matches);
}

/** Igual que useStoreConfig, para la config de la landing (categorías del
 *  header, carriles, hero). Solo la home la trae en su loader. */
export function useStoreLanding(): LandingConfig | undefined {
  const { data } = useGetLandingConfigQuery();
  const matches = useMatches();
  if (data) return data;
  for (let i = matches.length - 1; i >= 0; i--) {
    const d = matches[i].data as { landing?: LandingConfig | null } | undefined;
    if (d && typeof d === 'object' && d.landing) return d.landing;
  }
  return undefined;
}
