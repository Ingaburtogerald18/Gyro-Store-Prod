// Sincroniza en los dos sentidos la URL de la home y los filtros del catálogo
// (contrato en lib/catalogQuery.ts). Un parámetro que falta limpia su filtro.
//
// Sin bucles: cada lado solo escribe si la firma del otro es distinta.
import { useEffect, useRef } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { catalogFiltersApplied, selectCatalogFilters } from '~/store/slices/uiSlice';
import { filtersKey, parseCatalogParams, writeCatalogParams } from '~/lib/catalogQuery';

export function CatalogUrlSync({ categories = [] }: { categories?: StoreCategory[] }) {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useAppSelector(selectCatalogFilters);
  const previous = useRef<typeof filters | null>(null);
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  // URL → filtros.
  useEffect(() => {
    const fromUrl = parseCatalogParams(searchParams, categoriesRef.current);
    if (filtersKey(fromUrl) !== filtersKey(filters)) dispatch(catalogFiltersApplied(fromUrl));
    // Solo cuando cambia la URL: los filtros se leen en su valor actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, dispatch]);

  // filtros → URL. La primera pasada solo registra (la URL acaba de mandar).
  useEffect(() => {
    const before = previous.current;
    previous.current = filters;
    if (!before || before === filters) return;
    const current = parseCatalogParams(searchParams, categoriesRef.current);
    if (filtersKey(current) === filtersKey(filters)) return;
    // Elegir otra categoría crea una entrada de historial (atrás vuelve a la
    // anterior); escribir o ajustar precio la reemplaza para no llenar el historial.
    const push = before.category !== filters.category;
    setSearchParams(writeCatalogParams(filters, searchParams), {
      replace: !push,
      preventScrollReset: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return null;
}
