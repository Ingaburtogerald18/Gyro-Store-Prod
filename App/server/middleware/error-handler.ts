// Manejador de errores central. Traduce errores a respuestas consistentes.
// Portado del patrón de v1 (ZodError → 400) + mapeo de errores de Postgres.
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

// Códigos de error de Postgres → respuesta legible.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Ya existe un registro con esos datos (valor duplicado).' },
  '23503': { status: 409, message: 'La operación viola una relación con otro registro.' },
  '23514': { status: 400, message: 'Los datos violan una regla de integridad (CHECK).' },
  '23502': { status: 400, message: 'Falta un campo obligatorio.' },
};

type HttpError = Error & { status?: number; statusCode?: number; code?: string };

export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction) {
  // 1. Errores de validación de Zod → 400 con detalle por campo.
  // (Construimos fieldErrors a mano para no depender de la API .flatten(),
  //  que cambió entre Zod v3 y v4.)
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return res.status(400).json({
      error: err.issues[0]?.message || 'Datos inválidos.',
      details: fieldErrors,
    });
  }

  // 2. Errores de Postgres (vienen de PostgREST/supabase-js con `code`).
  if (err.code && PG_ERROR_MAP[err.code]) {
    const mapped = PG_ERROR_MAP[err.code]!;
    return res.status(mapped.status).json({ error: mapped.message });
  }

  // 3. Errores con status explícito (lanzados por la lógica de negocio).
  const status = err.status || err.statusCode;
  if (status && status < 500) {
    return res.status(status).json({ error: err.message || 'Solicitud inválida.' });
  }

  // 4. Todo lo demás → 500 genérico (no filtra detalles internos).
  logger.error('[unhandled_error]', { message: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
}

// 404 uniforme para rutas de API no encontradas.
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
}
