// Telemetría de búsqueda con las reglas anti-data-falsa (objetivo #1 del encargo):
//   · DEBOUNCE: se espera a que el visitante deje de teclear (no un evento por
//     tecla — "audifonos" son 9 pulsaciones, 1 sola búsqueda).
//   · COMMIT + intención: solo se registra con >= 3 caracteres normalizados.
//   · DEDUPE: no se re-registra la misma query consecutiva.
//   · resultsCount / zeroResults: los sella el cliente en el momento de emitir;
//     las de 0 resultados son demanda insatisfecha (lo más accionable).
//
// El track descarta la emisión si no hay consentimiento o si es staff
// (ver analytics.client), así que este hook no filtra eso.
import { useEffect, useRef } from 'react';

import { useAppSelector } from '~/store/hooks';
import { selectSearch } from '~/store/slices/uiSlice';
import { trackSearch } from '~/lib/analytics.client';

const MIN_LEN = 3;
const DEBOUNCE_MS = 700;

// Mismo normalizado que la búsqueda real (useCatalogFilter): sin tildes,
// minúsculas y trim, para que la métrica agrupe "audífono" y "audifono".
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

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
    const q = normalize(search);
    if (q.length < MIN_LEN || q === lastLogged.current) return;

    const timer = setTimeout(() => {
      lastLogged.current = q;
      trackSearch(q, countRef.current);
    }, DEBOUNCE_MS);

    // Cada tecla reinicia el timer: si el visitante sigue escribiendo, la
    // búsqueda intermedia no se registra.
    return () => clearTimeout(timer);
  }, [search]);
}
