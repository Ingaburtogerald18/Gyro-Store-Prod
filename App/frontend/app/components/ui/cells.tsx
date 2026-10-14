// Celdas canónicas para DataTable: UN solo estilo de dinero/código en todo el
// admin. Dinero = sans con tabular-nums (clase `nums`); font-mono queda
// reservado para códigos de producto.
import { cn } from "~/lib/utils";
import { formatCordobas, formatUsd } from "~/lib/formatters";

type MoneyTone = "default" | "muted" | "strong" | "pos" | "neg";

const MONEY_TONE: Record<MoneyTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  strong: "font-semibold text-foreground",
  pos: "font-semibold text-primary-2",
  neg: "font-semibold text-destructive",
};

/** Monto en córdobas. `negative` antepone el signo − (deducciones). */
export function MoneyCell({
  value,
  tone = "default",
  negative = false,
  currency = "nio",
}: {
  value?: number | null;
  tone?: MoneyTone;
  negative?: boolean;
  currency?: "nio" | "usd";
}) {
  if (value === undefined || value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("nums", MONEY_TONE[tone])}>
      {negative ? "−" : ""}
      {currency === "usd" ? formatUsd(value) : formatCordobas(value)}
    </span>
  );
}

/** Código de producto: mono y en tinta, se lee como un dato más. */
export function CodeCell({ value }: { value?: string | null }) {
  return <span className="font-spec text-sm font-medium whitespace-nowrap text-foreground">{value || "—"}</span>;
}
