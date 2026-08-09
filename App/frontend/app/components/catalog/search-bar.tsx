// Buscador del catálogo. La fuente de verdad es `ui.search` en Redux: el header
// escribe y la grilla lee, sin pasarse props por media app.
//
// El panel de recomendaciones del V1 (términos populares + productos destacados)
// NO se porta todavía: depende de la telemetría de búsqueda, que en este
// proyecto no existe (no hay tabla ni endpoint /api/search-events/popular). Un
// panel con datos inventados sería peor que ninguno.
import { HugeIcon } from '~/components/ui/icon';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '~/components/ui/input-group';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { searchSet, selectSearch } from '~/store/slices/uiSlice';
import { cn } from '~/lib/utils';
import { useNavigate } from '@remix-run/react';

export function SearchBar({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const search = useAppSelector(selectSearch);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/?q=${encodeURIComponent(search.trim())}#catalogo`);
    } else {
      navigate('/#catalogo');
    }
    
    // Si ya estamos en la home, el navigate no recarga la página, así que
    // forzamos el scroll al catálogo.
    if (window.location.pathname === '/') {
      setTimeout(() => {
        document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <InputGroup className={cn('h-11', className)}>
      <InputGroupAddon>
        <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
      </InputGroupAddon>

      <InputGroupInput
        type="search"
        inputMode="search"
        value={search}
        onChange={(e) => dispatch(searchSet(e.target.value))}
        placeholder="Buscar en el catálogo…"
        aria-label="Buscar productos"
        // 16px en móvil: por debajo de ese tamaño Safari iOS hace zoom al
        // enfocar y descuadra el header.
        className="text-[16px] md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
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
