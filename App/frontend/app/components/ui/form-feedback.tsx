// Piezas de DESIGN.md §7: el error del servidor va arriba del formulario y
// cerrar con cambios sin guardar pregunta antes de descartarlos.
import { Alert02Icon } from "@hugeicons/core-free-icons";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { HugeIcon } from "~/components/ui/icon";

/** Mensaje que manda el servidor en `{ error }` (o el de una subida fallida), o el de respaldo. */
export function serverErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { data?: { error?: unknown } })?.data?.error ?? (err instanceof Error ? err.message : undefined);
  return typeof message === "string" && message ? message : fallback;
}

/** Errores de react-hook-form de un grupo de campos, como `{ campo: mensaje }`. */
export function fieldMessages(node: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!node || typeof node !== "object") return out;
  for (const [field, value] of Object.entries(node)) {
    const message = (value as { message?: unknown } | undefined)?.message;
    if (typeof message === "string") out[field] = message;
  }
  return out;
}

export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground">
      <HugeIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-destructive" />
      <span>{message}</span>
    </div>
  );
}

export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Descartar los cambios?"
      description="Lo que escribiste en este formulario se pierde."
      confirmText="Descartar cambios"
      cancelText="Seguir editando"
      onConfirm={onDiscard}
    />
  );
}
