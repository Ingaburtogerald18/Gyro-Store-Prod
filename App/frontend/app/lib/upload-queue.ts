import { getAccessToken } from '~/lib/session.client';

export const uploadQueue = new Map<string, File>();

/**
 * Encola un archivo para ser subido posteriormente y devuelve una URL temporal (`blob:http...`)
 * que puede ser usada inmediatamente para previsualización en la UI.
 */
export function queueFile(file: File): string {
  const url = URL.createObjectURL(file);
  uploadQueue.set(url, file);
  return url;
}

/**
 * Sube un único archivo al bucket/carpeta especificada vía el endpoint `/api/upload`.
 */
export async function uploadOne(file: File, folder: string): Promise<string> {
  const token = await getAccessToken();

  const body = new FormData();
  body.append('file', file);
  body.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen.');
  return data.url as string;
}

/** Busca URLs `blob:` en el objeto, sube cada archivo de la cola y las reemplaza por la URL definitiva. */
export async function processPendingUploads<T>(data: T, folder: string): Promise<T> {
  if (!data) return data;

  if (typeof data === 'string') {
    if (data.startsWith('blob:')) {
      const file = uploadQueue.get(data);
      if (file) {
        try {
          const url = await uploadOne(file, folder);
          // Se revoca para no retener memoria.
          URL.revokeObjectURL(data);
          uploadQueue.delete(data);
          return url as T;
        } catch (error) {
          console.error('Error procesando imagen pendiente:', error);
          // Lanzarlo es mejor para evitar que se guarde un "blob:" en la BD.
          throw error;
        }
      }
    }
    return data;
  }

  if (Array.isArray(data)) {
    const arr = await Promise.all(data.map((item) => processPendingUploads(item, folder)));
    return arr as unknown as T;
  }

  if (typeof data === 'object' && data.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = await processPendingUploads(value, folder);
    }
    return result as T;
  }

  return data;
}
