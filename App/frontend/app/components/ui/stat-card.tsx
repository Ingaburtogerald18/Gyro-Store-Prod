import { useRef } from "react";
import { NavLink } from "@remix-run/react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "~/lib/utils";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeIcon } from "~/components/ui/icon";
import { CountUp } from "./CountUp";

export type SpotlightCardVariant = "default" | "interactive" | "highlight";

export interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SpotlightCardVariant;
  /** Radio del resplandor en px (solo para variant="highlight"). */
  spotlightRadius?: number;
  /** Intensidad del color de acento (0–100) (solo para variant="highlight"). */
  spotlightIntensity?: number;
}

export function SpotlightCard({
  variant = "default",
  spotlightRadius = 360,
  spotlightIntensity = 16,
  className,
  children,
  ...props
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (variant !== "highlight" || reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  }

  // Tres arreglos sobre lo que había:
  //  · `hover:border/80` NO es una clase válida — Tailwind no generaba nada, así
  //    que el hover de borde nunca existió. Ahora es `hover:border-border/80`.
  //  · Sin `hover:-translate-y-1`: mover el elemento al pasar el mouse desplaza
  //    el layout y pelea con el `whileHover` que StatCard ya aplica afuera.
  //  · Sin `shadow-2xl`: la elevación va por borde y fondo (ver Fase 7.1).
  const baseStyles =
    "rounded-card border bg-card shadow-sm transition-colors duration-200 hover:border-border/80";

  // Sin `hover:-translate-y-1`: mover el elemento al pasar el mouse desplaza el
  // layout y, en una grilla, hace que las tarjetas vecinas parezcan temblar.
  // La elevación va por borde (ver `baseStyles`).
  if (variant === "highlight") {
    return (
      <div
        ref={ref}
        onMouseMove={onMouseMove}
        className={cn("group/spot relative overflow-hidden", baseStyles, className)}
        {...props}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300",
            !reduce && "group-hover/spot:opacity-100",
          )}
          style={{
            background: `radial-gradient(${spotlightRadius}px circle at var(--spot-x, -9999px) var(--spot-y, -9999px), color-mix(in srgb, var(--color-accent) ${spotlightIntensity}%), transparent 65%)`,
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        baseStyles,
        // `hover:border-white/10` era color crudo: en tema claro pintaba blanco
        // sobre blanco y el hover desaparecía.
        variant === "interactive" && "transition-colors hover:border-border hover:bg-primary",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Acá vivía `SectionHeader`, marcado `@deprecated` a favor de `SectionLabel`
// (`~/components/layout/SectionLabel`). La migración terminó: no le quedaban
// consumidores, así que se borró en vez de seguir arrastrando dos primitivas
// para lo mismo.

// ── StatCard unificado (mantiene su nombre y Props para retrocompatibilidad) ──
export type StatCardColor = "neutral" | "indigo" | "sky" | "amber" | "emerald" | "rose" | "purple" | "red";

const BASE_STAT = "bg-muted/30 border border-border hover:border-border/80";
const COLOR_MAP: Record<StatCardColor, { card: string; icon: string; label: string; value: string }> = {
  neutral: { card: BASE_STAT, icon: "stat-card-icon text-muted-foreground", label: "text-muted-foreground/90", value: "text-foreground" },
  indigo: { card: `${BASE_STAT} hover:border-tone-indigo/30`, icon: "stat-card-icon text-tone-indigo", label: "text-muted-foreground/90", value: "text-tone-indigo" },
  sky: { card: `${BASE_STAT} hover:border-tone-sky/30`, icon: "stat-card-icon text-tone-sky", label: "text-muted-foreground/90", value: "text-tone-sky" },
  amber: { card: `${BASE_STAT} hover:border-tone-amber/30`, icon: "stat-card-icon text-tone-amber", label: "text-muted-foreground/90", value: "text-tone-amber" },
  emerald: { card: `${BASE_STAT} hover:border-primary/30`, icon: "stat-card-icon text-tone-emerald", label: "text-muted-foreground/90", value: "text-tone-emerald" },
  rose: { card: `${BASE_STAT} hover:border-tone-rose/30`, icon: "stat-card-icon text-tone-rose", label: "text-muted-foreground/90", value: "text-tone-rose" },
  purple: { card: `${BASE_STAT} hover:border-tone-purple/30`, icon: "stat-card-icon text-tone-purple", label: "text-muted-foreground/90", value: "text-tone-purple" },
  red: { card: `${BASE_STAT} hover:border-tone-red/30`, icon: "stat-card-icon text-tone-red", label: "text-muted-foreground/90", value: "text-tone-red" },
};

export function StatCard({
  icon: Icon, label, value, sub, hint, accent = false, color, countTo, format, delay = 0, onClick, href,
}: {
  icon?: IconSvgElement; label: string; value?: string | number; sub?: string; hint?: string; accent?: boolean; color?: StatCardColor; countTo?: number; format?: (n: number) => string; delay?: number;
  /** Abre el drilldown de este KPI. Excluyente con `href`. */
  onClick?: () => void;
  /** Navega a una vista filtrada. Excluyente con `onClick`. */
  href?: string;
}) {
  const reduce = useReducedMotion();
  const chosenColor = color || (accent ? "indigo" : "neutral");
  const theme = COLOR_MAP[chosenColor];
  const interactive = Boolean(onClick || href);

  // Sin `SpotlightCard` adentro (Fase 1.6). La StatCard montaba DOS capas de
  // efecto sobre el mismo elemento: el `whileHover` del motion.div de abajo y,
  // dentro, un spotlight con su propio `hover:-translate-y-1`. El resplandor se
  // reserva para las dos tarjetas grandes de análisis, donde hay superficie
  // suficiente para que se lea como intención y no como ruido.
  const inner = (
    <div className="p-4">
      <div className="flex items-center gap-2">
        {/* `view` y no `hover`: una StatCard no es un control, nadie le pasa
            el mouse por encima. El trazo se dibuja cuando la tarjeta entra en
            pantalla, en la misma entrada que ya hacen el `delay` de arriba y
            el CountUp del valor. */}
        {Icon && <HugeIcon icon={Icon} size={16} strokeWidth={2} className={theme.icon} />}
        <span className={`stat-card-label text-xs uppercase tracking-wide font-medium ${theme.label}`}>{label}</span>
      </div>
      <p className={`stat-card-value nums mt-2 font-display text-2xl font-bold ${theme.value}`}>
        {countTo !== undefined ? <CountUp value={countTo} format={format} /> : value}
      </p>
      {sub && <p className="nums mt-0.5 text-sm font-medium text-muted-foreground">{sub}</p>}
    </div>
  );

  const shell = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, delay }}
      data-tone={chosenColor}
      title={hint}
      className={cn(
        "stat-card-container rounded-card border transition-colors duration-300",
        theme.card,
        // El realce solo aparece si la tarjeta HACE algo. Una tarjeta que se
        // ilumina y no responde al click es peor que una que no se ilumina.
        interactive && "cursor-pointer hover:border-primary/40 hover:shadow-lg",
      )}
    >
      {inner}
    </motion.div>
  );

  // El `href` va en un <a> real y el `onClick` en un <button>: hacen falta el
  // rol, el foco por teclado y el Enter/Espacio que un <div onClick> no da.
  // Envolver por fuera (y no poner el handler en el motion.div) mantiene intacta
  // la animación de entrada y el spotlight.
  if (href) {
    return (
      <NavLink to={href} className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        {shell}
      </NavLink>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Ver detalle de ${label}`}
        className="block w-full text-left rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {shell}
      </button>
    );
  }

  return shell;
}
