// Pestaña Atención de Configuración: pagos, entregas y garantía que lee la tienda (ficha, carrito y Ayuda).
// Los resúmenes salen al guardar; la página de garantía y cambios solo cuando está publicada.
import { HugeIcon } from "~/components/ui/icon";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UseFormReturn } from "react-hook-form";
import { storePoliciesSchema, type StorePolicies } from "@shared/schemas";
import { FormLayout, FormActions, FormBody } from "~/components/ui/form-layout";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "~/components/ui/field";
import { FormErrorBanner } from "~/components/ui/form-feedback";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { BrandLoader } from "~/components/ui/module-loader";
import { QueryState } from "~/components/ui/query-state";
import { formatNicaraguaDateTime } from "~/lib/formatters";
import { Section } from "./section";
import { useConfigSection } from "./use-config-section";

type SummaryKey = "payment" | "managua" | "outside" | "pickup" | "warranty";

const SUMMARIES: { key: SummaryKey; label: string }[] = [
  { key: "payment", label: "Formas de pago" },
  { key: "managua", label: "Entrega en Managua" },
  { key: "outside", label: "Envíos al resto del país" },
  { key: "pickup", label: "Retiro" },
  { key: "warranty", label: "Garantía (resumen)" },
];

const EMPTY_SUMMARY = { title: "", text: "" };

export function AttentionConfig() {
  const { form, loading, loadError, saveError, submit, retry } = useConfigSection<StorePolicies>({
    loadUrl: "/api/admin/config/policies",
    resolver: zodResolver(storePoliciesSchema),
    defaultValues: {
      payment: EMPTY_SUMMARY,
      managua: EMPTY_SUMMARY,
      outside: EMPTY_SUMMARY,
      pickup: EMPTY_SUMMARY,
      warranty: EMPTY_SUMMARY,
      shippingNote: "",
      warrantyPage: { status: "draft", text: "", updatedAt: null },
    },
    successMessage: "Atención guardada.",
    loadErrorMessage: "No se pudo cargar la información de atención.",
    saveErrorMessage: "No se pudo guardar la información de atención.",
  });

  const {
    register,
    watch,
    formState: { errors, isSubmitting },
  } = form;
  const updatedAt = watch("warrantyPage.updatedAt");

  if (loading || loadError) {
    return (
      <QueryState
        loading={loading}
        error={!!loadError}
        errorMessage={loadError}
        onRetry={retry}
        loadingFallback={
          <div className="flex h-40 items-center justify-center">
            <BrandLoader text="Cargando atención..." />
          </div>
        }
      >
        {null}
      </QueryState>
    );
  }

  return (
    <FormLayout mode="page" onSubmit={submit}>
      <FormErrorBanner message={saveError} />
      <FormBody>
        <Section
          title="Pagos y entregas"
          description="Resúmenes cortos que se ven en la ficha del producto, el carrito y Ayuda. Al guardar, se muestran en la tienda."
        >
          <div className="space-y-5">
            {SUMMARIES.map(({ key, label }) => (
              <SummaryFields key={key} form={form} name={key} label={label} />
            ))}

            <Field data-invalid={!!errors.shippingNote}>
              <FieldLabel htmlFor="policy-shipping-note">Costo del envío</FieldLabel>
              <Textarea
                id="policy-shipping-note"
                rows={2}
                aria-invalid={!!errors.shippingNote}
                {...register("shippingNote")}
              />
              <FieldError errors={[errors.shippingNote]} />
            </Field>
          </div>
        </Section>

        <Section
          title="Página de garantía y cambios"
          description="Las condiciones completas. En borrador no se ve en la tienda ni en los buscadores; publicala cuando esté revisada."
        >
          <div className="space-y-5">
            <Field data-invalid={!!errors.warrantyPage?.status}>
              <FieldLabel htmlFor="policy-warranty-status" required>
                Estado
              </FieldLabel>
              <NativeSelect id="policy-warranty-status" className="w-full sm:w-64" {...register("warrantyPage.status")}>
                <NativeSelectOption value="draft">Borrador</NativeSelectOption>
                <NativeSelectOption value="published">Publicada</NativeSelectOption>
              </NativeSelect>
              {updatedAt && (
                <FieldDescription>Última actualización: {formatNicaraguaDateTime(updatedAt)}</FieldDescription>
              )}
            </Field>

            <Field data-invalid={!!errors.warrantyPage?.text}>
              <FieldLabel htmlFor="policy-warranty-text">Texto</FieldLabel>
              <Textarea
                id="policy-warranty-text"
                rows={10}
                aria-invalid={!!errors.warrantyPage?.text}
                {...register("warrantyPage.text")}
              />
              <FieldDescription>Un párrafo por línea en blanco. Sin datos que no estén confirmados.</FieldDescription>
              <FieldError errors={[errors.warrantyPage?.text]} />
            </Field>
          </div>
        </Section>
      </FormBody>

      <FormActions>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Spinner className="mr-2" />
          ) : (
            <HugeIcon icon={FloppyDiskIcon} size={16} strokeWidth={2} className="mr-2" />
          )}
          {isSubmitting ? "Guardando…" : "Guardar atención"}
        </Button>
      </FormActions>
    </FormLayout>
  );
}

function SummaryFields({
  form,
  name,
  label,
}: {
  form: UseFormReturn<StorePolicies>;
  name: SummaryKey;
  label: string;
}) {
  const {
    register,
    formState: { errors },
  } = form;
  const fieldErrors = errors[name];
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field data-invalid={!!fieldErrors?.title}>
          <FieldLabel htmlFor={`policy-${name}-title`} required>
            Título
          </FieldLabel>
          <Input id={`policy-${name}-title`} aria-invalid={!!fieldErrors?.title} {...register(`${name}.title`)} />
          <FieldError errors={[fieldErrors?.title]} />
        </Field>
        <Field data-invalid={!!fieldErrors?.text}>
          <FieldLabel htmlFor={`policy-${name}-text`}>Texto</FieldLabel>
          <Textarea id={`policy-${name}-text`} rows={2} aria-invalid={!!fieldErrors?.text} {...register(`${name}.text`)} />
          <FieldError errors={[fieldErrors?.text]} />
        </Field>
      </div>
    </FieldSet>
  );
}
