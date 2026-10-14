// Rótulo de sección a 11 px: separa, no compite con el título de la página.
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
      <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </h2>
      {action && <div className="shrink-0 text-xs text-muted-foreground">{action}</div>}
    </div>
  );
}
