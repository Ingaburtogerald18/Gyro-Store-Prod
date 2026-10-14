import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HugeIcon } from '~/components/ui/icon';
import { Download04Icon, PrinterIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useGetInvoiceTicketQuery } from '~/state/api/invoices-api';
import { Ticket } from './ticket';

// Id del contenedor de impresión (portal a <body>). Debe coincidir con el CSS
// de `@media print` de más abajo.
const PRINT_PORTAL_ID = 'ticket-print-portal';

export function TicketPrintModal({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null;
  onClose: () => void;
}) {
  const { data: ticket, isLoading, isError } = useGetInvoiceTicketQuery(invoiceId!, {
    skip: !invoiceId,
  });

  // El portal se monta contra `document.body`, que no existe en el render de
  // servidor (Remix SSR). Se difiere a un efecto para renderizarlo solo en el
  // cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Abre el diálogo de impresión del navegador.
   *
   * El ticket NO se imprime desde su copia dentro del `Dialog`: ese diálogo es
   * `position: fixed`, y un ancestro fijo (a) posiciona mal al hijo absoluto
   * —saliéndose del área de 80 mm, cortando la parte derecha— y (b) se REPITE en
   * cada página impresa en varios navegadores (el ticket salía duplicado). En su
   * lugar se imprime una copia renderizada como hijo directo de `<body>` (el
   * portal `#ticket-print-portal`), sin ancestros `fixed` ni `overflow`.
   *
   * Imprimir y "Descargar PDF" son EL MISMO camino: en el diálogo del navegador,
   * elegir "Guardar como PDF" produce un PDF con texto vectorial real
   * (seleccionable, nítido a cualquier zoom, unos pocos KB). Rasterizar el
   * ticket con html2canvas para armar el PDF a mano daría una imagen borrosa,
   * pesada y sin texto seleccionable — peor resultado y dos dependencias más.
   */
  const openPrintDialog = (hint?: string) => {
    if (!ticket || !mounted) return;

    const style = document.createElement('style');
    style.innerHTML = `
      @page { size: 80mm auto; margin: 0; }
      @media print {
        /* Se oculta TODO lo que cuelga de <body> (root de la app, overlay del
           diálogo, toasts…) y se muestra solo el portal del ticket, que es un
           hijo directo de <body> — sin el ancestro fijo que rompía el layout. */
        body > *:not(#${PRINT_PORTAL_ID}) { display: none !important; }
        #${PRINT_PORTAL_ID} { display: block !important; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          color-scheme: light !important;
        }
        #${PRINT_PORTAL_ID} {
          background: #fff !important;
          width: 100% !important;
        }
        #${PRINT_PORTAL_ID} > div {
          margin: 0 auto;
          background: #fff !important;
        }
      }
    `;
    document.head.appendChild(style);

    // La limpieza va en `afterprint` y NO justo después de `window.print()`: en
    // Firefox y Safari `print()` no bloquea, así que quitar el <style> en la
    // línea siguiente lo removería ANTES de que el navegador compusiera la
    // página — y saldría impresa la pantalla entera en vez del ticket.
    const cleanup = () => {
      style.remove();
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
    <>
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
            <div className="max-h-[55vh] overflow-y-auto rounded-2xl border bg-white custom-scrollbar">
              {isLoading || !ticket ? (
                <div className="flex h-48 items-center justify-center">
                  <Spinner className="h-6 w-6 text-muted-foreground" />
                </div>
              ) : (
                <Ticket invoice={ticket} />
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button variant="cancel" size="sm" onClick={onClose}>
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

      {/* Copia SOLO para impresión, montada como hijo directo de <body>. En
          pantalla va oculta (`display:none` inline); el CSS de `@media print`
          de `openPrintDialog` la revela y esconde el resto. Al no vivir dentro
          del diálogo `fixed`, se posiciona respecto a la hoja y no se repite. */}
      {mounted &&
        ticket &&
        createPortal(
          <div id={PRINT_PORTAL_ID} style={{ display: 'none' }}>
            <Ticket invoice={ticket} />
          </div>,
          document.body,
        )}
    </>
  );
}
