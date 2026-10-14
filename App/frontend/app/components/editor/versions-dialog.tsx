// Últimas 5 publicaciones de la tienda: quién, cuándo y qué cambió. Restaurar
// pone esa versión en la tienda y lo publicado queda como borrador.
import { useState } from 'react';
import type { StoreVersion } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { serverErrorMessage } from '~/components/ui/form-feedback';
import { Skeleton } from '~/components/ui/skeleton';
import { formatNicaraguaDateTime } from '~/lib/formatters';
import { useGetStoreVersionsQuery } from '~/state/api/store-editor-api';

export function VersionsDialog({
  open,
  onOpenChange,
  dirty,
  restoring,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hay un borrador sin publicar: restaurar lo descarta. */
  dirty: boolean;
  restoring: boolean;
  onRestore: (version: StoreVersion) => void;
}) {
  const [confirm, setConfirm] = useState<StoreVersion | null>(null);
  const when = confirm ? formatNicaraguaDateTime(confirm.publishedAt) : '';

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !restoring && onOpenChange(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Versiones de la tienda</DialogTitle>
            <DialogDescription>
              Las últimas 5 publicaciones. Restaurar vuelve a poner la portada, las fotos, lo que se
              muestra y el orden; precio, stock y plantillas siguen como están.
            </DialogDescription>
          </DialogHeader>
          {open && <VersionList restoring={restoring} onPick={setConfirm} />}
          <DialogFooter>
            <Button variant="cancel" disabled={restoring} onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        variant={dirty ? 'destructive' : 'default'}
        title={dirty ? 'Tenés cambios sin publicar' : `¿Restaurar la versión del ${when}?`}
        description={
          dirty
            ? `¿Descartarlos y restaurar la versión del ${when}? La tienda vuelve a como estaba y lo que está publicado ahora queda como borrador.`
            : 'La tienda vuelve a como estaba entonces. Lo que está publicado ahora queda como borrador para corregirlo.'
        }
        confirmText={dirty ? 'Descartar y restaurar' : 'Restaurar'}
        cancelText="Cancelar"
        onConfirm={() => confirm && onRestore(confirm)}
      />
    </>
  );
}

function VersionList({ restoring, onPick }: { restoring: boolean; onPick: (version: StoreVersion) => void }) {
  const { data: versions, isLoading, isError, error, refetch } = useGetStoreVersionsQuery();

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Cargando versiones" className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm">{serverErrorMessage(error, 'No se pudieron cargar las versiones.')}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!versions?.length) {
    return <p className="text-sm">Todavía no hay versiones: se guarda una cada vez que publicás.</p>;
  }
  return (
    <ul className="max-h-[60dvh] space-y-3 overflow-y-auto">
      {versions.map((version) => (
        <li key={version.id} className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">
              {formatNicaraguaDateTime(version.publishedAt)}
              {version.publishedBy && <span className="font-normal text-muted-foreground"> · {version.publishedBy}</span>}
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {version.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {version.current ? (
            <Chip variant="status" tone="success" className="shrink-0">
              En la tienda
            </Chip>
          ) : (
            <Button variant="outline" className="shrink-0" disabled={restoring} onClick={() => onPick(version)}>
              {restoring ? 'Restaurando…' : 'Restaurar'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
