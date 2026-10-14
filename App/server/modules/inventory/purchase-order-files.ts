// Fotos de empaque y factura guardadas de una orden de compra.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import { isStorageUrl } from '../files/storage';
import { requireOrdersTable, toStringArray } from './purchase-order-common';

interface StoredFile {
  body: Buffer;
  contentType: string;
  filename: string;
}

// El navegador no puede leer el bucket directo (otro dominio, sin CORS), así que
// el servidor lo baja. Solo se sirven archivos alojados en nuestro bucket.
async function readStoredFile(url: string, baseName: string, fallbackExt: string): Promise<StoredFile | null> {
  if (!isStorageUrl(url)) return null;
  const response = await fetch(url);
  if (!response.ok) throw new BadRequestError('No se pudo leer el archivo del almacenamiento.');
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || fallbackExt;
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType,
    filename: `${baseName}.${ext}`,
  };
}

function safeFilePart(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9-]/g, '');
}

/** Una foto del empaque (el agente en Nicaragua necesita los archivos, no un enlace). */
export async function getPackagePhoto(orderId: string, index: number): Promise<StoredFile | null> {
  await requireOrdersTable();
  const { data, error } = await db
    .from('purchase_orders')
    .select('order_number, package_photos')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const url = toStringArray(data.package_photos)[index];
  if (!url) return null;
  return readStoredFile(url, `orden-${safeFilePart(data.order_number)}-foto-${index + 1}`, 'jpg');
}

/** El archivo de una factura (PDF o imagen), para verlo dentro del panel. */
export async function getInvoiceFile(invoiceId: string): Promise<StoredFile | null> {
  await requireOrdersTable();
  const { data, error } = await db
    .from('purchase_invoices')
    .select('invoice_number, file_url')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.file_url) return null;
  const number = safeFilePart(data.invoice_number);
  return readStoredFile(data.file_url, number ? `factura-${number}` : 'factura', 'pdf');
}
