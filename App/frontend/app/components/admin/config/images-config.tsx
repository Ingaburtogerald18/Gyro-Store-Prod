import { FormLayout, FormActions, FormBody } from "~/components/ui/form-layout";
// Pestaña Recursos: logos y favicon en R2. Limpia lo subido en la sesión que no se guardó.
import { HugeIcon } from "~/components/ui/icon";
import { Cancel01Icon, CloudUploadIcon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { queueFile, processPendingUploads } from "~/lib/upload-queue";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { FormErrorBanner } from "~/components/ui/form-feedback";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { imageResourcesSchema, type ImageResources } from "@shared/schemas";
import { BrandLoader } from "~/components/ui/module-loader";
import { QueryState } from "~/components/ui/query-state";
import { Section } from "./section";
import { useConfigSection } from "./use-config-section";

const EMPTY_IMAGES: ImageResources = {
  logoStatic: '',
  logoAnimated: '',
  favicon: '',
  posLogo: '',
  cartEmpty: '',
  cartBanner: '',
  orderSuccess: '',
  loginImage: '',
};

export function ImagesConfig() {
  const { form, loading, loadError, saveError, submit, retry } = useConfigSection<ImageResources>({
    loadUrl: '/api/admin/config/images',
    resolver: zodResolver(imageResourcesSchema),
    defaultValues: EMPTY_IMAGES,
    // El backend manda `null` en las vacías y un `null` vuelve el input no controlado: se pasa a ''.
    normalize: (raw: Partial<ImageResources> | null) => ({
      logoStatic: raw?.logoStatic || '',
      logoAnimated: raw?.logoAnimated || '',
      favicon: raw?.favicon || '',
      posLogo: raw?.posLogo || '',
      cartEmpty: raw?.cartEmpty || '',
      cartBanner: raw?.cartBanner || '',
      orderSuccess: raw?.orderSuccess || '',
      loginImage: raw?.loginImage || '',
    }),
    // Guardado exitoso = ya no hay huérfanos que limpiar.
    successMessage: 'Recursos guardados correctamente.',
    loadErrorMessage: 'No se pudieron cargar los recursos.',
    saveErrorMessage: 'No se pudieron guardar los recursos.',
    processBeforeSave: async (values) => await processPendingUploads(values, 'config'),
  });

  const {
    register,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const config = watch();

  const uploadFile = async (file: File, key: keyof ImageResources) => {
    try {
      const tempUrl = queueFile(file);
      setValue(key, tempUrl, { shouldDirty: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al encolar la imagen');
    }
  };

  const renderUploadBox = (title: string, desc: string, key: keyof ImageResources) => {
    const isAnimated = key === 'logoAnimated';
    const acceptAttr = isAnimated ? "image/*,video/*" : "image/*";

    return (
      <div className="flex flex-col gap-3 rounded-2xl border bg-muted p-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        {config[key] ? (
          <div className="relative group rounded-xl border bg-card p-2">
            <div className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-xl bg-black/20">
              {config[key]?.match(/\.(webm|mp4|mov)$/i) ? (
                <video src={config[key]} autoPlay loop muted playsInline className="max-h-32 max-w-full object-contain" />
              ) : (
                <img src={config[key]} alt={title} className="max-h-32 max-w-full object-contain" />
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                setValue(key, '', { shouldDirty: true });
              }}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Eliminar ${title}`}
            >
              <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <label className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card transition-colors hover:border-primary hover:bg-primary/5">
            <HugeIcon icon={CloudUploadIcon} size={32} strokeWidth={2} className="text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Subir imagen</span>
            <input
              type="file"
              className="hidden"
              accept={acceptAttr}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file, key);
              }}
            />
          </label>
        )}
        <Field data-invalid={!!errors[key]}>
          <FieldLabel htmlFor={`img-url-${key}`} className="sr-only">
            URL de {title}
          </FieldLabel>
          <Input
            id={`img-url-${key}`}
            placeholder="O pegá la URL de la imagen"
            aria-invalid={!!errors[key]}
            {...register(key)}
          />
          <FieldError errors={[errors[key]]} />
        </Field>
      </div>
    );
  };

  return (
    <Section
      title="Recursos de imágenes"
      description="Sube los logos, el favicon, el logo del ticket, la imagen del inicio de sesión y las del carrito."
    >
      <QueryState
        loading={loading}
        error={!!loadError}
        errorMessage={loadError}
        onRetry={retry}
        loadingFallback={
          <div className="flex py-12 justify-center">
            <BrandLoader text="Cargando recursos..." />
          </div>
        }
      >
        <FormLayout mode="page" onSubmit={submit}>
          <FormErrorBanner message={saveError} />
          <FormBody>
            <div className="grid gap-6 md:grid-cols-2">
              {renderUploadBox(
                "Logo estático",
                "Cabeceras y web. Recomendado: 512x512px (PNG transparente)",
                "logoStatic",
              )}
              {renderUploadBox(
                "Logo animado",
                "Animación principal. Recomendado: 512x512px (WebM/GIF)",
                "logoAnimated",
              )}
              {renderUploadBox(
                "Favicon",
                "Ícono de la pestaña. Recomendado: 32x32px o 64x64px (PNG/ICO)",
                "favicon",
              )}
              {renderUploadBox(
                "Logo del ticket",
                "Impresoras térmicas. Recomendado: 300x300px o similar (Blanco y Negro puro)",
                "posLogo",
              )}
              {renderUploadBox(
                "Inicio de sesión",
                "Ilustración del acceso de colaboradores. Vacía: se usa el logo estático. Recomendado: 600x600px (PNG sin fondo)",
                "loginImage",
              )}
            </div>

            {/* Imágenes del carrito. Qué texto las acompaña y dónde aparece cada una
                se decide en la tienda, en modo edición → "Editar carrito". */}
            <div className="space-y-1 pt-2">
              <h3 className="text-sm font-semibold">Carrito</h3>
              <p className="text-xs text-muted-foreground">
                Se eligen y combinan con sus textos desde la tienda, en modo edición → «Editar
                carrito».
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {renderUploadBox(
                "Carrito vacío",
                "Ilustración cuando no hay productos. Recomendado: 480x480px (PNG sin fondo)",
                "cartEmpty",
              )}
              {renderUploadBox(
                "Banner del carrito",
                "Promo arriba de los productos. Recomendado: 800x300px",
                "cartBanner",
              )}
              {renderUploadBox(
                "Pedido recibido",
                "Pantalla de confirmación. Recomendado: 480x480px (PNG sin fondo)",
                "orderSuccess",
              )}
            </div>
          </FormBody>

          <FormActions>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner className="mr-2" />
              ) : (
                <HugeIcon icon={FloppyDiskIcon} size={16} strokeWidth={2} className="mr-2" />
              )}
              {isSubmitting ? "Guardando…" : "Guardar imágenes"}
            </Button>
          </FormActions>
        </FormLayout>
      </QueryState>
    </Section>
  );
}
