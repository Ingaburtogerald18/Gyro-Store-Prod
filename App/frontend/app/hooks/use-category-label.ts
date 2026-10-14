// Nombre legible de `purchases.category`, compartido por Compras e Inventario actual. Se guarda el id,
// así renombrar la categoría se refleja sin tocar las filas.
import { useCallback } from 'react';

import { useGetCategoriesQuery } from '~/state/api/catalog-admin-api';
import { useGetConfigQuery } from '~/state/api/session-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCategoryLabel() {
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: config } = useGetConfigQuery();

  return useCallback(
    (value: string | null | undefined): string => {
      if (!value) return '—';

      // 1) Catálogo: la lista que usan hoy los formularios de compra.
      const fromCatalog = categories.find((c) => c.id === value);
      if (fromCatalog) return fromCatalog.name;

      // 2) `config`: las del storefront, que es lo que se guardaba antes de
      //    unificar. Sin este paso, toda compra vieja mostraría un uuid.
      const fromConfig = config?.categories?.find((c) => c.id === value);
      if (fromConfig) return `${fromConfig.icon} ${fromConfig.name}`;

      // Un uuid que no está en la lista es una categoría borrada; un texto que no es uuid es un valor viejo.
      return UUID_RE.test(value) ? 'Categoría eliminada' : value;
    },
    [categories, config],
  );
}
