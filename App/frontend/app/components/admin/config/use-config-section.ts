// Carga y guardado de una pestaña de Configuración, compartidos por las cuatro
// para que el flujo (GET, PUT, errores, invalidar caché) viva en un solo lugar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';

import { getSupabaseClient } from '~/lib/supabase.client';
import { configApi } from '~/state/api/session-api';
import { useAppDispatch } from '~/state/hooks';

/** El token viaja a mano y no por RTK Query: estas pestañas usan `fetch` directo. */
async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión.');
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Traduce la respuesta de error del backend a un mensaje legible.
 *
 * `issues` viene de un `safeParse` de Zod del lado del servidor (ver
 * modules/settings/admin-config-routes.ts). Sin desglosarlo, un formulario rechazado mostraba
 * "Error al guardar" y la persona no tenía forma de saber qué campo estaba mal.
 */
function describeError(payload: unknown, fallback: string): string {
  const body = payload as { error?: string; issues?: { message?: string }[] } | null;
  if (body?.issues?.length) {
    return `Datos inválidos: ${body.issues.map((i) => i.message).filter(Boolean).join(', ')}`;
  }
  return body?.error || fallback;
}

export interface ConfigSectionOptions<T extends FieldValues> {
  /** De dónde se lee. */
  loadUrl: string;
  /** A dónde se escribe. Si falta, se usa `loadUrl`. */
  saveUrl?: string;
  resolver: Resolver<T>;
  defaultValues: DefaultValues<T>;
  /** Toast al guardar bien. */
  successMessage: string;
  /** Mensaje cuando el GET falla. */
  loadErrorMessage: string;
  /** Mensaje cuando el PUT falla y el backend no dijo nada útil. */
  saveErrorMessage: string;
  /**
   * Normaliza lo que devolvió el servidor antes de meterlo al formulario (por
   * ejemplo, cambiar `null` por `''`, o envolver un array en el objeto que el
   * formulario necesita para poder usar `useFieldArray`).
   */
  normalize?: (raw: any) => T;
  /**
   * Inverso de `normalize`: qué se manda en el PUT. Por defecto van los valores
   * del formulario tal cual, pero hay endpoints que esperan otra forma — el de
   * categorías recibe el array pelado, no `{ categories: [...] }`.
   */
  serialize?: (values: T) => unknown;
  /** Se llama después de un guardado exitoso. */
  onSaved?: () => void;
  /** Permite transformar valores asíncronamente (ej. subir fotos) antes del serializado y PUT. */
  processBeforeSave?: (values: T) => Promise<T>;
}

export function useConfigSection<T extends FieldValues>({
  loadUrl,
  saveUrl,
  resolver,
  defaultValues,
  successMessage,
  loadErrorMessage,
  saveErrorMessage,
  normalize,
  serialize,
  onSaved,
  processBeforeSave,
}: ConfigSectionOptions<T>) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const form = useForm<T>({ resolver, defaultValues });
  const { reset, handleSubmit } = form;

  // `normalize` y `onSaved` llegan como funciones inline, así que cambian de
  // identidad en cada render. Guardadas en un ref, `load` puede depender solo de
  // la URL: si fueran dependencias, cada render dispararía otra carga, en bucle.
  const normalizeRef = useRef(normalize);
  const serializeRef = useRef(serialize);
  const onSavedRef = useRef(onSaved);
  const processBeforeSaveRef = useRef(processBeforeSave);
  normalizeRef.current = normalize;
  serializeRef.current = serialize;
  onSavedRef.current = onSaved;
  processBeforeSaveRef.current = processBeforeSave;

  // `isMounted` en vez de una bandera por efecto: `load` la comparten el montaje
  // inicial y el botón de reintentar, y el ref sobrevive a ambos.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    setSaveError(null);
    setLoading(true);
    try {
      const res = await fetch(loadUrl, { headers: await authHeaders() });
      if (!res.ok) throw new Error(loadErrorMessage);
      const raw = await res.json();
      if (!isMounted.current) return;
      reset(normalizeRef.current ? normalizeRef.current(raw) : raw);
    } catch (err) {
      // Se guarda en estado (no en un toast): con el formulario sin datos, un
      // toast se va solo y deja la pantalla vacía sin explicación.
      if (isMounted.current) setLoadError((err as Error).message || loadErrorMessage);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [loadUrl, loadErrorMessage, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = handleSubmit(async (values) => {
    setSaveError(null);
    try {
      if (processBeforeSaveRef.current) {
        values = await processBeforeSaveRef.current(values);
      }
      const res = await fetch(saveUrl ?? loadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(serializeRef.current ? serializeRef.current(values) : values),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(describeError(payload, saveErrorMessage));

      // Se resetea con lo que devolvió el SERVIDOR, no con lo que se envió: es
      // la única forma de ver los valores ya normalizados (recortes, defaults)
      // y de que el formulario deje de estar "sucio".
      reset(normalizeRef.current && payload ? normalizeRef.current(payload) : payload);

      // El storefront lee esta config vía GET /api/config; sin invalidar, el
      // nombre de la tienda o los logos siguen viejos hasta recargar.
      dispatch(configApi.util.invalidateTags(['Config']));
      onSavedRef.current?.();
      toast.success(successMessage);
    } catch (err) {
      setSaveError((err as Error).message || saveErrorMessage);
    }
  });

  return { form, loading, loadError, saveError, submit, retry: load };
}
