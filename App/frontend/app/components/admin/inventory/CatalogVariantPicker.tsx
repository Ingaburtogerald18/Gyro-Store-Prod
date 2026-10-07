// Elegir a qué producto y variante del catálogo pertenece una compra.
//
// ── Por qué ──
// Antes el lote solo tenía un nombre escrito a mano, y la tienda lo veía recién
// cuando alguien vinculaba su código en el editor de Catálogo: cada recompra
// quedaba invisible hasta ese paso. Con el producto y la variante elegidos acá,
// el lote nace vinculado (decisión 2026-10-07: una compra = una variante).
//
// La llave de la variante es la misma que usa Catálogo ("Negro / Con
// micrófono"), armada con las opciones que ESTE producto ofrece. Un producto sin
// ejes tiene una sola variante, de llave ''.
import { useMemo } from "react";

import type { AdminProduct } from "@shared/schemas";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { buildCombinations } from "~/components/catalog/VariantMappingTable";
import { useGetAdminCatalogQuery } from "~/store/api/catalogAdminApi";

export interface CatalogLinkValue {
  catalogItemId: string;
  variantKey: string;
}

/** Variantes que ofrece un producto (las opciones recortadas por `axisOptions`). */
export function variantKeysOf(product: AdminProduct): string[] {
  const axes = product.axes.map((axis) => ({
    ...axis,
    options: product.axisOptions?.[axis.key] ?? axis.options ?? [],
  }));
  return axes.length ? buildCombinations(axes) : [""];
}

/** "KZ EDX Pro | Negro | Con micrófono": mismo formato que usan los nombres de lote. */
export function lotNameFor(product: AdminProduct, variantKey: string): string {
  const parts = variantKey ? variantKey.split(" / ").map((p) => p.trim()).filter(Boolean) : [];
  return [product.name, ...parts].join(" | ");
}

export function CatalogVariantPicker({
  value,
  onChange,
  idPrefix,
  allowNone = true,
}: {
  value: CatalogLinkValue | null;
  /** `product` viene para que el formulario complete nombre y categoría. */
  onChange: (value: CatalogLinkValue | null, product: AdminProduct | null) => void;
  idPrefix: string;
  allowNone?: boolean;
}) {
  const { data: catalog = [], isLoading } = useGetAdminCatalogQuery();
  const products = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [catalog],
  );
  const product = value ? products.find((p) => p.id === value.catalogItemId) ?? null : null;
  const variants = product ? variantKeysOf(product) : [];
  const needsVariant = variants.length > 1 || (variants.length === 1 && variants[0] !== "");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-catalog-item`}>Producto del catálogo</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-catalog-item`}
          className="w-full"
          disabled={isLoading}
          value={value?.catalogItemId ?? ""}
          onChange={(e) => {
            const next = products.find((p) => p.id === e.target.value) ?? null;
            if (!next) return onChange(null, null);
            const keys = variantKeysOf(next);
            // Una sola variante: se elige sola.
            onChange({ catalogItemId: next.id, variantKey: keys.length === 1 ? keys[0] : "" }, next);
          }}
        >
          <NativeSelectOption value="" disabled={!allowNone}>
            {isLoading ? "Cargando catálogo…" : allowNone ? "No está en el catálogo todavía" : "Elegí un producto"}
          </NativeSelectOption>
          {products.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
              {p.published ? "" : " (sin publicar)"}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {!value && allowNone && (
          <FieldDescription>Sin producto del catálogo, la tienda no verá este lote hasta vincularlo.</FieldDescription>
        )}
      </Field>

      {product && needsVariant && (
        <Field data-invalid={!value?.variantKey}>
          <FieldLabel htmlFor={`${idPrefix}-variant`} required>
            Variante
          </FieldLabel>
          <NativeSelect
            id={`${idPrefix}-variant`}
            className="w-full"
            value={value?.variantKey ?? ""}
            aria-invalid={!value?.variantKey}
            onChange={(e) => onChange({ catalogItemId: product.id, variantKey: e.target.value }, product)}
          >
            <NativeSelectOption value="" disabled>
              Elegí la variante
            </NativeSelectOption>
            {variants.map((key) => (
              <NativeSelectOption key={key} value={key}>
                {key}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
    </div>
  );
}

/** true si el valor está completo (producto + variante cuando hace falta). */
export function isCatalogLinkComplete(value: CatalogLinkValue | null, catalog: AdminProduct[]): boolean {
  if (!value) return true;
  const product = catalog.find((p) => p.id === value.catalogItemId);
  if (!product) return false;
  const keys = variantKeysOf(product);
  return keys.includes(value.variantKey);
}
