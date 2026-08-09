// Cliente de Supabase del lado servidor, con la `service_role key`.
// Es el equivalente al Admin SDK de la v1: IGNORA las RLS (que están en deny-all).
// Regla dura: este cliente SOLO existe en el backend. Nunca en el frontend.
import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import { config } from './config';

export const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    // El servidor no maneja sesiones de usuario: solo usa la llave de servicio.
    autoRefreshToken: false,
    persistSession: false,
  },
});

const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET || '');

// Verifica un JWT de Supabase (emitido tras el login con Entra).
// Intenta verificar la firma localmente con jose para evitar el round-trip.
// Si falla, hace fallback a db.auth.getUser(token).
export async function getUserFromToken(token: string) {
  if (jwtSecret.length > 0) {
    try {
      const { payload } = await jose.jwtVerify(token, jwtSecret);
      if (payload.sub && payload.email) {
        return {
          id: payload.sub,
          email: payload.email as string,
          user_metadata: payload.user_metadata || {},
          app_metadata: payload.app_metadata || {},
        };
      }
    } catch (err) {
      // Fallback gracioso
    }
  }

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
