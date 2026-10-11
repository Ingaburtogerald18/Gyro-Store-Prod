// Archivos de una orden de compra (fotos del empaque y factura). Se piden al
// servidor y no directo al bucket: el bucket es otro dominio y el navegador no
// deja leerlo desde acá. El agente en Nicaragua pide las fotos para reconocer los bultos.
import { getSupabaseClient } from '~/lib/supabase.client';

async function fetchAdminFile(path: string, fallbackName: string): Promise<File> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  const headers: Record<string, string> = session ? { Authorization: `Bearer ${session.access_token}` } : {};
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new Error('No se pudo bajar el archivo.');
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  return new File([blob], name, { type: blob.type });
}

export function fetchOrderPhotos(orderId: string, orderNumber: string, count: number): Promise<File[]> {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      fetchAdminFile(`/inventory/orders/${orderId}/photos/${i}`, `orden-${orderNumber}-foto-${i + 1}`),
    ),
  );
}

export function fetchInvoiceFile(invoiceId: string): Promise<File> {
  return fetchAdminFile(`/inventory/invoices/${invoiceId}/file`, 'factura');
}

/** true si el navegador puede mandar archivos a otra app (WhatsApp, correo…). */
export function canSharePhotoFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
}

export function saveFiles(files: File[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

/** Abre el menú de compartir del sistema; si el navegador no puede compartir archivos, los descarga. */
export async function shareFiles(files: File[], title: string): Promise<'shared' | 'downloaded'> {
  if (canSharePhotoFiles() && navigator.canShare({ files })) {
    await navigator.share({ files, title });
    return 'shared';
  }
  saveFiles(files);
  return 'downloaded';
}

/** Descarga cada foto como archivo. */
export async function downloadOrderPhotos(orderId: string, orderNumber: string, count: number): Promise<void> {
  saveFiles(await fetchOrderPhotos(orderId, orderNumber, count));
}

export async function shareOrderPhotos(orderId: string, orderNumber: string, count: number): Promise<'shared' | 'downloaded'> {
  return shareFiles(await fetchOrderPhotos(orderId, orderNumber, count), `Orden ${orderNumber}`);
}
