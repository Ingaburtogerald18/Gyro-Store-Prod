// Pestaña "Variables" de Configuración: parámetros financieros (tasa, pozos,
// escalas de costo/margen/comisión, mayoreo). Extraída de admin.configuracion.tsx.
// Carga y guarda contra /api/admin/config/financial con fallback a /api/admin/config.
import { HugeIcon } from "~/components/ui/icon";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { financialConfigSchema, type FinancialConfig } from "@shared/schemas";
import { BrandLoader } from "~/components/ui/module-loader";
import { QueryState } from "~/components/ui/QueryState";
import { Section } from "./Section";
import { useConfigSection } from "./useConfigSection";

// Las llaves de `pozos` son fijas (`pozosSchema`): se listan acá para que el
// formulario tipe cada campo en vez de recorrer el objeto con `any`.
const POZO_KEYS = [
  'publicidad',
  'mantenimiento',
  'utiles',
  'garantias',
  'prestamos',
  'suscripciones',
  'servicios',
] as const;

// El techo de un tramo admite "sin techo" (null → placeholder «Infinito»), así
// que no puede ir por `register` con `valueAsNumber` (un campo vacío daría NaN,
// no null). Es el único campo de las escalas que necesita Controller.
function CeilingField({
  control,
  name,
  id,
  label,
  error,
}: {
  control: Control<FinancialConfig>;
  name: FieldPath<FinancialConfig>;
  id: string;
  label: string;
  error?: { message?: string };
}) {
  return (
    <Field className="flex-1" data-invalid={!!error}>
      <FieldLabel htmlFor={id} className="text-xs">{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            id={id}
            type="number"
            placeholder="Sin límite"
            aria-invalid={!!error}
            value={field.value === null || field.value === undefined ? '' : String(field.value)}
            onBlur={field.onBlur}
            onChange={(e) => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          />
        )}
      />
      <FieldError errors={[error]} />
    </Field>
  );
}

