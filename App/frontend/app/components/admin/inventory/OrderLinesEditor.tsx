// Líneas de una orden de compra: una por variante (decisión 2026-10-07: una
// compra = una variante). Cada línea elige su producto del catálogo, o escribe
// uno que todavía no está, con su categoría, cantidad, costo e impuesto.
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";

import type { AdminProduct } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { formatUsd } from "~/lib/formatters";
import { useGetCategoriesQuery } from "~/store/api/catalogAdminApi";
import type { Purchase, PurchaseOrderLinePayload } from "~/store/api/inventoryV1Api";
import { CatalogVariantPicker, isCatalogLinkComplete, lotNameFor, type CatalogLinkValue } from "./CatalogVariantPicker";

export interface OrderLineState {
  key: string;
  link: CatalogLinkValue | null;
  productName: string;
  category: string;
  quantity: string;
  costUnit: string;
  taxUnit: string;
}

export type OrderLineErrors = Record<string, Partial<Record<"link" | "productName" | "category" | "quantity" | "costUnit" | "taxUnit", string>>>;

let lineSeq = 0;
export function emptyOrderLine(): OrderLineState {
  lineSeq += 1;
  return { key: `line-${Date.now()}-${lineSeq}`, link: null, productName: "", category: "", quantity: "", costUnit: "", taxUnit: "" };
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

/** USD de la línea: (costo + impuesto) × cantidad. */
export function lineTotalUsd(line: OrderLineState): number {
  const qty = num(line.quantity);
  const cost = num(line.costUnit);
  const tax = line.taxUnit.trim() === "" ? 0 : num(line.taxUnit);
  return Number.isFinite(qty) && Number.isFinite(cost) && Number.isFinite(tax) ? qty * (cost + tax) : 0;
}

export function validateOrderLines(lines: OrderLineState[], catalog: AdminProduct[]): OrderLineErrors {
  const errors: OrderLineErrors = {};
  for (const line of lines) {
    const e: OrderLineErrors[string] = {};
    if (!isCatalogLinkComplete(line.link, catalog)) e.link = "Elegí la variante del producto.";
    if (line.productName.trim().length < 2) e.productName = "Escribí el nombre del producto.";
    if (!line.category) e.category = "Elegí la categoría.";
    const qty = num(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) e.quantity = "Cantidad mayor a 0.";
    const cost = num(line.costUnit);
    if (!Number.isFinite(cost) || cost < 0) e.costUnit = "Escribí el costo.";
    // Vacío = sin impuesto.
    const tax = line.taxUnit.trim() === "" ? 0 : num(line.taxUnit);
    if (!Number.isFinite(tax) || tax < 0) e.taxUnit = "Revisá el impuesto.";
    if (Object.keys(e).length) errors[line.key] = e;
  }
  return errors;
}

export function orderLinesPayload(lines: OrderLineState[]): PurchaseOrderLinePayload[] {
  return lines.map((line) => ({
    productName: line.productName.trim(),
    category: line.category,
    quantity: Number(line.quantity),
    costUnit: Number(line.costUnit),
    taxUnit: line.taxUnit.trim() === "" ? 0 : Number(line.taxUnit),
    ...(line.link ? { catalogItemId: line.link.catalogItemId, variantKey: line.link.variantKey } : {}),
  }));
}

export function OrderLinesEditor({
  lines,
  onChange,
  errors,
  purchases,
  alreadyInOrder = [],
}: {
  lines: OrderLineState[];
  onChange: (lines: OrderLineState[]) => void;
  errors: OrderLineErrors;
  /** Compras anteriores: sugieren nombres de productos ya comprados. */
  purchases: Purchase[];
  /**
   * Productos que la orden ya tiene, al agregarle más: como se carga de a uno,
   * se avisa si el mismo producto ya estaba (no bloquea).
   */
  alreadyInOrder?: Purchase[];
}) {
  const { data: categories = [] } = useGetCategoriesQuery();
  const productNames = useMemo(
    () => Array.from(new Set(purchases.map((p) => p.productName).filter(Boolean))) as string[],
    [purchases],
  );
  const total = lines.reduce((sum, line) => sum + lineTotalUsd(line), 0);
  const units = lines.reduce((sum, line) => sum + (Number.isInteger(num(line.quantity)) ? num(line.quantity) : 0), 0);

  const update = (key: string, patch: Partial<OrderLineState>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const remove = (key: string) => onChange(lines.filter((line) => line.key !== key));

  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <OrderLineRow
          key={line.key}
          index={index}
          line={line}
          errors={errors[line.key] ?? {}}
          categories={categories}
          productNames={productNames}
          duplicateOf={findInOrder(alreadyInOrder, line.productName)}
          canRemove={lines.length > 1}
          onChange={(patch) => update(line.key, patch)}
          onRemove={() => remove(line.key)}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...lines, emptyOrderLine()])}>
          <HugeIcon icon={Add01Icon} size={14} strokeWidth={2} aria-hidden />
          Agregar otro producto
        </Button>
        <p className="text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? "producto" : "productos"} · {units.toLocaleString("en-US")} unidades ·{" "}
          <span className="font-display text-base font-bold text-foreground">{formatUsd(total)}</span>
        </p>
      </div>
    </div>
  );
}

