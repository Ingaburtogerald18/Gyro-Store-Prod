// Comprobante PDF de una venta aprobada: es el adjunto que acompaña a cada fila
// del espejo en SharePoint.
//
// ── Por qué se genera acá y no se guarda el ticket que ya imprime Caja ──
// El ticket de factura se arma en el frontend al momento de imprimir y no queda
// en ningún lado. El espejo lo necesita meses después, sin nadie mirando, así que
// el PDF se produce en el servidor a partir de los datos, no de la pantalla.
//
// `pdf-lib` y no puppeteer/wkhtmltopdf: es JavaScript puro, sin binarios nativos
// ni un Chromium de 300 MB que instalar en Render. Un comprobante es texto y
// líneas; no hace falta un motor de render de HTML para eso.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { config } from '../config';
import { db } from '../supabase';
import { getInvoiceTicket, type TicketData } from './invoice';

/** Lo que el worker necesita: el ticket + de dónde salió. */
export interface ComprobanteData extends TicketData {
  orderId: string;
  /**
   * `false` cuando la venta no tenía factura ligada y los datos se reconstruyeron
   * desde la orden. Se imprime como aviso en el PDF: un comprobante sin
   * correlativo fiscal no debe pasar por uno que sí lo tiene.
   */
  hasInvoice: boolean;
}

// El worker es un proceso del sistema, no una persona: ve cualquier factura.
// `getInvoiceTicket` filtra por vendedor para que uno no lea los tickets de otro,
// pero acá ya se resolvió la factura POR la venta que estamos espejando.
const SYSTEM_ACCESS = { requesterUid: '', isPrivileged: true };

/**
 * Arma los datos del comprobante de una venta.
 *
 * Camino normal: la venta tiene una factura ligada (`invoices.sale_id`) y se
 * reusa `getInvoiceTicket`, que es el MISMO origen que el ticket impreso — así el
 * comprobante archivado y el que recibió el cliente dicen lo mismo.
 *
 * Fallback: hay ventas sin factura (registradas directo en Ventas, sin pasar por
 * Caja). Se reconstruye desde `orders` + `order_items`. Pierde el correlativo, el
 * método de pago y el desglose de descuento/delivery — la orden no los guarda—,
 * pero un comprobante con lo que hay es mejor que una fila sin adjunto.
 */
export async function buildComprobanteData(orderId: string): Promise<ComprobanteData | null> {
  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select('id')
    .eq('sale_id', orderId)
    .maybeSingle();
  if (invoiceError) throw invoiceError;

  if (invoice?.id) {
    const ticket = await getInvoiceTicket(invoice.id, SYSTEM_ACCESS);
    if (ticket) return { ...ticket, orderId, hasInvoice: true };
    // La factura existe pero el ticket volvió null (anulada, o carrera con un
    // borrado): se sigue por el fallback en vez de quedarse sin comprobante.
  }

  return buildFromOrder(orderId);
}

