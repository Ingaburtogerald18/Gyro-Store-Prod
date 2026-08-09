import { forwardRef } from 'react';
import type { TicketData } from '~/store/api/invoicesApi';
import { formatCordobas } from '~/lib/formatters';
import { useGetConfigQuery } from '~/store/api/sessionApi';

export const Ticket = forwardRef<HTMLDivElement, { invoice: TicketData }>(function Ticket(
  { invoice },
  ref,
) {
  const { data: config } = useGetConfigQuery();
  // El logo sale de Configuración → Recursos de Imágenes. `posLogo` es el que se
  // sube pensando en la térmica (300x300, blanco y negro puro); si todavía no
  // hay uno cargado se cae al logo general, y si tampoco hay, el ticket sale
  // solo con el nombre en texto — que ya está más abajo y se imprime perfecto.
  const logoUrl = config?.images?.posLogo || config?.images?.logoStatic || '';

  // URL pública de la tienda para el QR y el texto del pie. `storeHost` es solo
  // el dominio (sin protocolo ni slash), que es lo que se imprime en la térmica.
  const storeUrl = config?.appUrl || '';
  const storeHost = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const date = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
  const hasDelivery = (invoice.deliveryFee || 0) > 0;
  const grandTotal = invoice.total; // En v2 total ya incluye delivery

  return (
    <div
      ref={ref}
      style={{
        width: '80mm',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: '#000',
        // Fuerza la impresión de fondos/colores (la franja negra del TOTAL).
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
      className="mx-auto bg-white px-4 pb-3 pt-0.5 text-[13px] leading-snug text-black"
    >
      {/* ═══════════════════════════════════════════
          CABECERA: Logo centrado + info de contacto
          ═══════════════════════════════════════════ */}
      <div className="mb-2 text-center">
        {logoUrl && (
          // `object-contain` y sin recorte: `posLogo` se sube ya preparado para
          // el ticket, así que se imprime entero. El `grayscale` protege de un
          // logo a color en una impresora térmica, que es monocromo.
          <img
            src={logoUrl}
            alt=""
            className="mx-auto mb-1 h-16 w-auto max-w-[60mm] object-contain grayscale"
          />
        )}
        <p className="text-[18px] font-black uppercase tracking-widest">GYRO STORE</p>
        <p className="mt-1 text-[11px] tracking-wide text-black">
          Tu tienda de tecnología &amp; accesorios
        </p>
        <Separator />
        <p className="mt-1.5 text-[11px] text-black leading-tight">
          Tienda en línea, pero retiros en:<br />
          Conchita Palacios 2c al lago 1c arriba · Managua
        </p>
        <p className="mt-1 text-[11px] text-black">
          WhatsApp: +505 8594-4758
        </p>
      </div>

      <DashedSep />

      {/* ═══════════════════════════════════════════
          DATOS DEL TICKET
          ═══════════════════════════════════════════ */}
      <div className="mb-1 space-y-0.5 text-[12px]">
        <Row label="Factura Nº" value={String(invoice.ticketNumber)} bold />
        <Row
          label="Fecha"
          value={`${date.toLocaleDateString('es-NI')} — ${date.toLocaleTimeString('es-NI', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }).toUpperCase()}`}
        />
      </div>

      {/* Cliente y Vendedor */}
      <div className="mb-1 mt-1.5 space-y-0.5 text-[12px]">
        <Row
          label="Cliente"
          value={invoice.customer?.name && invoice.customer.name !== 'Cliente General' ? invoice.customer.name : 'Sin especificar'}
          bold={!!invoice.customer?.name && invoice.customer.name !== 'Cliente General'}
        />
        {invoice.customer?.phone && (
          <Row label="Tel" value={invoice.customer.phone} />
        )}
        {invoice.sellerName && (
          <Row label="Vendedor" value={invoice.sellerName} />
        )}
      </div>

      <DashedSep />

      {/* ═══════════════════════════════════════════
          DETALLE DE PRODUCTOS
          ═══════════════════════════════════════════ */}
      <div className="space-y-0">
        {invoice.items.map((l, i) => (
          <div key={i} className="border-b border-dotted border-black/40 py-2">
            {/* Nombre del producto a ancho completo */}
            <p className="text-[13px] font-bold leading-tight">{l.productName}</p>
            {/* Detalles: Cant · Precio unitario → Total alineado a la derecha */}
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="pl-1">
                Cant: {l.quantity} &nbsp;·&nbsp; Precio: {formatCordobas(l.unitPrice)}
              </span>
              <span className="text-[13px] font-black">{formatCordobas(l.lineTotal)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════
          RESUMEN FINANCIERO
          ═══════════════════════════════════════════ */}
      <div className="mt-2 space-y-1 text-[12px]">
        <Row label="Subtotal" value={formatCordobas(invoice.subtotal)} />
        {invoice.discount > 0 && (
          <Row label="Descuento" value={`-${formatCordobas(invoice.discount)}`} />
        )}
        {hasDelivery && (
          <Row 
            label={invoice.deliveryName ? `Delivery (${invoice.deliveryName})` : 'Delivery'} 
            value={formatCordobas(invoice.deliveryFee || 0)} 
          />
        )}
      </div>

      {/* ── TOTAL DESTACADO ── */}
      <div className="mt-2 flex items-center justify-between bg-black text-white px-2 py-1.5">
        <span className="text-[14px] font-black tracking-[0.1em]">TOTAL A PAGAR</span>
        <span className="text-[18px] font-black">{formatCordobas(grandTotal)}</span>
      </div>

      {/* Método de pago */}
      <p className="mt-2 text-right text-[11px] font-bold uppercase tracking-wide">
        Pago: {invoice.method}
      </p>

      <DashedSep />

      {/* ═══════════════════════════════════════════
          DESPEDIDA + QR
          ═══════════════════════════════════════════ */}
      <div className="text-center">
        <p className="text-[14px] font-black tracking-wide">¡GRACIAS POR TU COMPRA!</p>
        <p className="mt-1 text-[11px]">Visita nuestra tienda en línea</p>

        {/* QR dinámico → URL pública de la tienda (config.appUrl). */}
        <div className="my-2 flex justify-center">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
              storeUrl || '',
            )}`}
            alt="QR Tienda Online"
            className="h-[72px] w-[72px]"
          />
        </div>
        <p className="text-[11px] font-bold">{storeHost}</p>
        <p className="mt-0.5 text-[10px]">Instagram: @gyrostore</p>
        <p className="text-[10px]">TikTok: @gyrostore</p>
      </div>

      <Separator />

      {/* ═══════════════════════════════════════════
          POLÍTICAS DE GARANTÍA
          ═══════════════════════════════════════════ */}
      <div className="mt-2 px-0.5 text-[11px] leading-tight">
        <p className="mb-1 text-center text-[12px] font-bold uppercase tracking-wider">
          Políticas de Garantía
        </p>
        <div className="space-y-1">
          <p>
            <span className="font-bold">La garantía solo cubre defectos de fábrica.</span> No
            aplica si el producto presenta desperfectos por el uso (como rayones o golpes).
          </p>
          <p>
            <span className="font-bold">Tiempo de cobertura:</span> 1 mes. Para compras mayoristas
            (más de 1 docena) la cobertura es de 3 meses.
          </p>
          <p>
            <span className="font-bold">Requisitos:</span> Para aplicar la garantía es
            indispensable presentar esta factura. El artículo y su caja original deben estar en
            excelentes condiciones, tal como se entregaron.
          </p>
        </div>
      </div>

      {/* ── Corte final ── */}
      <div className="mt-2 text-center text-[8px] tracking-[0.3em] text-black">
        {'· '.repeat(22)}
      </div>
    </div>
  );
});

/* ── Componentes internos ── */

/** Separador punteado */
function DashedSep() {
  return <div className="my-2 border-b-[1.5px] border-dashed border-black" />;
}

/** Separador sólido fino */
function Separator() {
  return <div className="mx-auto my-1.5 h-[1px] w-full bg-black/30" />;
}

/** Fila clave:valor */
function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between text-black">
      <span>{label}:</span>
      <span className={bold ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}
