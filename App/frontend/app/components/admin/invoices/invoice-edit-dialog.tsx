import { FormDialogContent } from '~/components/ui/form-layout';
// Editar una factura huérfana con el MISMO formulario con que se emitió, ya
// relleno. Corregir un número sale gratis; cancelar quema un correlativo para
// siempre (el número de una factura anulada queda retirado y la secuencia no
// retrocede), así que este es el camino por defecto ante un error de mostrador.
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { useLookupInvoiceQuery, type Invoice } from '~/state/api/invoices-api';
import { lazy, Suspense } from 'react';

const InvoiceEditor = lazy(() => import('./invoice-editor').then(module => ({ default: module.InvoiceEditor })));

export function InvoiceEditDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  // El listado NO trae las líneas (sería traer los ítems de todas las facturas
  // para mostrar una tabla que no los usa). El lookup por código sí las trae,
  // que es justo lo que el formulario necesita para precargarse.
  const { data: full, isLoading, isError } = useLookupInvoiceQuery(invoice?.invoiceCode ?? '', {
    skip: !invoice,
  });

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent size="long">
        <DialogHeader>
          <DialogTitle>Editar {invoice?.invoiceCode}</DialogTitle>
          <DialogDescription>
            Cambiá lo que haga falta y guardá. Al terminar, reimprimí el ticket para que el papel
            coincida con el registro.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !full ? (
          <div className="flex h-40 items-center justify-center">
            {isError ? (
              <p className="text-sm text-destructive">No se pudo cargar la factura.</p>
            ) : (
              <Spinner className="size-6 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={<Spinner className="size-6 text-muted-foreground" />}>
              <InvoiceEditor invoice={full} onUpdated={onClose} onCancel={onClose} />
            </Suspense>
          </div>
        )}
      </FormDialogContent>
    </Dialog>
  );
}
