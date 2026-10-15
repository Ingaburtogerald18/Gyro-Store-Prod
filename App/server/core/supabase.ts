// Cliente con la service_role: ignora las RLS, así que existe solo en el backend.
import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import { config } from './config';
import { logger } from '../utils/logger';

export const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    // El servidor no maneja sesiones de usuario: solo usa la llave de servicio.
    autoRefreshToken: false,
    persistSession: false,
  },
});

const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET || '');
// Con las llaves de firma nuevas de Supabase (ES256/RS256) la llave pública se publica acá; jose la
// guarda en memoria y la vuelve a pedir solo si aparece una llave que no conoce.
const jwks = jose.createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.supabaseUrl));

async function verifyLocally(token: string): Promise<jose.JWTPayload | null> {
  const { alg } = jose.decodeProtectedHeader(token);
  if (alg === 'HS256') return jwtSecret.length > 0 ? (await jose.jwtVerify(token, jwtSecret)).payload : null;
  return (await jose.jwtVerify(token, jwks)).payload;
}

// Para contar peticiones por persona: solo la firma local, nunca una consulta a Supabase.
export async function verifiedSubject(token: string): Promise<string | null> {
  try {
    return (await verifyLocally(token))?.sub ?? null;
  } catch {
    return null;
  }
}

let lastFallbackWarning = 0;

// Verifica la firma en el servidor, sin ir a Supabase. Si no se puede (falta el secreto, no se pudo
// leer la llave pública), le pregunta a Supabase: funciona igual, pero suma una consulta por petición.
export async function getUserFromToken(token: string) {
  let reason = 'HS256 sin SUPABASE_JWT_SECRET';
  try {
    const payload = await verifyLocally(token);
    if (payload?.sub && payload.email) {
      return {
        id: payload.sub,
        email: payload.email as string,
        user_metadata: payload.user_metadata || {},
        app_metadata: payload.app_metadata || {},
      };
    }
  } catch (err) {
    // Vencido es una respuesta segura: Supabase diría lo mismo.
    if (err instanceof jose.errors.JWTExpired) return null;
    reason = err instanceof Error ? err.message : String(err);
  }

  if (Date.now() - lastFallbackWarning > 10 * 60_000) {
    lastFallbackWarning = Date.now();
    logger.warn('[auth] El token se valida preguntando a Supabase; revisá SUPABASE_JWT_SECRET o las llaves', { reason });
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
