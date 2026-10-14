// Envuelve handlers async de Express para que cualquier promesa rechazada
// pase al manejador central de errores sin try/catch repetido en cada ruta.
import type { Request, Response, NextFunction } from 'express';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncFn) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
