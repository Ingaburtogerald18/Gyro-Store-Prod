// Sincroniza URL y filtros del catálogo en los dos sentidos (contrato en lib/catalog-query.ts).
// Sin bucles: cada lado escribe solo si la firma del otro es distinta.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from '@remix-run/react';
import type { StoreCategory } from '~/state/api/session-api';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { catalogFiltersApplied, selectCatalogFilters } from '~/state/slices/ui-slice';
import { catalogHref, filtersKey, parseCatalogLocation } from '~/lib/catalog-query';

export function CatalogUrlSync({ categories = [] }: { categories?: StoreCategory[] }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const filters = useAppSelector(selectCatalogFilters);
  const previous = useRef<typeof filters | null>(null);
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  // URL → filtros.
  useEffect(() => {
    const fromUrl = parseCatalogLocation(pathname, new URLSearchParams(search), categoriesRef.current);
    if (filtersKey(fromUrl) !== filtersKey(filters)) dispatch(catalogFiltersApplied(fromUrl));
    // Solo cuando cambia la URL: los filtros se leen en su valor actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, dispatch]);

  // filtros → URL. La primera pasada solo registra (la URL acaba de mandar).
  useEffect(() => {
    const before = previous.current;
    previous.current = filters;
    if (!before || before === filters) return;
    const params = new URLSearchParams(search);
    if (filtersKey(parseCatalogLocation(pathname, params, categoriesRef.current)) === filtersKey(filters)) return;
    // Otra categoría es otra página (historial y scroll nuevos); escribir o ajustar precio reemplaza
    // la entrada actual para no llenar el historial.
    const otherCategory = before.category !== filters.category;
    navigate(catalogHref(filters, params), { replace: !otherCategory, preventScrollReset: !otherCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return null;
}
