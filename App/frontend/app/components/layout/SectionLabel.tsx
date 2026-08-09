// Etiqueta de sección dentro de una página.
//
// Se repetía a mano como `text-sm font-semibold uppercase tracking-wide
// text-muted-foreground` en al menos tres lugares del dashboard, y a ese tamaño
// competía con el título del `PageHeader`. Acá baja a 11 px: una sección no es
// una página, y su rótulo tiene que leerse como separador, no como encabezado.
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Contenido a la derecha: un total, un enlace, un filtro. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </h2>
      {action && <div className="shrink-0 text-xs text-muted-foreground">{action}</div>}
    </div>
  );
}
