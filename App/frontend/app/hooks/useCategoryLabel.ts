// Resuelve el valor guardado en `purchases.category` a un nombre legible.
//
// ── Por qué es un hook compartido y no una función en cada tabla ──
// Lo consumen la tabla de Compras y la de Inventario actual. Cuando cada una
// tenía su propia resolución, arreglar una dejaba a la otra mostrando uuids
// crudos — que es exactamente lo que pasó.
//
// ── Por qué resuelve en cada render y no se guarda el nombre ──
// La compra guarda el ID de la categoría. Eso es lo que hace que renombrarla en
// Catálogo se refleje en las tablas sin tocar una sola fila: al invalidarse el
// tag `Categories`, la query refetchea y el rótulo cambia solo. Si se guardara
// el nombre, cada compra quedaría congelada con el rótulo que tenía el día que
// se registró.
import { useCallback } from 'react';

import { useGetCategoriesQuery } from '~/store/api/catalogAdminApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';

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

      // 3) Un uuid que ya no está en ninguna lista es una categoría BORRADA;
      //    imprimirlo crudo no le dice nada a nadie. Un valor que no es uuid es
      //    texto viejo escrito a mano, y ahí el texto sí es la mejor etiqueta.
      return UUID_RE.test(value) ? 'Categoría eliminada' : value;
    },
    [categories, config],
  );
}