export function FinanzasConfig() {
  // El GET va a la RAÍZ del router, no a `/financial`: ese endpoint de lectura
  // NUNCA existió (adminConfig.ts expone `GET /` y `PUT /financial`). El código
  // anterior pedía `/financial`, se comía un 404 en cada apertura de la pestaña,
  // y recién el "fallback" traía los datos — o sea que el fallback era el camino
  // real y el primer request, puro desperdicio.
  const { form, loading, loadError, submit, retry } = useConfigSection<FinancialConfig>({
    loadUrl: '/api/admin/config',
    saveUrl: '/api/admin/config/financial',
    resolver: zodResolver(financialConfigSchema) as any,
    defaultValues: {} as any,
    successMessage: 'Configuración guardada correctamente.',
    loadErrorMessage: 'No se pudo cargar la configuración financiera.',
    saveErrorMessage: 'No se pudo guardar la configuración.',
  });

  const {
    control,
    register,
    formState: { errors, isSubmitting },
  } = form;

  const costoFUScale = useFieldArray({ control, name: 'costoFUScale' });
  const marginScale = useFieldArray({ control, name: 'marginScale' });
  const commissionScale = useFieldArray({ control, name: 'commissionScale' });
  const wholesaleDiscounts = useFieldArray({ control, name: 'wholesaleDiscounts' });

  // La suma de los pozos la exige `financialConfigSchema.refine` con
  // `path: ['pozos']`: el error sale en la sección de Pozos, no como excepción.

  // Mientras no llegue la config no hay formulario que mostrar: la sección
  // entera se resuelve por QueryState.
  if (loading || loadError) {
    return (
      <QueryState
        loading={loading}
        error={!!loadError}
        errorMessage={loadError}
        onRetry={retry}
        loadingFallback={<div className="flex h-40 items-center justify-center"><BrandLoader text="Cargando configuración..." /></div>}
      >
        {null}
      </QueryState>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-8">

        <Section title="Configuración general" description="Parámetros base que aplican a todos los módulos.">
          <div className="space-y-4">
            <Field data-invalid={!!errors.exchangeRate}>
              <FieldLabel htmlFor="cfg-exchange-rate" required>Tasa de cambio (C$ por USD)</FieldLabel>
              <Input
                id="cfg-exchange-rate"
                type="number" step="0.01"
                className="max-w-xs"
                aria-required
                aria-invalid={!!errors.exchangeRate}
                {...register('exchangeRate', { valueAsNumber: true })}
              />
              <FieldError errors={[errors.exchangeRate]} />
            </Field>
            <Field data-invalid={!!errors.salaryPercentage}>
              <FieldLabel htmlFor="cfg-salary" required>Fondo de la empresa (%)</FieldLabel>
              <Input
                id="cfg-salary"
                type="number" step="0.01"
                className="max-w-xs"
                aria-required
                aria-invalid={!!errors.salaryPercentage}
                {...register('salaryPercentage', { valueAsNumber: true })}
              />
              <FieldDescription>Ejemplo: 0.20 para 20%</FieldDescription>
              <FieldError errors={[errors.salaryPercentage]} />
            </Field>
            <Field data-invalid={!!errors.minMarginMultiplier}>
              <FieldLabel htmlFor="cfg-min-margin" required>Margen de precio mínimo (múltiplo)</FieldLabel>
              <Input
                id="cfg-min-margin"
                type="number" step="0.01"
                className="max-w-xs"
                aria-required
                aria-invalid={!!errors.minMarginMultiplier}
                {...register('minMarginMultiplier', { valueAsNumber: true })}
              />
              <FieldDescription>Ejemplo: 1.15 significa que no se puede vender a menos del 15% sobre el costo</FieldDescription>
              <FieldError errors={[errors.minMarginMultiplier]} />
            </Field>
          </div>
        </Section>

        <Section title="Distribución de pozos" description="Los porcentajes asignados a cada fondo (deben sumar exactamente 1.00).">
          <div className="grid gap-4 md:grid-cols-3">
            {POZO_KEYS.map(key => (
              <Field key={key} data-invalid={!!errors.pozos?.[key]}>
                <FieldLabel htmlFor={`cfg-pozo-${key}`} className="capitalize" required>{key}</FieldLabel>
                <Input
                  id={`cfg-pozo-${key}`}
                  type="number" step="0.01"
                  aria-required
                  aria-invalid={!!errors.pozos?.[key]}
                  {...register(`pozos.${key}`, { valueAsNumber: true })}
                />
                <FieldError errors={[errors.pozos?.[key]]} />
              </Field>
            ))}
          </div>
          {/* La regla de "deben sumar 1.00" es del objeto entero, no de un pozo:
              su error vive en la raíz de `pozos`. */}
          <FieldError className="mt-3" errors={[errors.pozos]} />
        </Section>

        <Section title="Escala de costo F/U" description="Escala escalonada por costo real (C$).">
          <div className="space-y-2">
            <FieldError errors={[errors.costoFUScale]} />
            {costoFUScale.fields.map((row, i) => (
              <div key={row.id} className="flex items-end gap-4">
                <CeilingField
                  control={control as any}
                  name={`costoFUScale.${i}.maxCost`}
                  id={`cfu-max-${row.id}`}
                  label="Costo Máximo (C$)"
                  error={errors.costoFUScale?.[i]?.maxCost}
                />
                <Field className="flex-1" data-invalid={!!errors.costoFUScale?.[i]?.amount}>
                  <FieldLabel htmlFor={`cfu-amount-${row.id}`} className="text-xs" required>Costo F/U (C$)</FieldLabel>
                  <Input
                    id={`cfu-amount-${row.id}`}
                    type="number"
                    aria-required
                    aria-invalid={!!errors.costoFUScale?.[i]?.amount}
                    {...register(`costoFUScale.${i}.amount`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.costoFUScale?.[i]?.amount]} />
                </Field>
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="Eliminar tramo"
                  className="text-destructive"
                  onClick={() => costoFUScale.remove(i)}
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="mt-4"
              onClick={() => costoFUScale.append({ maxCost: null, amount: 0 })}
            >
              Agregar tramo
            </Button>
          </div>
        </Section>

        <Section title="Escala de márgenes (PVP)" description="Márgenes de venta sugeridos según el costo final (C$).">
          <div className="space-y-2">
            <FieldError errors={[errors.marginScale]} />
            {marginScale.fields.map((row, i) => (
              <div key={row.id} className="flex items-end gap-4">
                <CeilingField
                  control={control as any}
                  name={`marginScale.${i}.maxCost`}
                  id={`mar-max-${row.id}`}
                  label="Coste Máximo (C$)"
                  error={errors.marginScale?.[i]?.maxCost}
                />
                <Field className="flex-1" data-invalid={!!errors.marginScale?.[i]?.margin}>
                  <FieldLabel htmlFor={`mar-margin-${row.id}`} className="text-xs" required>Margen (ej. 0.43)</FieldLabel>
                  <Input
                    id={`mar-margin-${row.id}`}
                    type="number" step="0.01"
                    aria-required
                    aria-invalid={!!errors.marginScale?.[i]?.margin}
                    {...register(`marginScale.${i}.margin`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.marginScale?.[i]?.margin]} />
                </Field>
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="Eliminar tramo"
                  className="text-destructive"
                  onClick={() => marginScale.remove(i)}
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="mt-4"
              onClick={() => marginScale.append({ maxCost: null, margin: 0 })}
            >
              Agregar tramo
            </Button>
          </div>
        </Section>

        <Section title="Escala de comisiones" description="Comisión del vendedor según la utilidad neta (C$).">
          <div className="space-y-2">
            <FieldError errors={[errors.commissionScale]} />
            {commissionScale.fields.map((row, i) => (
              <div key={row.id} className="flex items-end gap-4">
                <CeilingField
                  control={control as any}
                  name={`commissionScale.${i}.maxProfit`}
                  id={`com-max-${row.id}`}
                  label="Utilidad Neta Máxima (C$)"
                  error={errors.commissionScale?.[i]?.maxProfit}
                />
                <Field className="flex-1" data-invalid={!!errors.commissionScale?.[i]?.margin}>
                  <FieldLabel htmlFor={`com-margin-${row.id}`} className="text-xs" required>Comisión (ej. 0.40)</FieldLabel>
                  <Input
                    id={`com-margin-${row.id}`}
                    type="number" step="0.01"
                    aria-required
                    aria-invalid={!!errors.commissionScale?.[i]?.margin}
                    {...register(`commissionScale.${i}.margin`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.commissionScale?.[i]?.margin]} />
                </Field>
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="Eliminar tramo"
                  className="text-destructive"
                  onClick={() => commissionScale.remove(i)}
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="mt-4"
              onClick={() => commissionScale.append({ maxProfit: null, margin: 0 })}
            >
              Agregar tramo
            </Button>
          </div>
        </Section>

        <Section title="Descuentos por mayoreo (inactivo)" description="Retirado del cotizador: los descuentos por volumen ahora se dan con un código de descuento al facturar. La configuración se conserva por si se reactiva.">
          <div className="space-y-2">
            <FieldError errors={[errors.wholesaleDiscounts]} />
            {wholesaleDiscounts.fields.map((row, i) => (
              <div key={row.id} className="flex items-end gap-4">
                <Field className="flex-1" data-invalid={!!errors.wholesaleDiscounts?.[i]?.minQty}>
                  <FieldLabel htmlFor={`whs-qty-${row.id}`} className="text-xs" required>Cantidad mínima</FieldLabel>
                  <Input
                    id={`whs-qty-${row.id}`}
                    type="number"
                    aria-required
                    aria-invalid={!!errors.wholesaleDiscounts?.[i]?.minQty}
                    {...register(`wholesaleDiscounts.${i}.minQty`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.wholesaleDiscounts?.[i]?.minQty]} />
                </Field>
                <Field className="flex-1" data-invalid={!!errors.wholesaleDiscounts?.[i]?.discount}>
                  <FieldLabel htmlFor={`whs-disc-${row.id}`} className="text-xs" required>Descuento (ej. 0.15 para 15%)</FieldLabel>
                  <Input
                    id={`whs-disc-${row.id}`}
                    type="number" step="0.001"
                    aria-required
                    aria-invalid={!!errors.wholesaleDiscounts?.[i]?.discount}
                    {...register(`wholesaleDiscounts.${i}.discount`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.wholesaleDiscounts?.[i]?.discount]} />
                </Field>
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="Eliminar tramo"
                  className="text-destructive"
                  onClick={() => wholesaleDiscounts.remove(i)}
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="mt-4"
              onClick={() => wholesaleDiscounts.append({ minQty: 2, discount: 0 })}
            >
              Agregar tramo
            </Button>
          </div>
        </Section>

        <div className="sticky bottom-4 mt-8 flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="mr-2" />}
            Guardar Configuración Financiera
          </Button>
        </div>
      </form>
    </div>
  );
}
