// Piezas de la "superficie de trabajo" del panel. Nacieron en el rediseño de
// Inventario y se reutilizan en cada sección, para que todas hablen igual:
//
//   <PageHeader>                 título en una fila + acción principal
//   <Workspace>                  UNA tarjeta que contiene todo lo de abajo
//     <WorkspaceToolbar>         una sola fila: vista, búsqueda, filtros
//     <MetricStrip>              hasta 4 números, divisores verticales
//     tabla / contenido
//
// Radios: 12 px en controles, 16 px en la superficie de trabajo y
// píldora solo en estados (StatusBadge). Montos grandes en
// Chivo (`font-display`), en el color del texto: el color es para señales.
import { useEffect, useRef, type ReactNode } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { HugeIcon } from "~/components/ui/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/** Alto y borde comunes de los controles de la barra. */
export const TOOLBAR_CONTROL = "h-11 rounded-xl border border-border bg-card text-sm md:h-9";

/** ¿El foco está en un campo de texto? Los atajos de una letra no aplican ahí. */
export function isTypingTarget() {
  const el = document.activeElement as HTMLElement | null;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    Boolean(el?.isContentEditable)
  );
}

/**
 * Atajo de una tecla (sin modificadores) para la acción principal de una
 * pantalla. No dispara mientras se escribe ni con un diálogo abierto.
 */
export function useShortcut(key: string, action: () => void, enabled = true) {
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (isTypingTarget() || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      actionRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}

/** Tecla de atajo dentro de un botón ("Registrar compra  N"). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded border border-current/40 px-1 font-spec text-2xs opacity-80", className)}>
      {children}
    </kbd>
  );
}

/**
 * La tarjeta de trabajo. `overflow-clip` y no `overflow-hidden`: recorta las
 * esquinas sin crear un contexto de scroll, así una tabla adentro puede tener
 * encabezado y pie sticky.
 */
export function Workspace({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-clip rounded-2xl border border-border bg-card", className)}>{children}</section>
  );
}

export function WorkspaceToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-3", className)}>
      {children}
    </div>
  );
}

/** Selector de vista ("Compras | Stock actual"). Reemplaza las pestañas píldora. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-card p-1", options.length > 2 && "grid w-full grid-cols-2 sm:inline-flex sm:w-auto")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8",
            value === o.value ? "bg-primary/10 text-primary-2" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Búsqueda de la barra. "/" la enfoca y Esc la limpia. */
export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && document.activeElement === ref.current) {
        onChangeRef.current("");
        ref.current?.blur();
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget() || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label
      className={cn(
        TOOLBAR_CONTROL,
        "flex w-full min-w-0 flex-none items-center gap-2 px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 sm:w-auto sm:min-w-[220px] sm:flex-1",
        className,
      )}
    >
      <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Buscar</span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <kbd className="hidden rounded border border-border px-1.5 font-spec text-2xs text-muted-foreground md:inline">/</kbd>
    </label>
  );
}

/** Select de la barra con su rótulo adentro ("Estado  Todos ▾"). */
export function ToolbarSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger aria-label={label} className={cn(TOOLBAR_CONTROL, "w-auto gap-2 px-3")}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-md">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="rounded-sm">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Un número de la franja. `sub` es el dato secundario (equivalente, contexto). */
export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-2xl leading-tight font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {sub && <span className="truncate text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

/**
 * Franja de métricas: una superficie, divisores verticales. `bordered` agrega
 * el borde de tarjeta cuando la franja va SUELTA (fuera de un Workspace).
 */
export function MetricStrip({
  children,
  columns = 4,
  bordered = false,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 [&>*]:border-border [&>*:nth-child(odd)]:border-r",
        columns === 4 && "lg:grid-cols-4 lg:[&>*:not(:last-child)]:border-r lg:[&>*:last-child]:border-r-0",
        columns === 3 && "lg:grid-cols-3 lg:[&>*:not(:last-child)]:border-r lg:[&>*:last-child]:border-r-0",
        bordered ? "rounded-card border border-border bg-card" : "border-b border-border",
      )}
    >
      {children}
    </div>
  );
}

export function MetricStripSkeleton({ count = 4, bordered = false }: { count?: 2 | 3 | 4; bordered?: boolean }) {
  return (
    <MetricStrip columns={count} bordered={bordered}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
      ))}
    </MetricStrip>
  );
}
