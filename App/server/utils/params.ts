// Validación repetida de :id como UUID: si no lo es, se trata igual que "no
// existe" (404) — un id mal formado nunca debe llegar a golpear la base con
// una query inválida (antes duplicado en cada ruta como idSchema.safeParse).
import { z } from 'zod';
import { NotFoundError } from './httpError';

const uuidSchema = z.uuid();

export function parseUuidParam(value: unknown, message = 'Recurso no encontrado.'): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(message);
  return parsed.data;
}
