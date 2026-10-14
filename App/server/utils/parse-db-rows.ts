// Valida filas de la base. Un ZodError crudo saldría como 400 culpando al cliente y mostrando las
// tablas; una fila inválida es un 500 y el detalle va al log.
import { z, type ZodType } from 'zod';
import { logger } from './logger';

export function parseDbRows<T extends ZodType>(
  schema: T,
  rows: unknown,
  context: string,
): z.output<T>[] {
  const result = z.array(schema).safeParse(rows ?? []);

  if (!result.success) {
    logger.error(`[${context}] la base devolvió filas que no cumplen el contrato`, {
      issues: result.error.issues,
    });
    const err = new Error(`Datos inconsistentes en ${context}.`) as Error & { status?: number };
    // 500 → el errorHandler responde su mensaje genérico y no expone nada de esto.
    err.status = 500;
    throw err;
  }

  return result.data;
}