async function buildFromOrder(orderId: string): Promise<ComprobanteData | null> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, seller_uid, seller_email, phone, total, created_at, contact_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return null;

  const { data: itemRows, error: itemsError } = await db
    .from('order_items')
    .select('sku, quantity, precio_unit')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;

  const items = (itemRows || []).map((row) => {
    const unitPrice = Number(row.precio_unit) || 0;
    const quantity = Number(row.quantity) || 0;
    return {
      productName: row.sku || 'Producto',
      quantity,
      unitPrice,
      lineTotal: round2(unitPrice * quantity),
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));

  // Nombre del vendedor desde `profiles`, no el correo: en un documento
  // archivado, `juan.perez@gyrostorenic.com` se lee como un dato de sistema.
  let sellerName = order.seller_email || 'Sin asignar';
  if (order.seller_uid) {
    const { data: profile } = await db
      .from('profiles')
      .select('name')
      .eq('id', order.seller_uid)
      .maybeSingle();
    if (profile?.name?.trim()) sellerName = profile.name.trim();
  }

  let customerName = 'Cliente General';
  if (order.contact_id) {
    const { data: contact } = await db
      .from('contacts')
      .select('name')
      .eq('id', order.contact_id)
      .maybeSingle();
    if (contact?.name?.trim()) customerName = contact.name.trim();
  }

  const total = Number(order.total) || subtotal;

  return {
    orderId,
    hasInvoice: false,
    // Sin correlativo real: se usa el prefijo del uuid para poder nombrar el
    // archivo y reconocerlo en la biblioteca. No se inventa un "GS-PR-x", que
    // se confundiría con uno emitido por Caja.
    ticketNumber: `S-${orderId.slice(0, 8)}`,
    createdAt: order.created_at,
    customer: { name: customerName, phone: order.phone || undefined },
    sellerName,
    items,
    subtotal,
    discount: 0,
    deliveryFee: 0,
    // La orden no guarda el desglose, así que el total puede no ser
    // subtotal - descuento: manda `orders.total`, que es lo que se cobró.
    total: round2(total),
    method: 'No registrado',
  };
}

/** Nombre del archivo en la biblioteca. Un comprobante por venta. */
export function comprobanteFilename(data: ComprobanteData): string {
  return `comprobante-${data.ticketNumber || data.orderId}.pdf`;
}

// ── Render ──

const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Columnas de la tabla de ítems, medidas desde el margen izquierdo. Las tres
// numéricas se alinean a la DERECHA de estos x, que es como se leen los números.
const COL_QTY_RIGHT = MARGIN + 330;
const COL_UNIT_RIGHT = MARGIN + 415;
const COL_TOTAL_RIGHT = MARGIN + CONTENT_WIDTH;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.5);
const RULE = rgb(0.8, 0.8, 0.84);

/**
 * Las fuentes estándar de PDF usan WinAnsi, que cubre el español (acentos, ñ, ¿)
 * pero NO emojis ni caracteres asiáticos. Un nombre de producto con un emoji
 * haría que `drawText` LANCE, y perder el comprobante entero por eso sería
 * absurdo: se sustituye lo que no entra y el resto se imprime.
 */
function winAnsi(text: string): string {
  return Array.from(text ?? '')
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x2014 || code === 0x2013) return '-'; // — –
      if (code === 0x2018 || code === 0x2019) return "'";
      if (code === 0x201c || code === 0x201d) return '"';
      if (code === 0x20ac) return char; // €, sí está en WinAnsi
      if (code >= 0x20 && code <= 0x7e) return char;
      if (code >= 0xa0 && code <= 0xff) return char;
      return code === 0x0a ? ' ' : '?';
    })
    .join('');
}

