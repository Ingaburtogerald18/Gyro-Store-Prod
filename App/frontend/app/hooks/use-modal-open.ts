// Hay un panel o ventana modal abierto (menú, carrito, foto ampliada, filtros, aviso). Radix bloquea el
// desplazamiento y marca el <body> con `data-scroll-locked`: se observa eso, sin atar cada panel a mano.
import { useEffect, useState } from 'react';

const LOCK_ATTRIBUTE = 'data-scroll-locked';

export function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const body = document.body;
    const update = () => setOpen(body.hasAttribute(LOCK_ATTRIBUTE));
    update();
    const observer = new MutationObserver(update);
    observer.observe(body, { attributes: true, attributeFilter: [LOCK_ATTRIBUTE] });
    return () => observer.disconnect();
  }, []);

  return open;
}