function findInOrder(inOrder: Purchase[], productName: string): Purchase | null {
  const name = productName.trim().toLowerCase();
  if (!name) return null;
  return inOrder.find((p) => (p.productName ?? "").trim().toLowerCase() === name) ?? null;
}

function OrderLineRow({
  index,
  line,
  errors,
  categories,
  productNames,
  duplicateOf,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: OrderLineState;
  errors: OrderLineErrors[string];
  categories: { id: string; name: string }[];
  productNames: string[];
  duplicateOf: Purchase | null;
  canRemove: boolean;
  onChange: (patch: Partial<OrderLineState>) => void;
  onRemove: () => void;
}) {
  const id = `line-${index}`;
  const err = (message?: string) => [message ? { message } : undefined];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Producto {index + 1}</span>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Quitar producto ${index + 1}`} onClick={onRemove}>
            <HugeIcon icon={Delete02Icon} size={14} strokeWidth={2} />
          </Button>
        )}
      </div>

      <CatalogVariantPicker
        idPrefix={id}
        value={line.link}
        onChange={(next, product) => {
          if (next && product) {
            onChange({
              link: next,
              productName: lotNameFor(product, next.variantKey),
              category: product.categoryId ?? line.category,
            });
          } else {
            onChange({ link: null });
          }
        }}
      />
      {errors.link && <FieldError errors={err(errors.link)} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field className="sm:col-span-2" data-invalid={!!errors.productName}>
          <FieldLabel htmlFor={`${id}-name`} required>
            Nombre del producto
          </FieldLabel>
          {line.link ? (
            <Input id={`${id}-name`} value={line.productName} disabled className="bg-muted text-muted-foreground" />
          ) : (
            <Combobox
              id={`${id}-name`}
              value={line.productName}
              onChange={(productName: string) => onChange({ productName })}
              options={productNames}
              placeholder="Escribí o elegí un producto…"
              aria-invalid={!!errors.productName}
            />
          )}
          {duplicateOf && !errors.productName && (
            <FieldDescription className="text-warning">
              Ya está en esta orden ({duplicateOf.code}, {duplicateOf.quantity} u). Revisá que no lo estés cargando dos veces.
            </FieldDescription>
          )}
          <FieldError errors={err(errors.productName)} />
        </Field>
        <Field data-invalid={!!errors.category}>
          <FieldLabel htmlFor={`${id}-category`} required>
            Categoría
          </FieldLabel>
          <NativeSelect
            id={`${id}-category`}
            className="w-full"
            value={line.category}
            onChange={(e) => onChange({ category: e.target.value })}
            aria-invalid={!!errors.category}
          >
            <NativeSelectOption value="" disabled>
              Elegí la categoría
            </NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError errors={err(errors.category)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor={`${id}-qty`} required>
            Cantidad
          </FieldLabel>
          <Input id={`${id}-qty`} type="number" min={1} value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} aria-invalid={!!errors.quantity} />
          <FieldError errors={err(errors.quantity)} />
        </Field>
        <Field data-invalid={!!errors.costUnit}>
          <FieldLabel htmlFor={`${id}-cost`} required>
            Costo unit. (USD)
          </FieldLabel>
          <Input id={`${id}-cost`} type="number" step="0.01" min={0} value={line.costUnit} onChange={(e) => onChange({ costUnit: e.target.value })} aria-invalid={!!errors.costUnit} />
          <FieldError errors={err(errors.costUnit)} />
        </Field>
        <Field data-invalid={!!errors.taxUnit}>
          <FieldLabel htmlFor={`${id}-tax`}>Imp. unit. (USD)</FieldLabel>
          <Input id={`${id}-tax`} type="number" step="0.0001" min={0} placeholder="0" value={line.taxUnit} onChange={(e) => onChange({ taxUnit: e.target.value })} aria-invalid={!!errors.taxUnit} />
          <FieldError errors={err(errors.taxUnit)} />
        </Field>
        <div className="flex flex-col justify-end pb-2 text-right">
          <span className="text-xs text-muted-foreground">Total línea</span>
          <span className="font-display text-base font-bold text-foreground">{formatUsd(lineTotalUsd(line))}</span>
        </div>
      </div>
    </div>
  );
}
