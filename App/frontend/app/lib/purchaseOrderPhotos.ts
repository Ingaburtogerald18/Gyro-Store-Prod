// Fotos del empaque de una orden de compra: bajarlas o compartirlas juntas
// (el agente en Nicaragua las pide para reconocer los bultos).
//
// Se piden al servidor (`/inventory/orders/:id/photos/:i`) y no directo al
// bucket: el bucket es otro dominio y el navegador no deja leerlo desde acá.
import { getSupabaseClient } from '~/lib/supabase.client';

async function fetchPhotoFiles(orderId: string, orderNumber: string, count: number): Promise<File[]> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  const headers: Record<string, string> = session ? { Authorization: `Bearer ${session.access_token}` } : {};

  return Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const res = await fetch(`/api/inventory/orders/${orderId}/photos/${i}`, { headers });
      if (!res.ok) throw new Error('No se pudieron bajar las fotos.');
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `orden-${orderNumber}-foto-${i + 1}`;
      return new File([blob], name, { type: blob.type });
    }),
  );
}

/** true si el navegador puede mandar archivos a otra app (WhatsApp, correo…). */
export function canSharePhotoFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
}

function saveFiles(files: File[]): void {
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

/** Descarga cada foto como archivo. */
export async function downloadOrderPhotos(orderId: string, orderNumber: string, count: number): Promise<void> {
  saveFiles(await fetchPhotoFiles(orderId, orderNumber, count));
}

/**
 * Abre el menú de compartir del sistema con las fotos. Si el navegador no
 * puede compartir archivos, las descarga.
 */
export async function shareOrderPhotos(orderId: string, orderNumber: string, count: number): Promise<'shared' | 'downloaded'> {
  const files = await fetchPhotoFiles(orderId, orderNumber, count);
  if (canSharePhotoFiles() && navigator.canShare({ files })) {
    await navigator.share({ files, title: `Orden ${orderNumber}` });
    return 'shared';
  }
  saveFiles(files);
  return 'downloaded';
}
