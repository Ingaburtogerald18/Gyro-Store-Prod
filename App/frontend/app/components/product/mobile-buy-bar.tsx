// Barra de compra fija en móvil: el precio y el "Agregar" siguen al alcance del
// pulgar por larga que sea la ficha.
//
// Se esconde cuando el footer entra en pantalla: si no, tapa los enlaces del
// cierre justo cuando el usuario llegó ahí a propósito. También respeta
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
  disabled,
  onAdd,
  onWhatsApp,
  addLabel,
}: {
  name: string;
  /** Ya formateado: el formato del dinero vive en lib/formatters. */
  price: string;
  disabled?: boolean;
  onAdd: () => void;
  onWhatsApp: () => void;
  addLabel: string;
}) {
  const reduce = useReducedMotion();
  const footerVisible = useElementInView('public-footer');
  const hidden = footerVisible;

  return (
    <motion.div
      // Sale del flujo hacia abajo en vez de desaparecer de golpe. Con
      // prefers-reduced-motion se resuelve por opacidad.
      animate={hidden ? { y: reduce ? 0 : '120%', opacity: reduce ? 0 : 1 } : { y: 0, opacity: 1 }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden={hidden}
      className="fixed inset-x-0 bottom-[var(--consent-height,0px)] z-30 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{name}</p>
          <p className="font-heading text-lg font-extrabold tracking-tight text-foreground tabular-nums">{price}</p>
        </div>

        <Button
          variant="whatsappOutline"
          size="icon"
          onClick={onWhatsApp}
          aria-label={`Consultar por ${name} por WhatsApp`}
          // 44px: mínimo táctil, aunque el botón se vea compacto al lado del CTA.
          className="h-11 w-11 shrink-0"
          tabIndex={hidden ? -1 : undefined}
        >
          <WhatsappIcon className="h-[18px] w-[18px]" />
        </Button>

        <Button
          onClick={onAdd}
          disabled={disabled}
          className="h-11 shrink-0 px-5"
          tabIndex={hidden ? -1 : undefined}
        >
          <HugeIcon icon={ShoppingCart02Icon} size={16} strokeWidth={2} aria-hidden />
          {addLabel}
        </Button>
      </div>
    </motion.div>
  );
}
