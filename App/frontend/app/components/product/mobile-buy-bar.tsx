// Barra de compra fija en móvil: el precio y el "Agregar" siguen al alcance del
// pulgar por larga que sea la ficha.
//
// Se esconde cuando la compra principal o el footer entran en pantalla.
// También respeta
// `env(safe-area-inset-bottom)` para no quedar bajo la barra del navegador.
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ShoppingCart02Icon } from '@hugeicons/core-free-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';

import { Button } from '~/components/ui/button';
import { useElementInView } from '~/hooks/useElementInView';

export function MobileBuyBar({
  name,
  price,
  mode = 'add',
  onAdd,
  onWhatsApp,
  addLabel,
  buyActionsId,
}: {
  name: string;
  /** Ya formateado: el formato del dinero vive en lib/formatters. */
  price: string;
  /** 'consult': agotado o sin stock verificable — la acción es consultar. */
  mode?: 'add' | 'consult';
  /** Agregar; si falta elegir opciones, lleva al selector y lo explica. */
  onAdd: () => void;
  onWhatsApp: () => void;
  addLabel: string;
  buyActionsId?: string;
}) {
  const reduce = useReducedMotion();
  const footerVisible = useElementInView('public-footer');
  const buyActionsVisible = useElementInView(buyActionsId ?? '');
  const hidden = footerVisible || buyActionsVisible;

  return (
    <motion.div
      // Sale del flujo hacia abajo en vez de desaparecer de golpe. Con
      // prefers-reduced-motion se resuelve por opacidad.
      animate={hidden ? { y: reduce ? 0 : '120%', opacity: reduce ? 0 : 1 } : { y: 0, opacity: 1 }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden={hidden}
      style={{ pointerEvents: hidden ? 'none' : 'auto' }}
      className="fixed inset-x-0 bottom-[var(--consent-height,0px)] z-30 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{name}</p>
          <p className="font-heading text-lg font-extrabold tracking-tight text-foreground tabular-nums">{price}</p>
        </div>

        {mode === 'consult' ? (
          <Button
            variant="whatsapp"
            onClick={onWhatsApp}
            className="h-12 shrink-0 px-4"
            tabIndex={hidden ? -1 : undefined}
          >
            <WhatsappIcon className="size-[18px]" />
            Consultar
          </Button>
        ) : (
          <>
            <Button
              variant="whatsappOutline"
              size="icon"
              onClick={onWhatsApp}
              aria-label={`Consultar por ${name} por WhatsApp`}
              // 48px: objetivo táctil cómodo al lado del CTA.
              className="size-12 shrink-0"
              tabIndex={hidden ? -1 : undefined}
            >
              <WhatsappIcon className="size-[18px]" />
            </Button>

            <Button
              onClick={onAdd}
              className="h-12 shrink-0 px-5 text-base"
              tabIndex={hidden ? -1 : undefined}
            >
              <HugeIcon icon={ShoppingCart02Icon} size={18} strokeWidth={2} aria-hidden />
              {addLabel}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
