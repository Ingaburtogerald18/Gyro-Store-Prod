import { useEffect, useRef } from 'react';

import { useAppSelector } from '~/store/hooks';
import { selectSearch } from '~/store/slices/uiSlice';
import { trackSearch } from '~/lib/analytics.client';
import { normalizeSearch } from '~/lib/search';

const MIN_LEN = 3;
const DEBOUNCE_MS = 700;

/**
 * Registra la búsqueda "committed" tras la pausa de tecleo.
 * @param resultsCount cuántos productos devolvió el filtro para la query actual.
 */
export function useSearchTelemetry(resultsCount: number): void {
  const search = useAppSelector(selectSearch);
  const lastLogged = useRef('');
  // El conteo se lee por ref para NO reiniciar el debounce cuando cambia: el
  // timer depende solo de la query; al dispararse toma el conteo ya definitivo.
  const countRef = useRef(resultsCount);
  countRef.current = resultsCount;

  useEffect(() => {
    const q = normalizeSearch(search);
    if (q.length < MIN_LEN) {
      lastLogged.current = '';
      return;
    }
    if (q === lastLogged.current) return;

    const timer = setTimeout(() => {
      lastLogged.current = q;
      trackSearch(q, countRef.current);
    }, DEBOUNCE_MS);

    // Cada tecla reinicia el timer: si el visitante sigue escribiendo, la
    // búsqueda intermedia no se registra.
    return () => clearTimeout(timer);
  }, [search]);
}
