// IntersectionObserver: la barra de compra móvil se esconde cuando aparece el footer.
import { useEffect, useState } from 'react';
import { useLocation } from '@remix-run/react';

export function useElementInView(elementId: string): boolean {
  const [inView, setInView] = useState(false);
  const { key } = useLocation();

  useEffect(() => {
    setInView(false);
    // Si el elemento todavía no está montado no se observa nada y la barra queda visible, el estado seguro.
    const el = document.getElementById(elementId);
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [elementId, key]);

  return inView;
}
