// La métrica que domina la pantalla de Reportería.
//
// ── Por qué existe ──
// Antes había seis bandas de tarjetas del mismo tamaño y peso: nada decía "mirá
// esto primero". La regla que se instala con este componente, y que vale para
// todo el admin: **un solo elemento por pantalla puede tener el peso máximo.**
// Si dos compiten, ninguno gana.
//
// Por eso el resto de los KPIs pasan a versión compacta y sin CountUp. El peso
// no se reparte.
import type { IconSvgElement } from '@hugeicons/react';
import { Area, AreaChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '~/components/ui/chart';

const sparklineConfig = {
  value: { label: 'Valor', color: 'var(--color-primary)' },
} satisfies ChartConfig;

import { HugeIcon } from '~/components/ui/icon';
import { CountUp } from '~/components/ui/CountUp';
import { Delta } from '~/components/ui/delta';
import { cn } from '~/lib/utils';

export function HeroMetric({
  icon,
  eyebrow,
  value,
  prev,
  format,
  series,
  onClick,
  className,
}: {
  icon?: IconSvgElement;
  eyebrow: string;
  value: number;
  prev?: number;
  format: (n: number) => string;
  /** Serie para el sparkline. Sin ella, el pie de la tarjeta no se dibuja. */
  series?: { value: number }[];
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <HugeIcon icon={icon} size={16} strokeWidth={2} className="text-primary" />
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>

      {/* 48 px. Es el único número de la pantalla a este tamaño. */}
      <p className="nums mt-3 font-heading text-5xl font-semibold tracking-tight text-foreground">
        <CountUp value={value} format={format} />
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Delta value={value} prev={prev} className="text-sm" />
        {prev !== undefined && prev > 0 && (
          <span className="nums text-xs text-muted-foreground">
            vs {format(prev)} el periodo anterior
          </span>
        )}
      </div>

      {/* Sparkline: sin ejes, sin grilla, sin tooltip. No es un gráfico para
          leer valores — es la forma de la tendencia, y compite con nada. */}
      {series && series.length > 1 && (
        <ChartContainer config={sparklineConfig} className="mt-4 !aspect-auto h-12 w-full">
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              fill="var(--color-primary)"
              fillOpacity={0.1}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </>
  );

  const shell = cn(
    'rounded-card border border-border bg-card p-6 transition-colors',
    onClick && 'cursor-pointer text-left hover:border-primary/40',
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shell, 'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
      >
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * KPI secundario: label chico, valor mediano, delta. Sin CountUp, sin
 * spotlight, sin sombra — todo eso está reservado al héroe.
 *
 * El VALOR va en `text-foreground`, siempre. El color del acento queda para el
 * icono y para el delta: si cada tarjeta pinta su número de un tono distinto,
 * el color deja de significar algo y la pantalla se vuelve un arcoíris.
 */
export function CompactKpi({
  icon,
  label,
  value,
  prev,
  format,
  invert = false,
  sub,
  onClick,
  href,
  valueClassName,
}: {
  icon?: IconSvgElement;
  label: string;
  value: number;
  prev?: number;
  format?: (n: number) => string;
  /** true cuando subir es malo (coste). */
  invert?: boolean;
  sub?: string;
  onClick?: () => void;
  href?: string;
  valueClassName?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5">
        {icon && (
          <HugeIcon
            icon={icon}
            size={14}
            strokeWidth={2}
            className="text-muted-foreground/70"
          />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn("nums mt-1.5 text-xl font-semibold text-foreground", valueClassName)}>
        {format ? format(value) : value.toLocaleString('es-NI')}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <Delta value={value} prev={prev} invert={invert} />
        {sub && <span className="nums text-xs text-muted-foreground">{sub}</span>}
      </div>
    </>
  );

  const cls =
    'rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (href) {
    return (
      <a href={href} className={cls}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return <div className={cls.replace('hover:border-primary/40', '')}>{content}</div>;
}
