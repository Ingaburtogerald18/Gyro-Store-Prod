// Media query reactiva. Arranca en `false` y se resuelve al montar: en SSR no
// hay viewport, así que asumir "móvil" evita un salto de layout en el teléfono,
// que es donde se navega la tienda.
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
