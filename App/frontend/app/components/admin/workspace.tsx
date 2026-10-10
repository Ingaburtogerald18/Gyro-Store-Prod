// Piezas comunes de cada módulo del panel: bloques sueltos sobre el crema.
//
//   <PageHeader>          título + acción principal con su atajo
//   <Workspace>           columna de bloques
//     <WorkspaceToolbar>  vista, búsqueda, filtros
//     <MetricStrip>       hasta 4 números
//     tabla / contenido
import { useEffect, useRef, type ReactNode } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "~/components/ui/button";
import { HugeIcon } from "~/components/ui/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Toolbar } from "~/components/ui/toolbar";
import { cn } from "~/lib/utils";

/** Alto y borde comunes de los controles de la barra. */
export const TOOLBAR_CONTROL = "h-11 rounded-xl border border-input bg-card text-sm transition-colors hover:border-primary-2";

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
    <kbd className={cn("rounded-sm border border-current/40 px-1 font-spec text-2xs opacity-80", className)}>
      {children}
    </kbd>
  );
}

export function Workspace({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-5", className)}>{children}</section>;
}

export function WorkspaceToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <Toolbar className={className}>{children}</Toolbar>;
}

/** Elegir vista ("Compras | Stock actual"): botones con borde, el elegido marcado. */
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
    <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-2">
      {options.map((o) => (
        <Button key={o.value} type="button" variant="outline" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
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
      <kbd className="hidden rounded-sm border border-border px-1.5 font-spec text-2xs text-muted-foreground md:inline">/</kbd>
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
      <SelectContent className="rounded-xl">
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
      <span className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {sub && <span className="truncate text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

/** Franja de métricas: una tarjeta con divisores verticales. */
export function MetricStrip({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 [&>*]:border-border [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0",
        columns === 4 && "lg:grid-cols-4 lg:[&>*:not(:last-child)]:border-r lg:[&>*:last-child]:border-r-0",
        columns === 3 && "lg:grid-cols-3 lg:[&>*:not(:last-child)]:border-r lg:[&>*:last-child]:border-r-0",
        "overflow-clip rounded-2xl border border-border bg-card",
      )}
    >
      {children}
    </div>
  );
}

export function MetricStripSkeleton({ count = 4 }: { count?: 2 | 3 | 4 }) {
  return (
    <MetricStrip columns={count}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-7 w-28 rounded-xl" />
          <Skeleton className="h-3 w-20 rounded-sm" />
        </div>
      ))}
    </MetricStrip>
  );
}
