// La fuente de verdad es `ui.search` en Redux. No hay panel de búsquedas populares: faltaría un
// endpoint público sobre la analítica, y con datos inventados sería peor que ninguno.
import { HugeIcon } from '~/components/ui/icon';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '~/components/ui/input-group';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { searchSet, selectSearch } from '~/state/slices/ui-slice';
import { cn } from '~/lib/utils';
import { catalogHref, DEFAULT_FILTERS, isCatalogPath } from '~/lib/catalog-query';
import { useLocation, useNavigate } from '@remix-run/react';

export function SearchBar({ 
  className,
  autoFocus,
  onBlur 
}: { 
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const dispatch = useAppDispatch();
  const search = useAppSelector(selectSearch);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // En un listado la URL ya sigue a lo que se escribe (CatalogUrlSync); fuera de él, se va al catálogo.
    if (!isCatalogPath(pathname)) navigate(catalogHref({ ...DEFAULT_FILTERS, search }));
    // Cerrar el buscador del celular al buscar.
    if (onBlur) onBlur();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn("store-header-search w-full", className)}>
      <InputGroup className="h-11 w-full">
      <InputGroupAddon>
        <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
      </InputGroupAddon>

      <InputGroupInput
        type="search"
        inputMode="search"
        value={search}
        onChange={(e) => dispatch(searchSet(e.target.value))}
        onBlur={onBlur}
        autoFocus={autoFocus}
        placeholder="Buscar en el catálogo…"
        aria-label="Buscar productos"
        className="text-base md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />

      {search && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={() => dispatch(searchSet(''))}
            aria-label="Limpiar búsqueda"
          >
            <HugeIcon icon={Cancel01Icon} size={14} strokeWidth={2} aria-hidden />
          </InputGroupButton>
        </InputGroupAddon>
      )}
      </InputGroup>
    </form>
  );
}
