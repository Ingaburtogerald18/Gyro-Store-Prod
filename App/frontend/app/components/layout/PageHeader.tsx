// Encabezado único de las rutas admin: título de 24 px / 700 y la acción
// principal. El peso de la pantalla lo da el contenido, no el título.
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  filters,
  className,
}: {
  /** Grupo del nav al que pertenece el módulo ("Operación", "Tienda"…). */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Dato secundario al lado del título: "Actualizado hace 2 min". */
  meta?: ReactNode;
  /** Acción primaria de la pantalla. Una, a lo sumo dos. */
  actions?: ReactNode;
  /** Fila inferior separada. Los filtros no compiten con el título. */
  filters?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('admin-page-header', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end sm:justify-between">
        <div className="min-w-0">
          {/* Migas "Grupo / Sección" en tono de texto, no un rótulo en
              mayúsculas: ubica sin competir con el título. */}
          {eyebrow && (
            <p className="text-xs text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-heading text-2xl leading-tight font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
          {description && (
            // `text-pretty` evita que la última línea quede con una sola palabra.
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="admin-page-actions flex max-w-full flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>

      {/* Los filtros van en su propia fila, separados por un borde. Apilados a
          la derecha del título desbalanceaban la fila y en móvil se acomodaban
          de forma impredecible. */}
      {filters && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          {filters}
        </div>
      )}
    </header>
  );
}
