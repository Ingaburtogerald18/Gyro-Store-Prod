// Líneas de una orden: una por variante de plantilla. Si el modelo no tiene plantilla, se crea ahí mismo.
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";

import type { AdminTemplate, Category } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { MoneyInput } from "~/components/ui/money-input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { formatUsd } from "~/lib/formatters";
import type { Purchase, PurchaseOrderLinePayload } from "~/state/api/inventory-api";
import { TemplateFormDialog } from "./template-form-dialog";
import { TemplateModelPicker } from "./template-model-picker";

export interface OrderLineState {
  key: string;
  /** Lo escrito en el buscador de plantillas. */
  templateQuery: string;
  templateId: string;
  /** Una opción por variante de la plantilla, en su orden. */
  axisValues: string[];
  /** Solo para plantillas viejas con varios productos. */
  catalogItemId: string;
  quantity: string;
  costUnit: string;
}

type LineField = "template" | "variant" | "product" | "quantity" | "costUnit";
export type OrderLineErrors = Record<string, Partial<Record<LineField, string>>>;

let lineSeq = 0;
export function emptyOrderLine(): OrderLineState {
  lineSeq += 1;
  return {
    key: `line-${Date.now()}-${lineSeq}`,
    templateQuery: "",
    templateId: "",
    axisValues: [],
    catalogItemId: "",
    quantity: "",
    costUnit: "",
  };
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

/** USD de la línea: (costo + impuesto de la orden) × cantidad. */
export function lineTotalUsd(line: OrderLineState, taxUnit: number): number {
  const qty = num(line.quantity);
  const cost = num(line.costUnit);
  return Number.isFinite(qty) && Number.isFinite(cost)
    ? qty * (cost + (Number.isFinite(taxUnit) ? taxUnit : 0))
    : 0;
}

function variantKeyOf(line: OrderLineState, template: AdminTemplate | undefined): string | null {
  if (!template) return null;
  if (template.axes.length === 0) return "";
  const values = template.axes.map((_, i) => line.axisValues[i] ?? "");
  return values.every(Boolean) ? values.join(" / ") : null;
}

export function validateOrderLines(
  lines: OrderLineState[],
  templates: AdminTemplate[],
): OrderLineErrors {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const errors: OrderLineErrors = {};
  for (const line of lines) {
    const e: OrderLineErrors[string] = {};
    const template = byId.get(line.templateId);
    if (!template) e.template = "Elegí la plantilla del modelo o creala.";
    else {
      const missing = template.axes.find((axis, i) => !line.axisValues[i]);
      if (missing) e.variant = `Elegí ${missing.label.toLowerCase()}.`;
      if (template.products.length > 1 && !line.catalogItemId)
        e.product = "Elegí a qué producto va la compra.";
    }
    const qty = num(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) e.quantity = "Escribí una cantidad mayor a 0.";
    const cost = num(line.costUnit);
    if (!Number.isFinite(cost) || cost < 0) e.costUnit = "Escribí el costo por unidad.";
    if (Object.keys(e).length) errors[line.key] = e;
  }
  return errors;
}

export function orderLinesPayload(
  lines: OrderLineState[],
  templates: AdminTemplate[],
): PurchaseOrderLinePayload[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return lines.map((line) => ({
    templateId: line.templateId,
    variantKey: variantKeyOf(line, byId.get(line.templateId)) ?? "",
    ...(line.catalogItemId ? { catalogItemId: line.catalogItemId } : {}),
    quantity: Number(line.quantity),
    costUnit: Number(line.costUnit),
  }));
}

export function OrderLinesEditor({
  lines,
  onChange,
  errors,
  templates,
  categories,
  taxUnit,
  alreadyInOrder = [],
  loading = false,
  failed = false,
  onRetry,
  disabled = false,
}: {
  lines: OrderLineState[];
  onChange: (lines: OrderLineState[]) => void;
  errors: OrderLineErrors;
  templates: AdminTemplate[];
  categories: Category[];
  /** Impuesto por unidad de la orden, para el total de cada línea. */
  taxUnit: number;
  /** Productos que la orden ya tiene, al agregarle más: se avisa si se repite uno. */
  alreadyInOrder?: Purchase[];
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState<{ lineKey: string; name: string } | null>(null);
  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const total = lines.reduce((sum, line) => sum + lineTotalUsd(line, taxUnit), 0);
  const units = lines.reduce(
    (sum, line) => sum + (Number.isInteger(num(line.quantity)) ? num(line.quantity) : 0),
    0,
  );

  const update = (key: string, patch: Partial<OrderLineState>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const remove = (key: string) => onChange(lines.filter((line) => line.key !== key));

  function duplicateOf(line: OrderLineState, index: number): string | null {
    const template = byId.get(line.templateId);
    const key = variantKeyOf(line, template);
    if (!template || key === null) return null;
    const repeated = lines.findIndex(
      (other, i) =>
        i < index && other.templateId === line.templateId && variantKeyOf(other, template) === key,
    );
    if (repeated >= 0) return `Es la misma variante que el producto ${repeated + 1}.`;
    const productIds = new Set(template.products.map((p) => p.id));
    const inOrder = alreadyInOrder.find(
      (p) => p.catalogItemId && productIds.has(p.catalogItemId) && (p.variantKey ?? "") === key,
    );
    return inOrder
      ? `Ya está en esta orden (${inOrder.code}, ${inOrder.quantity} u). Revisá que no lo cargues dos veces.`
      : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
        <OrderLineRow
          key={line.key}
          index={index}
          line={line}
          template={byId.get(line.templateId)}
          templates={templates}
          categories={categories}
          taxUnit={taxUnit}
          errors={errors[line.key] ?? {}}
          duplicate={duplicateOf(line, index)}
          canRemove={lines.length > 1}
          onChange={(patch) => update(line.key, patch)}
          onRemove={() => remove(line.key)}
          onCreateTemplate={(name) => setCreating({ lineKey: line.key, name })}
          loading={loading}
          failed={failed}
          onRetry={onRetry}
          disabled={disabled}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...lines, emptyOrderLine()])}
        >
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
          Agregar otro producto
        </Button>
        <p className="text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? "producto" : "productos"} ·{" "}
          {units.toLocaleString("es-NI")} unidades ·{" "}
          <span className="font-heading text-base font-extrabold tabular-nums text-foreground">
            {formatUsd(total)}
          </span>
        </p>
      </div>

      <TemplateFormDialog
        open={!!creating}
        onOpenChange={(open) => !open && setCreating(null)}
        template={null}
        categories={categories}
        initialName={creating?.name}
        onSaved={(template) => {
          if (creating)
            update(creating.lineKey, {
              templateQuery: template.name,
              templateId: template.id,
              axisValues: [],
              catalogItemId: "",
            });
        }}
      />
    </div>
  );
}

