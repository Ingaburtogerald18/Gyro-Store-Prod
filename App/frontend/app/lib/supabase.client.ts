// Cliente de Supabase solo para la sesión del personal: los datos van siempre por la API de Express.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseCreated } from '~/lib/session.client';

let client: SupabaseClient | null = null;

// Las llaves públicas llegan al navegador vía window.ENV, inyectado por el loader
// de root.tsx (patrón Remix: nada de VITE_* en el bundle).
export function getSupabaseClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      'getSupabaseClient() es solo-navegador; en loaders/actions usa la API del backend.',
    );
  }
  if (!client) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.ENV ?? {};
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Faltan SUPABASE_URL / SUPABASE_ANON_KEY en window.ENV — revisa frontend/.env y el loader de root.tsx.',
      );
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    supabaseCreated(client);
  }
  return client;
}

// Cierra la sesión en el navegador. El backend no guarda estado de sesión: el
// JWT simplemente deja de enviarse.
export async function signOut(): Promise<void> {
  if (typeof window === 'undefined') return;
  await getSupabaseClient().auth.signOut();
}

// Null para visitantes o en SSR: la tienda pública funciona sin sesión.
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}
