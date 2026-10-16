// Barra de compra fija en el celular. Se esconde (y no recibe toques ni foco) cuando la compra principal o el
// footer están a la vista, o cuando hay un panel abierto encima: menú, carrito, foto ampliada o un aviso.
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigation } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { Notification03Icon, ShoppingCart02Icon } from '@hugeicons/core-free-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';

import { Button } from '~/components/ui/button';
import { useElementInView } from '~/hooks/use-element-in-view';
import { useModalOpen } from '~/hooks/use-modal-open';

export function MobileBuyBar({
  name,
  price,
  mode = 'add',
  onAdd,
  onNotify,
  onWhatsApp,
  buyActionsId,
}: {
  name: string;
  /** Ya formateado: el formato del dinero vive en lib/formatters. */
  price: string;
  /** 'consult': sin stock verificable — la acción es consultar. 'notify': agotado o en camino — pedir aviso. */
  mode?: 'add' | 'consult' | 'notify';
  /** Agregar; si falta elegir opciones, lleva al selector y lo explica. */
  onAdd: () => void;
  onNotify?: () => void;
  onWhatsApp: () => void;
  buyActionsId?: string;
}) {
  const reduce = useReducedMotion();
  const footerVisible = useElementInView('public-footer');
  const buyActionsVisible = useElementInView(buyActionsId ?? '');
  const modalOpen = useModalOpen();
  const keyboardOpen = useKeyboardOpen();
  const navigation = useNavigation();
  const hidden = footerVisible || buyActionsVisible || modalOpen || keyboardOpen || navigation.state !== 'idle';
  const tabIndex = hidden ? -1 : undefined;

  return (
    <motion.div
      // Sale hacia abajo en vez de desaparecer de golpe; con movimiento reducido, solo se desvanece.
      animate={hidden ? { y: reduce ? 0 : '120%', opacity: reduce ? 0 : 1 } : { y: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0.15 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden={hidden}
      style={{ pointerEvents: hidden ? 'none' : 'auto' }}
      className="fixed inset-x-0 bottom-[var(--consent-height,0px)] z-30 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full min-w-0 items-baseline justify-between gap-3">
          <p className="truncate text-xs font-medium text-muted-foreground">{name}</p>
          <p className="max-w-[65%] shrink-0 text-right font-heading text-base font-extrabold leading-snug text-foreground tabular-nums">{price}</p>
        </div>

        {mode === 'notify' ? (
          <>
            <Button
              variant="whatsappOutline"
              size="icon"
              onClick={onWhatsApp}
              aria-label={`Consultar por ${name} por WhatsApp`}
              className="size-12 shrink-0"
              tabIndex={tabIndex}
            >
              <WhatsappIcon className="size-[18px]" />
            </Button>
            <Button onClick={onNotify} className="h-12 flex-1 px-4 text-base" tabIndex={tabIndex}>
              <HugeIcon icon={Notification03Icon} size={18} strokeWidth={2} aria-hidden />
              Avisame
            </Button>
          </>
        ) : mode === 'consult' ? (
          <Button variant="whatsapp" onClick={onWhatsApp} className="h-12 w-full px-4" tabIndex={tabIndex}>
            <WhatsappIcon className="size-[18px]" />
            Consultar
          </Button>
        ) : (
          // Igual que la ficha: WhatsApp principal y el carrito como secundaria, con su nombre a la vista.
          <>
            <Button
              variant="outline"
              onClick={onAdd}
              aria-label="Agregar al carrito"
              className="h-12 flex-1 px-3"
              tabIndex={tabIndex}
            >
              <HugeIcon icon={ShoppingCart02Icon} size={18} strokeWidth={2} aria-hidden />
              Agregar
            </Button>
            <Button variant="whatsapp" onClick={onWhatsApp} className="h-12 flex-1 px-3" tabIndex={tabIndex}>
              <WhatsappIcon className="size-[18px]" />
              Consultar
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// El teclado de Safari reduce el viewport visual sin cambiar necesariamente el layout.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const editing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      setOpen(Boolean(editing && viewport && window.innerHeight - viewport.height > 150));
    };
    viewport?.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return open;
}
