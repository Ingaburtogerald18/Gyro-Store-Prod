// Cliente singleton de Supabase — SOLO Auth (doc 09 ítem 38).
// El frontend nunca consulta la base con este cliente: todo dato viaja por la API
// Express (/api/*), que opera con la service_role. Acá solo se maneja la sesión
// (login staff con Entra, OTP de comprador) para obtener el JWT que RTK Query
// inyecta como Bearer en cada request.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  }
  return client;
}

// Cierra la sesión en el navegador. El backend no guarda estado de sesión: el
// JWT simplemente deja de enviarse.
export async function signOut(): Promise<void> {
  if (typeof window === 'undefined') return;
  await getSupabaseClient().auth.signOut();
}

// Token actual de la sesión (o null si es visitante anónimo / estamos en SSR).
// Lo consume el prepareHeaders de baseApi: el storefront público funciona sin
// sesión, así que la ausencia de token no es un error.
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}
