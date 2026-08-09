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

/** Código de producto (mono, discreto). */
export function CodeCell({ value }: { value?: string | null }) {
  return <span className="font-mono font-normal text-sm text-foreground">{value || "—"}</span>;
}

/** 
 * Celda que muestra un desglose por ítem.
 * Se usa para alinear las columnas de Cant. y Precio Venta con los ítems separados.
 */
export function BreakdownCell({
  items,
  itemKey,
  tone = "default",
  isQuantity = false,
}: {
  items: any[];
  itemKey?: string;
  tone?: MoneyTone;
  isQuantity?: boolean;
}) {
  if (items.length <= 1) {
    const val = items[0] ? (itemKey ? items[0][itemKey] : undefined) : undefined;
    if (isQuantity) return <span className="nums">{items[0]?.quantity || 1}</span>;
    return <MoneyCell value={val} tone={tone} />;
  }

  return (
    <div className="flex flex-col gap-[2px]">
      {items.map((it, idx) => {
        const val = itemKey ? it[itemKey] : undefined;
        if (isQuantity) {
          return <div key={idx}><span className="nums">{it.quantity || 1}</span></div>;
        }
        return <div key={idx}><MoneyCell value={val} tone={tone} /></div>;
      })}
    </div>
  );
}
