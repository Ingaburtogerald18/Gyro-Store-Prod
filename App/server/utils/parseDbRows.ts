// Valida contra su schema de Zod las filas que vienen de la base.
//
// Por qué no `schema.parse()` directo en cada servicio: el ZodError crudo llega al
// errorHandler, que lo trata como error de validación de entrada y responde
// "400 Datos inválidos" con el detalle campo por campo. Pero acá el dato inválido
// NO lo mandó el cliente — es una fila corrupta, un `null` en una columna que
// debería ser NOT NULL, o una migración que cambió un tipo. Devolver 400 le echa
// la culpa a quien hizo el request (lo manda a debuggear su payload, que está
// bien) y de paso filtra la forma de nuestras tablas. Es un 500: la falla es del
// servidor, y el detalle va al log, no a la respuesta.
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
