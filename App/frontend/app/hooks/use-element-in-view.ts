// ¿Está un elemento (por id) dentro del viewport?
//
// Lo usa la barra de compra móvil para esconderse cuando el footer aparece: si
// no, tapa los enlaces del cierre de la página justo cuando el usuario llegó
// hasta ahí a propósito.
//
// IntersectionObserver y no un listener de scroll: no corre en cada píxel y el
// navegador lo resuelve fuera del hilo principal.
import { useEffect, useState } from 'react';

export function useElementInView(elementId: string): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    // El elemento puede montarse después que este efecto (el footer vive en el
    // shell); si no está todavía, no se observa nada y la barra sigue visible,
    // que es el estado seguro.
    const el = document.getElementById(elementId);
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [elementId]);

  return inView;
}
