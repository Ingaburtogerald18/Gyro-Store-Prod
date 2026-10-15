// La tienda no le baja supabase-js a cada visitante: se carga solo si el navegador ya guarda una sesión
// del personal, o cuando el login lo crea. Por eso acá supabase-js entra solo como tipo.
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseModule = typeof import('./supabase.client');

let loading: Promise<SupabaseModule> | null = null;
const waiting = new Set<(client: SupabaseClient) => void>();

export function loadSupabase(): Promise<SupabaseModule> {
  loading ??= import('./supabase.client');
  return loading;
}

// supabase-js guarda la sesión (y el verificador del login) en localStorage con claves sb-<proyecto>-auth-token….
export function hasStoredSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-') && key.includes('-auth-token')) return true;
    }
  } catch {
    // Sin acceso a localStorage tampoco hay sesión guardada.
  }
  return false;
}

/** Avisa cuando alguien (el login) crea el cliente. Devuelve cómo dejar de esperar. */
export function onSupabaseCreated(callback: (client: SupabaseClient) => void): () => void {
  waiting.add(callback);
  return () => waiting.delete(callback);
}

/** Lo llama supabase.client al crear el cliente. */
export function supabaseCreated(client: SupabaseClient) {
  for (const callback of waiting) callback(client);
  waiting.clear();
}

export async function signOut(): Promise<void> {
  if (typeof window === 'undefined') return;
  await (await loadSupabase()).signOut();
}

// Null para visitantes o en SSR: la tienda pública funciona sin sesión.
export async function getAccessToken(): Promise<string | null> {
  if (!hasStoredSession()) return null;
  return (await loadSupabase()).getAccessToken();
}