function money(value: number): string {
  const symbol = config.currency || '';
  return `${symbol}${(Number(value) || 0).toFixed(2)}`;
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Nicaragua no cambia de horario, así que un offset fijo es exacto y no
  // depende de que el contenedor de Render tenga la tz configurada.
  const local = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** Recorta al ancho disponible con puntos suspensivos, midiendo con la fuente real. */
function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

function drawRight(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export async function renderComprobantePdf(data: ComprobanteData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante ${data.ticketNumber}`);
  pdf.setSubject(`Venta ${data.orderId}`);
  pdf.setProducer(config.brandName);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (value: string, x: number, size: number, f: PDFFont = font, color = INK) => {
    page.drawText(winAnsi(value), { x, y, size, font: f, color });
  };
  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_WIDTH, y },
      thickness: 0.75,
      color: RULE,
    });
  };

  // ── Encabezado ──
  text(config.brandName || 'Comprobante', MARGIN, 20, bold);
  drawRight(page, winAnsi(data.ticketNumber), MARGIN + CONTENT_WIDTH, y, bold, 14);
  y -= 16;
  text('Comprobante de venta', MARGIN, 10, font, MUTED);
  drawRight(page, winAnsi(formatDate(data.createdAt)), MARGIN + CONTENT_WIDTH, y, font, 10, MUTED);
  y -= 18;
  rule();
  y -= 22;

  // ── Datos de la venta ──
  // Dos columnas: sin esto, cuatro etiquetas apiladas comen media página para
  // decir cuatro cosas cortas.
  const rightColX = MARGIN + CONTENT_WIDTH / 2;
  const pair = (label: string, value: string, x: number) => {
    page.drawText(winAnsi(label), { x, y, size: 8, font, color: MUTED });
    page.drawText(winAnsi(value), { x, y: y - 12, size: 10, font: bold, color: INK });
  };

  pair('Cliente', data.customer.name, MARGIN);
  pair('Vendedor', data.sellerName || 'Sin asignar', rightColX);
  y -= 32;
  pair('Telefono', data.customer.phone || 'No registrado', MARGIN);
  pair('Metodo de pago', data.method, rightColX);
  y -= 32;

  if (data.deliveryName) {
    pair('Delivery', data.deliveryName, MARGIN);
    y -= 32;
  }

  y -= 4;

  // ── Tabla de ítems ──
  const drawTableHeader = () => {
    text('PRODUCTO', MARGIN, 8, bold, MUTED);
    drawRight(page, 'CANT', COL_QTY_RIGHT, y, bold, 8, MUTED);
    drawRight(page, 'P. UNIT', COL_UNIT_RIGHT, y, bold, 8, MUTED);
    drawRight(page, 'TOTAL', COL_TOTAL_RIGHT, y, bold, 8, MUTED);
    y -= 8;
    rule();
    y -= 16;
  };
  drawTableHeader();

  const nameWidth = COL_QTY_RIGHT - MARGIN - 50;
  for (const item of data.items) {
    // Salto de página: una venta de 40 líneas no entra en una hoja, y dejar que
    // el texto siga dibujándose con y negativo lo manda fuera del papel.
    if (y < MARGIN + 140) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }

    text(truncate(winAnsi(item.productName), font, 10, nameWidth), MARGIN, 10);
    drawRight(page, String(item.quantity), COL_QTY_RIGHT, y, font, 10);
    drawRight(page, money(item.unitPrice), COL_UNIT_RIGHT, y, font, 10);
    drawRight(page, money(item.lineTotal), COL_TOTAL_RIGHT, y, font, 10);
    y -= 18;
  }

  if (data.items.length === 0) {
    text('Sin lineas registradas.', MARGIN, 10, font, MUTED);
    y -= 18;
  }

  y -= 6;
  rule();
  y -= 20;

  // ── Totales ──
  const totalRow = (label: string, value: number, emphasis = false) => {
    const size = emphasis ? 13 : 10;
    const f = emphasis ? bold : font;
    drawRight(page, winAnsi(label), COL_UNIT_RIGHT, y, f, size, emphasis ? INK : MUTED);
    drawRight(page, money(value), COL_TOTAL_RIGHT, y, f, size);
    y -= emphasis ? 22 : 16;
  };

  totalRow('Subtotal', data.subtotal);
  // Descuento y delivery solo si existen: una línea "Descuento C$0.00" en cada
  // comprobante es ruido que hay que leer y descartar.
  if (data.discount) totalRow('Descuento', -data.discount);
  if (data.deliveryFee) totalRow('Delivery', data.deliveryFee);
  y -= 4;
  totalRow('TOTAL', data.total, true);

  // ── Pie ──
  y = Math.max(y, MARGIN + 40);
  rule();
  y -= 14;
  text(
    data.hasInvoice
      ? 'Documento generado automaticamente a partir de la factura ligada a esta venta.'
      : 'Venta sin factura ligada: documento reconstruido desde el registro de la venta.',
    MARGIN,
    8,
    font,
    MUTED,
  );
  y -= 11;
  text(`Venta ${data.orderId}`, MARGIN, 8, font, MUTED);

  return Buffer.from(await pdf.save());
}
