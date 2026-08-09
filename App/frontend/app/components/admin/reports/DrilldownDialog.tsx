// Pop-up de drilldown: las FILAS detrás de un KPI.
//
// Los KPIs de Reportería dan el agregado; esto responde "¿de dónde salió ese
// número?" sin sacar al usuario de la pantalla. Por eso el footer es sticky y
// va con el total: al scrollear una lista larga, la cifra que se está
// auditando tiene que seguir a la vista para poder compararla con la tarjeta.
import type { ReactNode } from 'react';
import type { IconSvgElement } from '@hugeicons/react';

import { HugeIcon } from '~/components/ui/icon';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

export function DrilldownDialog({
  open,
  onOpenChange,
  title,
  icon,
  note,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: IconSvgElement;
  /** Aclaración fija sobre cómo se calcula la cifra (ej. qué incluye el coste). */
  note?: string;
  /** Totales del periodo. Queda pegado abajo mientras se scrollea la lista. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `flex flex-col` + `max-h-[80vh]`: el que scrollea es el cuerpo, no el
          diálogo entero, para que header y footer queden fijos. */}
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            {icon && (
              <HugeIcon icon={icon} size={18} strokeWidth={2} className="text-primary" />
            )}
            {title}
          </DialogTitle>
          {note && (
            <DialogDescription className="pt-1 text-xs leading-relaxed">{note}</DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>

        {footer && (
          <div className="shrink-0 border-t bg-card px-5 py-3">{footer}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
