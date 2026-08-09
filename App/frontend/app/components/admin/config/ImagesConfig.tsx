// Pestaña "Recursos" de Configuración: subida de logos/favicon a R2 (extraída de
// admin.configuracion.tsx). Maneja su propia carga/guardado contra
// /api/admin/config/images y limpia los uploads huérfanos de la sesión.
import { HugeIcon } from "~/components/ui/icon";
import { Cancel01Icon, CloudUploadIcon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { queueFile, processPendingUploads } from "~/lib/uploadQueue";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { imageResourcesSchema, type ImageResources } from "@shared/schemas";
import { BrandLoader } from "~/components/ui/module-loader";
import { QueryState } from "~/components/ui/QueryState";
import { Section } from "./Section";
import { useConfigSection } from "./useConfigSection";

const EMPTY_IMAGES: ImageResources = {
  logoStatic: '',
  logoAnimated: '',
  favicon: '',
  posLogo: '',
};

export function ImagesConfig() {
  const [uploading, setUploading] = useState(false);

  const { form, loading, loadError, submit, retry } = useConfigSection<ImageResources>({
    loadUrl: '/api/admin/config/images',
    resolver: zodResolver(imageResourcesSchema),
    defaultValues: EMPTY_IMAGES,
    // El backend devuelve `null` en las que no están cargadas, y un `null` en un
    // <input> lo vuelve no-controlado (React protesta y el campo deja de
    // responder). Se normalizan a cadena vacía.
    normalize: (raw: Partial<ImageResources> | null) => ({
      logoStatic: raw?.logoStatic || '',
      logoAnimated: raw?.logoAnimated || '',
      favicon: raw?.favicon || '',
      posLogo: raw?.posLogo || '',
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
    getValues,
    formState: { errors, isSubmitting },
  } = form;

  const config = watch();

  const uploadFile = async (file: File, key: keyof ImageResources) => {
    try {
      const tempUrl = queueFile(file);
      setValue(key, tempUrl, { shouldDirty: true });
    } catch (err: any) {
      toast.error(err.message || 'Error al encolar la imagen');
    }
  };

  const renderUploadBox = (title: string, desc: string, key: keyof ImageResources) => {
    const isAnimated = key === 'logoAnimated';
    const acceptAttr = isAnimated ? "image/*,video/*" : "image/*";

    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-muted p-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        {config[key] ? (
          <div className="relative group rounded-lg border bg-card p-2">
            <div className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-md bg-black/20">
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
          <label className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card transition-colors hover:border-primary hover:bg-primary/5">
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
            placeholder="O ingresa la URL de la imagen"
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
      title="Recursos de Imágenes"
      description="Sube los logos y favicons que se utilizarán en la interfaz y en los tickets generados."
    >
      <QueryState
        loading={loading}
        error={!!loadError}
        errorMessage={loadError}
        onRetry={retry}
        loadingFallback={<div className="flex py-12 justify-center"><BrandLoader text="Cargando recursos..." /></div>}
      >
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {renderUploadBox("Logo estático", "Cabeceras y web. Recomendado: 512x512px (PNG transparente)", "logoStatic")}
          {renderUploadBox("Logo animado", "Animación principal. Recomendado: 512x512px (WebM/GIF)", "logoAnimated")}
          {renderUploadBox("Favicon", "Ícono de la pestaña. Recomendado: 32x32px o 64x64px (PNG/ICO)", "favicon")}
          {renderUploadBox("Logo del ticket", "Impresoras térmicas. Recomendado: 300x300px o similar (Blanco y Negro puro)", "posLogo")}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting || uploading}>
            {isSubmitting ? (
              <Spinner className="mr-2" />
            ) : (
              <HugeIcon icon={FloppyDiskIcon} size={16} strokeWidth={2} className="mr-2" />
            )}
            Guardar Imágenes
          </Button>
        </div>
      </form>
      </QueryState>
    </Section>
  );
}
