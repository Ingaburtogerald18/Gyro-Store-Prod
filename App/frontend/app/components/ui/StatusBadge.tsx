// Estado de un registro: punto de color y texto, igual en todo el panel.
import { Chip, type ChipTone } from "~/components/ui/chip";

export type BadgeStatus = "success" | "pending" | "error" | "info" | "neutral" | "whatsapp";

const TONE: Record<BadgeStatus, ChipTone> = {
  success: "success",
  pending: "warning",
  error: "error",
  info: "info",
  neutral: "neutral",
  whatsapp: "whatsapp",
};

export function StatusBadge({ status, label, className }: { status: BadgeStatus; label: React.ReactNode; className?: string }) {
  return (
    <Chip variant="status" tone={TONE[status]} data-badge={status} className={className}>
      {label}
    </Chip>
  );
}
