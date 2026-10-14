// Plantilla y variante de un lote ya registrado. Al guardar, el servidor busca
// (o crea, sin publicar) el producto de esa plantilla y lo vincula a la variante.
import type { AdminTemplate, Category } from "@shared/schemas";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { TemplateModelPicker } from "./template-model-picker";

export interface TemplateLinkValue {
  /** Lo escrito en el buscador de plantillas. */
  query: string;
  templateId: string;
  /** Una opción por variante de la plantilla, en su orden. */
  axisValues: string[];
  /** Solo para plantillas viejas con varios productos. */
  catalogItemId: string;
}

export const EMPTY_TEMPLATE_LINK: TemplateLinkValue = {
  query: "",
  templateId: "",
  axisValues: [],
  catalogItemId: "",
};

/** Plantilla y variante del producto al que ya está vinculado el lote. */
export function templateLinkOf(
  templates: AdminTemplate[],
  catalogItemId: string | null | undefined,
  variantKey: string | null | undefined,
): TemplateLinkValue {
  const template = catalogItemId
    ? templates.find((t) => t.products.some((p) => p.id === catalogItemId))
    : undefined;
  if (!template) return EMPTY_TEMPLATE_LINK;
  const parts = (variantKey ?? "").split(" / ").map((part) => part.trim());
  return {
    query: template.name,
    templateId: template.id,
    axisValues: template.axes.map((axis, i) =>
      axis.options.includes(parts[i] ?? "") ? parts[i] : "",
    ),
    catalogItemId: template.products.length > 1 ? catalogItemId ?? "" : "",
  };
}

/** Llave de la variante elegida, o null si falta alguna opción. */
export function templateVariantKey(
  value: TemplateLinkValue,
  template: AdminTemplate | undefined,
): string | null {
  if (!template) return null;
  const values = template.axes.map((_, i) => value.axisValues[i] ?? "");
  return values.every(Boolean) ? values.join(" / ") : null;
}

/** Qué falta elegir; null si está completo. */
export function templateLinkError(
  value: TemplateLinkValue,
  template: AdminTemplate | undefined,
): string | null {
  if (!template) return "Elegí la plantilla del modelo.";
  const missing = template.axes.find((_, i) => !value.axisValues[i]);
  if (missing) return `Elegí ${missing.label.toLowerCase()}.`;
  if (template.products.length > 1 && !value.catalogItemId)
    return "Elegí a qué producto va la compra.";
  return null;
}

export function TemplateVariantPicker({
  idPrefix,
  templates,
  value,
  onChange,
  error,
  description,
  categories = [],
  disabled = false,
}: {
  idPrefix: string;
  templates: AdminTemplate[];
  value: TemplateLinkValue;
  onChange: (value: TemplateLinkValue) => void;
  error?: string | null;
  description?: string;
  categories?: Category[];
  disabled?: boolean;
}) {
  const template = templates.find((t) => t.id === value.templateId);
  const fieldError = (show: boolean) => [show && error ? { message: error } : undefined];

  return (
    <div className="flex flex-col gap-4">
      <TemplateModelPicker
        id={`${idPrefix}-template`}
        templates={templates}
        categories={categories}
        query={value.query}
        selectedId={value.templateId}
        onQueryChange={(query) =>
          onChange({ query, templateId: "", axisValues: [], catalogItemId: "" })
        }
        onSelect={(selected) =>
          onChange(
            selected?.id === value.templateId
              ? { ...value, query: selected?.name ?? value.query }
              : {
                  query: selected?.name ?? value.query,
                  templateId: selected?.id ?? "",
                  axisValues: [],
                  catalogItemId: "",
                },
          )
        }
        error={!template ? error ?? undefined : undefined}
        description={description}
        disabled={disabled}
      />

      {template && (template.axes.length > 0 || template.products.length > 1) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {template.axes.map((axis, axisIndex) => (
            <Field key={axis.key} data-invalid={!!error && !value.axisValues[axisIndex]}>
              <FieldLabel htmlFor={`${idPrefix}-axis-${axisIndex}`} required>
                {axis.label}
              </FieldLabel>
              <NativeSelect
                id={`${idPrefix}-axis-${axisIndex}`}
                disabled={disabled}
                className="w-full"
                value={value.axisValues[axisIndex] ?? ""}
                aria-invalid={!!error && !value.axisValues[axisIndex]}
                onChange={(e) => {
                  const next = template.axes.map((_, i) => value.axisValues[i] ?? "");
                  next[axisIndex] = e.target.value;
                  onChange({ ...value, axisValues: next });
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
            <Field data-invalid={!!error && !value.catalogItemId}>
              <FieldLabel htmlFor={`${idPrefix}-product`} required>
                Producto del catálogo
              </FieldLabel>
              <NativeSelect
                id={`${idPrefix}-product`}
                disabled={disabled}
                className="w-full"
                value={value.catalogItemId}
                aria-invalid={!!error && !value.catalogItemId}
                onChange={(e) => onChange({ ...value, catalogItemId: e.target.value })}
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
            </Field>
          )}
          <FieldError className="sm:col-span-2" errors={fieldError(true)} />
        </div>
      )}
    </div>
  );
}
