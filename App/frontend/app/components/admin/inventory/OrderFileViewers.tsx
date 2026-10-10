// Factura y fotos del empaque de una orden, vistas dentro del panel. Los archivos
// pasan por el servidor (la ruta pide sesión), así que se muestran desde un blob:.
import { ArrowLeft01Icon, ArrowRight01Icon, Download01Icon, Share01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { HugeIcon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import {
  canSharePhotoFiles,
  fetchInvoiceFile,
  fetchOrderPhotos,
  saveFiles,
  shareFiles,
} from "~/lib/purchaseOrderPhotos";
import type { PurchaseInvoice, PurchaseOrder } from "~/store/api/inventoryV1Api";

interface LoadedFile {
  file: File;
  url: string;
}

/** Baja los archivos una sola vez al abrir y libera los blob: al cerrar. */
function useLoadedFiles(open: boolean, load: () => Promise<File[]>) {
  const [files, setFiles] = useState<LoadedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let loaded: LoadedFile[] = [];
    setFiles(null);
    setError(null);
    load()
      .then((list) => {
        loaded = list.map((file) => ({ file, url: URL.createObjectURL(file) }));
        if (cancelled) loaded.forEach((f) => URL.revokeObjectURL(f.url));
        else setFiles(loaded);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "No se pudo bajar el archivo.");
      });
    return () => {
      cancelled = true;
      loaded.forEach((f) => URL.revokeObjectURL(f.url));
    };
    // `load` cambia en cada render; lo que dispara la carga es abrir o reintentar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  return { files, error, retry: () => setAttempt((n) => n + 1) };
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center">
      <p className="text-sm text-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

export function InvoiceViewerDialog({
  invoice,
  onOpenChange,
}: {
  invoice: PurchaseInvoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!invoice;
  const { files, error, retry } = useLoadedFiles(open, async () => (invoice ? [await fetchInvoiceFile(invoice.id)] : []));
  const current = files?.[0];
  const isImage = current?.file.type.startsWith("image/");
  const title = invoice?.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : "Factura";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-full flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {error ? (
            <LoadError message={error} onRetry={retry} />
          ) : !current ? (
            <Skeleton className="h-full w-full rounded-2xl" />
          ) : isImage ? (
            <img src={current.url} alt={title} className="h-full w-full rounded-2xl border bg-card object-contain" />
          ) : (
            <iframe src={current.url} title={title} className="h-full w-full rounded-2xl border bg-card" />
          )}
        </div>
        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button disabled={!current} onClick={() => current && saveFiles([current.file])}>
            <HugeIcon icon={Download01Icon} size={16} strokeWidth={2} aria-hidden />
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PackagePhotosDialog({
  order,
  onOpenChange,
}: {
  order: PurchaseOrder | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!order;
  const count = order?.packagePhotos.length ?? 0;
  const { files, error, retry } = useLoadedFiles(open, () =>
    order ? fetchOrderPhotos(order.id, order.orderNumber, count) : Promise.resolve([]),
  );
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, order?.id]);

  const go = useCallback(
    (delta: number) => setIndex((i) => (count ? (i + delta + count) % count : 0)),
    [count],
  );

  async function handleShare() {
    if (!files || !order) return;
    setSharing(true);
    try {
      const result = await shareFiles(files.map((f) => f.file), `Orden ${order.orderNumber}`);
      if (result === "downloaded") toast.success("Fotos descargadas.");
    } catch (err) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if ((err as Error)?.name !== "AbortError") toast.error("No se pudieron compartir las fotos.");
    } finally {
      setSharing(false);
    }
  }

  const current = files?.[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-full flex-col sm:max-w-5xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        <DialogHeader>
          <DialogTitle>Fotos del empaque · Orden {order?.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="relative min-h-0 flex-1">
          {error ? (
            <LoadError message={error} onRetry={retry} />
          ) : !current ? (
            <Skeleton className="h-full w-full rounded-2xl" />
          ) : (
            <>
              <img
                src={current.url}
                alt={`Foto ${index + 1} de ${count} del empaque`}
                className="h-full w-full rounded-2xl border bg-card object-contain"
              />
              {count > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-1/2 left-3 -translate-y-1/2"
                    onClick={() => go(-1)}
                  >
                    <HugeIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} aria-hidden />
                    <span className="sr-only">Foto anterior</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-1/2 right-3 -translate-y-1/2"
                    onClick={() => go(1)}
                  >
                    <HugeIcon icon={ArrowRight01Icon} size={20} strokeWidth={2} aria-hidden />
                    <span className="sr-only">Foto siguiente</span>
                  </Button>
                </>
              )}
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl border bg-card px-3 py-1 text-xs tabular-nums text-muted-foreground">
                {index + 1} de {count}
              </p>
            </>
          )}
        </div>
        {files && files.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f, i) => (
              <button
                key={f.url}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                aria-label={`Ver foto ${i + 1}`}
                className={cn(
                  "size-16 shrink-0 overflow-hidden rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === index && "border-2 border-primary-2",
                )}
              >
                <img src={f.url} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {canSharePhotoFiles() && (
            <Button variant="outline" disabled={!files || sharing} onClick={handleShare}>
              <HugeIcon icon={Share01Icon} size={16} strokeWidth={2} aria-hidden />
              {sharing ? "Compartiendo…" : "Compartir"}
            </Button>
          )}
          <Button disabled={!files} onClick={() => files && saveFiles(files.map((f) => f.file))}>
            <HugeIcon icon={Download01Icon} size={16} strokeWidth={2} aria-hidden />
            Descargar todas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
