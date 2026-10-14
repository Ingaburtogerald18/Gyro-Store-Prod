// Cliente con la service_role: ignora las RLS, así que existe solo en el backend.
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

// Verifica la firma localmente si hay SUPABASE_JWT_SECRET; si no, le pregunta a Supabase.
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
