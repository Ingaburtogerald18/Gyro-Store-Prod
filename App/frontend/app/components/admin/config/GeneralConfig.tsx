// Pestaña "General" de Configuración: información del negocio (nombre, RUC,
// WhatsApp, correo, dirección) y las cuentas bancarias de la tienda.
// El valor inicial se siembra desde las env vars; una vez guardado, manda la BD.
// La carga y el guardado los hace `useConfigSection`, igual que las otras tres.
import { HugeIcon } from "~/components/ui/icon";
import { FloppyDiskIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  STORE_BANKS,
  STORE_CURRENCIES,
  businessInfoSchema,
  type BusinessInfo,
} from "@shared/schemas";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { BrandLoader } from "~/components/ui/module-loader";
import { QueryState } from "~/components/ui/QueryState";
import { Section } from "./Section";
import { useConfigSection } from "./useConfigSection";

const CURRENCY_LABELS: Record<(typeof STORE_CURRENCIES)[number], string> = {
  NIO: "Córdobas (NIO)",
  USD: "Dólares (USD)",
};

// Los `<select>` nativos de esta pestaña replican el estilo del `Input`. Se deja
// nativo a propósito (no el `Select` de Radix): dentro de un `useFieldArray`,
// `register` funciona directo y evita un `Controller` por fila.
const SELECT_CLASS =
  "flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function GeneralConfig() {
  const { form, loading, loadError, submit, retry } = useConfigSection<BusinessInfo>({
    loadUrl: "/api/admin/config/business",
    resolver: zodResolver(businessInfoSchema) as any,
    defaultValues: {
      brandName: "",
      ruc: "",
      whatsapp: "",
      contactEmail: "",
      address: "",
      locationUrl: "",
      currency: "C$",
      socialLinks: { instagram: "", facebook: "", tiktok: "" },
      bankAccounts: [],
    },
    successMessage: "Información del negocio guardada correctamente.",
    loadErrorMessage: "No se pudo cargar la información del negocio.",
    saveErrorMessage: "No se pudo guardar la información.",
  });

  const {
    control,
    register,
    formState: { errors, isSubmitting },
  } = form;

  const bankAccounts = useFieldArray({ control, name: "bankAccounts" });

  if (loading || loadError) {
    return (
      <QueryState
        loading={loading}
        error={!!loadError}
        errorMessage={loadError}
        onRetry={retry}
        loadingFallback={
          <div className="flex h-40 items-center justify-center">
            <BrandLoader text="Cargando información..." />
          </div>
        }
      >
        {null}
      </QueryState>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section
        title="Información del negocio"
        description="Datos generales de contacto y operación de la tienda. Se usan en la tienda, tickets y facturas."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.brandName}>
            <FieldLabel htmlFor="biz-brand" required>Nombre de la tienda</FieldLabel>
            <Input id="biz-brand" aria-required aria-invalid={!!errors.brandName} {...register("brandName")} />
            <FieldError errors={[errors.brandName]} />
          </Field>

          <Field data-invalid={!!errors.ruc}>
            <FieldLabel htmlFor="biz-ruc">Número RUC</FieldLabel>
            <Input id="biz-ruc" placeholder="Opcional" aria-invalid={!!errors.ruc} {...register("ruc")} />
            <FieldError errors={[errors.ruc]} />
          </Field>

          <Field data-invalid={!!errors.whatsapp}>
            <FieldLabel htmlFor="biz-whatsapp" required>Teléfono principal (WhatsApp)</FieldLabel>
            <Input id="biz-whatsapp" placeholder="50588887777" aria-required aria-invalid={!!errors.whatsapp} {...register("whatsapp")} />
            <FieldError errors={[errors.whatsapp]} />
          </Field>

          <Field data-invalid={!!errors.currency}>
            <FieldLabel htmlFor="biz-currency" required>Moneda principal</FieldLabel>
            <Input id="biz-currency" placeholder="C$" aria-required aria-invalid={!!errors.currency} {...register("currency")} />
            <FieldError errors={[errors.currency]} />
          </Field>

          <Field data-invalid={!!errors.contactEmail}>
            <FieldLabel htmlFor="biz-email">Correo de contacto</FieldLabel>
            <Input id="biz-email" type="email" placeholder="contacto@empresa.com" aria-invalid={!!errors.contactEmail} {...register("contactEmail")} />
            <FieldError errors={[errors.contactEmail]} />
          </Field>

          <Field data-invalid={!!errors.address}>
            <FieldLabel htmlFor="biz-address">Dirección física</FieldLabel>
            <Input id="biz-address" placeholder="Ciudad, país" aria-invalid={!!errors.address} {...register("address")} />
            <FieldError errors={[errors.address]} />
          </Field>

          <Field data-invalid={!!(errors as any).locationUrl}>
            <FieldLabel htmlFor="biz-location-url">Enlace de ubicación (Google Maps)</FieldLabel>
            <Input id="biz-location-url" type="url" placeholder="https://maps.google.com/..." aria-invalid={!!(errors as any).locationUrl} {...register("locationUrl")} />
            <FieldError errors={[(errors as any).locationUrl]} />
          </Field>
        </div>
      </Section>

      <Section
        title="Redes sociales"
        description="Links a las redes sociales de la tienda. Se muestran en el pie de página del catálogo."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="social-ig">Instagram</FieldLabel>
            <Input id="social-ig" placeholder="https://instagram.com/tu_tienda" {...register("socialLinks.instagram")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="social-fb">Facebook</FieldLabel>
            <Input id="social-fb" placeholder="https://facebook.com/tu_tienda" {...register("socialLinks.facebook")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="social-tt">TikTok</FieldLabel>
            <Input id="social-tt" placeholder="https://tiktok.com/@tu_tienda" {...register("socialLinks.tiktok")} />
          </Field>
        </div>
      </Section>

      <Section
        title="Cuentas bancarias de la tienda"
        description="Dónde pueden depositar o transferir los clientes. Se muestran en la página de Contacto de la tienda, con botón para copiar el número."
      >
        <div className="space-y-4">
          <FieldError errors={[errors.bankAccounts as any]} />

          {bankAccounts.fields.map((row, index) => (
            <div
              key={row.id}
              className="flex flex-col items-start gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 sm:flex-row sm:items-end"
            >
              <div className="grid w-full flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field data-invalid={!!errors.bankAccounts?.[index]?.bank}>
                  <FieldLabel htmlFor={`bank-${row.id}`} required>Banco</FieldLabel>
                  <select id={`bank-${row.id}`} className={SELECT_CLASS} {...register(`bankAccounts.${index}.bank`)}>
                    <option value="">Seleccioná un banco</option>
                    {STORE_BANKS.map((bank) => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                  <FieldError errors={[errors.bankAccounts?.[index]?.bank]} />
                </Field>

                <Field data-invalid={!!errors.bankAccounts?.[index]?.currency}>
                  <FieldLabel htmlFor={`currency-${row.id}`} required>Moneda</FieldLabel>
                  <select id={`currency-${row.id}`} className={SELECT_CLASS} {...register(`bankAccounts.${index}.currency`)}>
                    {STORE_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>{CURRENCY_LABELS[currency]}</option>
                    ))}
                  </select>
                  <FieldError errors={[errors.bankAccounts?.[index]?.currency]} />
                </Field>

                <Field data-invalid={!!errors.bankAccounts?.[index]?.number}>
                  <FieldLabel htmlFor={`number-${row.id}`} required>Número de cuenta</FieldLabel>
                  <Input id={`number-${row.id}`} aria-required aria-invalid={!!errors.bankAccounts?.[index]?.number} {...register(`bankAccounts.${index}.number`)} />
                  <FieldError errors={[errors.bankAccounts?.[index]?.number]} />
                </Field>

                <Field data-invalid={!!errors.bankAccounts?.[index]?.holder}>
                  <FieldLabel htmlFor={`holder-${row.id}`}>Titular (opcional)</FieldLabel>
                  <Input id={`holder-${row.id}`} aria-invalid={!!errors.bankAccounts?.[index]?.holder} {...register(`bankAccounts.${index}.holder`)} />
                  <FieldError errors={[errors.bankAccounts?.[index]?.holder]} />
                </Field>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Eliminar la cuenta ${index + 1}`}
                className="shrink-0 self-end text-destructive sm:mb-2"
                onClick={() => bankAccounts.remove(index)}
              >
                <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
              </Button>
            </div>
          ))}

          {/* `bank: ''` es el estado "sin elegir" que admite el schema: la fila
              nace vacía con el placeholder puesto, y el superRefine la rechaza al
              guardar si nadie eligió. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => bankAccounts.append({ bank: "", currency: "NIO", number: "", holder: "" })}
          >
            Agregar cuenta bancaria
          </Button>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="">
          {isSubmitting ? (
            <Spinner className="mr-2" />
          ) : (
            <HugeIcon icon={FloppyDiskIcon} size={16} strokeWidth={2} className="mr-2" />
          )}
          Guardar General
        </Button>
      </div>
    </form>
  );
}
