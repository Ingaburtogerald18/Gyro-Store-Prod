// Badge de estado canónico: punto con glow (bg-current hereda el color del
// texto) + etiqueta en mayúsculas. Un solo lugar define los tonos semánticos
// para que "Activo/Pendiente/Anulado" se vea idéntico en todo el admin.
import { cn } from "~/lib/utils";

export type BadgeStatus = "success" | "pending" | "error" | "info" | "neutral" | "whatsapp";

const VARIANTS: Record<BadgeStatus, string> = {
  success: "border-primary/20 bg-primary/10 text-primary-2",
  pending: "border-warning/20 bg-warning/10 text-warning",
  error: "border-destructive/20 bg-destructive/10 text-destructive",
  info: "border-info/20 bg-info/10 text-info",
  neutral: "border bg-muted text-muted-foreground",
  whatsapp: "border-whatsapp/20 bg-whatsapp/10 text-whatsapp",
};

/* Glow de contenedor (neón suave) por variante — se activa con `glow`. */
const GLOWS: Partial<Record<BadgeStatus, string>> = {
  success: "glow-emerald",
  pending: "glow-amber",
  error: "glow-rose",
  whatsapp: "glow-whatsapp",
};

export function StatusBadge({
  status,
  label,
  pulse = false,
  glow = false,
  className,
}: {
  status: BadgeStatus;
  label: React.ReactNode;
  /** Anima el punto (estados que esperan acción, ej. "pendiente"). */
  pulse?: boolean;
  /** Halo neón alrededor del badge (listas donde el estado es protagonista). */
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      data-badge={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        VARIANTS[status],
        glow && GLOWS[status],
        className,
      )}
    >
      <span
        className={cn(
          // El glow del punto solo aplica en oscuro; en claro degrada a un
          // punto sólido nítido (ver override [data-theme="light"] en la CSS).
          "size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]",
          pulse && "animate-badge-pulse",
        )}
      />
      {label}
    </span>
  );
}
