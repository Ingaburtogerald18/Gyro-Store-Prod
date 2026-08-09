import { useRef } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { Download04Icon, PrinterIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useGetInvoiceTicketQuery } from '~/store/api/invoicesApi';
import { Ticket } from './Ticket';

export function TicketPrintModal({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null;
  onClose: () => void;
}) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const { data: ticket, isLoading, isError } = useGetInvoiceTicketQuery(invoiceId!, {
    skip: !invoiceId,
  });

  /**
   * Aísla el ticket del resto de la página y abre el diálogo de impresión.
   *
   * Imprimir y "Descargar PDF" son EL MISMO camino: en el diálogo del navegador,
   * elegir "Guardar como PDF" produce un PDF con texto vectorial real
   * (seleccionable, nítido a cualquier zoom, unos pocos KB). Rasterizar el
   * ticket con html2canvas para armar el PDF a mano daría una imagen borrosa,
   * pesada y sin texto seleccionable — peor resultado y dos dependencias más.
   */
  const openPrintDialog = (hint?: string) => {
    if (!ticket) return;

    const style = document.createElement('style');
    style.innerHTML = `
      @page { size: 80mm auto; margin: 0; }
      @media print {
        body * {
          visibility: hidden;
        }
        #printable-ticket, #printable-ticket * {
          visibility: visible;
        }
        #printable-ticket {
          position: absolute;
          left: 0;
          top: 0;
          margin: 0;
          padding: 0;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
      }
    `;
    document.head.appendChild(style);

    // ID temporal para que el CSS de arriba pueda aislarlo.
    if (ticketRef.current) ticketRef.current.id = 'printable-ticket';

    // La limpieza va en `afterprint` y NO justo después de `window.print()`:
    // en Firefox y Safari `print()` no bloquea, así que quitar el <style> en la
    // línea siguiente lo removía ANTES de que el navegador compusiera la
    // página — y salía impresa la pantalla entera en vez del ticket.
    const cleanup = () => {
      style.remove();
      if (ticketRef.current) ticketRef.current.id = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    if (hint) toast.info(hint);
    window.print();
  };

  if (isError) {
    toast.error('No se pudo cargar el ticket de la factura.');
    onClose();
    return null;
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ticket {ticket?.ticketNumber ? `#${ticket.ticketNumber}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Label de vista previa */}
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <HugeIcon icon={ViewIcon} size={14} />
            Vista previa
          </div>

          {/* Preview container */}
          <div className="max-h-[55vh] overflow-y-auto rounded-2xl border bg-white shadow-lg custom-scrollbar">
            {isLoading || !ticket ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="h-6 w-6 text-muted-foreground" />
              </div>
            ) : (
              <Ticket ref={ticketRef} invoice={ticket} />
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPrintDialog('Elegí "Guardar como PDF" como destino.')}
              disabled={!ticket}
            >
              <HugeIcon icon={Download04Icon} size={16} className="mr-1.5" /> Descargar PDF
            </Button>
            <Button size="sm" onClick={() => openPrintDialog()} disabled={!ticket}>
              <HugeIcon icon={PrinterIcon} size={16} className="mr-1.5" /> Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