function OrderLineRow({
  index,
  line,
  template,
  templates,
  categories,
  taxUnit,
  errors,
  duplicate,
  canRemove,
  onChange,
  onRemove,
  onCreateTemplate,
  loading,
  failed,
  onRetry,
  disabled,
}: {
  index: number;
  line: OrderLineState;
  template: AdminTemplate | undefined;
  templates: AdminTemplate[];
  categories: Category[];
  taxUnit: number;
  errors: OrderLineErrors[string];
  duplicate: string | null;
  canRemove: boolean;
  onChange: (patch: Partial<OrderLineState>) => void;
  onRemove: () => void;
  onCreateTemplate: (name: string) => void;
  loading: boolean;
  failed: boolean;
  onRetry?: () => void;
  disabled: boolean;
}) {
  const id = line.key;
  const err = (message?: string) => [message ? { message } : undefined];

  return (
    <fieldset
      disabled={disabled}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Producto {index + 1}</span>
        {canRemove && (
          <Button
            type="button"
            variant="cancel"
            size="icon"
            aria-label={`Quitar producto ${index + 1}`}
            onClick={onRemove}
          >
            <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
          </Button>
        )}
      </div>

      <TemplateModelPicker
        id={`${id}-template`}
        templates={templates}
        categories={categories}
        query={line.templateQuery}
        selectedId={line.templateId}
        onQueryChange={(templateQuery) =>
          onChange({ templateQuery, templateId: "", axisValues: [], catalogItemId: "" })
        }
        onSelect={(selected) =>
          onChange({
            templateQuery: selected?.name ?? line.templateQuery,
            templateId: selected?.id ?? "",
            ...(selected?.id !== line.templateId ? { axisValues: [], catalogItemId: "" } : {}),
          })
        }
        onCreate={onCreateTemplate}
        error={errors.template}
        required
        loading={loading}
        failed={failed}
        onRetry={onRetry}
        disabled={disabled}
      />

      {template && (template.axes.length > 0 || template.products.length > 1) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {template.axes.map((axis, axisIndex) => (
            <Field key={axis.key} data-invalid={!!errors.variant && !line.axisValues[axisIndex]}>
              <FieldLabel htmlFor={`${id}-axis-${axisIndex}`} required>
                {axis.label}
              </FieldLabel>
              <NativeSelect
                id={`${id}-axis-${axisIndex}`}
                className="w-full"
                value={line.axisValues[axisIndex] ?? ""}
                aria-invalid={!!errors.variant && !line.axisValues[axisIndex]}
                onChange={(e) => {
                  const next = template.axes.map((_, i) => line.axisValues[i] ?? "");
                  next[axisIndex] = e.target.value;
                  onChange({ axisValues: next });
                }}
              >
                <NativeSelectOption value="" disabled>
                  Elegí {axis.label.toLowerCase()}
                </NativeSelectOption>
                {axis.options.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {option}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ))}
          {template.products.length > 1 && (
            <Field data-invalid={!!errors.product}>
              <FieldLabel htmlFor={`${id}-product`} required>
                Producto del catálogo
              </FieldLabel>
              <NativeSelect
                id={`${id}-product`}
                className="w-full"
                value={line.catalogItemId}
                aria-invalid={!!errors.product}
                onChange={(e) => onChange({ catalogItemId: e.target.value })}
              >
                <NativeSelectOption value="" disabled>
                  Elegí el producto
                </NativeSelectOption>
                {template.products.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                    {p.published ? "" : " (sin publicar)"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Plantilla vieja compartida por varios productos.</FieldDescription>
              <FieldError errors={err(errors.product)} />
            </Field>
          )}
          {errors.variant && <FieldError className="sm:col-span-3" errors={err(errors.variant)} />}
        </div>
      )}
      {duplicate && <p className="text-sm text-warning">{duplicate}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor={`${id}-qty`} required>
            Cantidad
          </FieldLabel>
          <Input
            id={`${id}-qty`}
            inputMode="numeric"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value.replace(/\D/g, "") })}
            aria-required
            aria-invalid={!!errors.quantity}
            className="tabular-nums"
          />
          <FieldError errors={err(errors.quantity)} />
        </Field>
        <Field data-invalid={!!errors.costUnit}>
          <FieldLabel htmlFor={`${id}-cost`} required>
            Costo por unidad
          </FieldLabel>
          <MoneyInput
            id={`${id}-cost`}
            value={line.costUnit}
            onChange={(costUnit) => onChange({ costUnit })}
            invalid={!!errors.costUnit}
            aria-required
          />
          <FieldError errors={err(errors.costUnit)} />
        </Field>
        <div className="flex flex-col justify-end pb-2 sm:text-right">
          <span className="text-xs text-muted-foreground">Total con impuesto</span>
          <span className="font-heading text-base font-extrabold tabular-nums text-foreground">
            {formatUsd(lineTotalUsd(line, taxUnit))}
          </span>
        </div>
      </div>
    </fieldset>
  );
}
