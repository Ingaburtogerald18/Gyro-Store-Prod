import { getAccessToken } from './supabase.client';

interface UploadOptions {
  signal: AbortSignal;
  onProgress: (percent: number | null) => void;
  onTransferred: () => void;
  /** Límite de espera total (ms). Al vencer, la carga se corta con un error claro. */
  timeoutMs?: number;
  /** Token de la sesión (inyectable en pruebas). */
  accessToken?: () => Promise<string | null>;
}

/** Error de carga que vale la pena distinguir en la interfaz. */
export class UploadTimeoutError extends Error {
  constructor() {
    super('La carga tardó demasiado. Revisá tu conexión e intentá de nuevo.');
    this.name = 'UploadTimeoutError';
  }
}

/** El progreso de XHR cubre el envío, no la optimización ni el guardado en R2. */
export async function uploadSlideMedia(
  file: File,
  { signal, onProgress, onTransferred, timeoutMs = 120_000, accessToken = getAccessToken }: UploadOptions,
): Promise<string> {
  signal.throwIfAborted();
  const token = await accessToken();
  signal.throwIfAborted();

  const body = new FormData();
  body.append('file', file);
  body.append('folder', 'landing');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    const abort = () => xhr.abort();
    const finish = (error?: Error, url?: string) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(url!);
    };

    xhr.upload.onprogress = (event) => {
      if (signal.aborted) return;
      onProgress(event.lengthComputable && event.total > 0
        ? Math.floor((event.loaded / event.total) * 100)
        : null);
    };
    xhr.upload.onload = () => {
      if (!signal.aborted) onTransferred();
    };
    xhr.onload = () => {
      if (signal.aborted) {
        finish(new DOMException('Carga cancelada.', 'AbortError'));
        return;
      }
      let data: { url?: unknown; error?: string };
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        finish(new Error('Respuesta inválida del servidor.'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error(data?.error || 'No se pudo subir el archivo.'));
      } else if (typeof data?.url !== 'string' || !data.url.trim()) {
        finish(new Error('El servidor no confirmó el archivo guardado.'));
      } else {
        finish(undefined, data.url);
      }
    };
    xhr.timeout = timeoutMs;
    xhr.ontimeout = () => finish(new UploadTimeoutError());
    xhr.onerror = () => finish(new Error('Error de red al subir el archivo.'));
    xhr.onabort = () => finish(new DOMException('Carga cancelada.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      xhr.send(body);
    } catch (error) {
      finish(error instanceof Error ? error : new Error('No se pudo iniciar la carga.'));
    }
  });
}
