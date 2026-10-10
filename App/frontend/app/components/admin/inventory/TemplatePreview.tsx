import { useWatch, type Control } from "react-hook-form";
import type { z } from "zod";

import { templateInputSchema, type Category } from "@shared/schemas";
import { Chip } from "~/components/ui/chip";

export function TemplatePreview({
  control,
  categories,
}: {
  control: Control<z.input<typeof templateInputSchema>>;
  categories: Category[];
}) {
  const [name, categoryId, description, axes, specs] = useWatch({
    control,
    name: ["name", "categoryId", "description", "axes", "specs"],
  });
  const category = categories.find((item) => item.id === categoryId);
  const visibleAxes = (axes ?? []).filter((axis) => axis.label.trim());
  const visibleSpecs = (specs ?? []).filter(
    (spec) => spec.label.trim() && spec.value.trim()
  );

  return (
    <aside
      aria-label="Vista previa pública"
      className="min-w-0 self-start rounded-2xl border bg-card lg:sticky lg:top-0 lg:max-h-[calc(90vh-14rem)] lg:overflow-y-auto"
    >
      <div className="border-b p-5">
        <h3 className="font-semibold">Vista previa pública</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Contenido del modelo en el catálogo.
        </p>
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-3">
          {category ? (
            <Chip
              variant="category"
              className="max-w-full whitespace-normal break-words"
            >
              {category.name}
            </Chip>
          ) : (
            <p className="text-xs text-muted-foreground">Sin categoría</p>
          )}
          <h4 className="break-words text-lg font-semibold">
            {name?.trim() || "Nombre del modelo"}
          </h4>
          {description?.trim() ? (
            <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
              {description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              La descripción se verá aquí.
            </p>
          )}
        </div>
        {visibleAxes.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-xs font-semibold">Opciones del modelo</h4>
            <dl className="space-y-3 text-sm">
              {visibleAxes.map((axis) => (
                <div key={axis.key} className="space-y-1 break-words">
                  <dt className="font-semibold">{axis.label}</dt>
                  <dd className="text-muted-foreground">
                    {axis.options
                      .filter((option) => option.trim())
                      .join(" · ") || "Agregá las opciones"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {visibleSpecs.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-xs font-semibold">Ficha técnica</h4>
            <dl className="divide-y divide-border text-sm">
              {visibleSpecs.map((spec, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <dt className="break-words text-muted-foreground">
                    {spec.label}
                  </dt>
                  <dd className="break-words">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <p className="border-t px-5 py-4 text-xs text-muted-foreground">
        Las notas internas no aparecen en la tienda.
      </p>
    </aside>
  );
}
