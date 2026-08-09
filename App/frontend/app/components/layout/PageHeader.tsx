// Encabezado ÚNICO de las rutas admin. Ninguna ruta define el suyo.
//
// ── Por qué existe siendo obligatorio ──
// Ocho de las diez rutas copiaban literalmente
// `text-3xl font-extrabold tracking-tight text-foreground`. Cada retoque de
// tipografía había que hacerlo ocho veces, y `admin.usuarios` ya se había
// desincronizado (agregó `font-heading`, las otras no).
//
// ── Por qué el título bajó de peso ──
// `text-3xl font-extrabold` (30 px, 800) se lee como plantilla, no como
// producto: el título gritaba más fuerte que los datos. El peso de la pantalla
// lo tiene que dar la métrica, no el rótulo del módulo. Acá va 24 px / 600.
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
    <header className={cn('mb-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
          {description && (
            // `text-pretty` evita que la última línea quede con una sola palabra.
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
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
