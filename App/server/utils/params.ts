// Un :id que no es UUID se trata como 404 y nunca llega a la base.
import { z } from 'zod';
import { NotFoundError } from './http-error';

const uuidSchema = z.uuid();

export function parseUuidParam(value: unknown, message = 'Recurso no encontrado.'): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(message);
  return parsed.data;
}
