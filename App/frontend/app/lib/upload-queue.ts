import { getSupabaseClient } from '~/lib/supabase.client';

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
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const body = new FormData();
  body.append('file', file);
  body.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen.');
  return data.url as string;
}

/**
 * Recorre recursivamente un objeto (o string o array) buscando URLs temporales (`blob:http...`).
 * Si encuentra una, recupera el archivo de la cola, lo sube a R2 en la carpeta especificada,
 * y reemplaza la URL temporal por la URL definitiva retornada por el servidor.
 */
export async function processPendingUploads<T>(data: T, folder: string): Promise<T> {
  if (!data) return data;

  if (typeof data === 'string') {
    if (data.startsWith('blob:')) {
      const file = uploadQueue.get(data);
      if (file) {
        try {
          const url = await uploadOne(file, folder);
          // Opcional: remover de la cola para liberar memoria, pero si la UI 
          // sigue usando el objectURL, dejarlo un rato no hace daño. 
          // Podemos revocarlo para que no gotee memoria:
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
