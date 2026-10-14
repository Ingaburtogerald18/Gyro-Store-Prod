// Errores HTTP tipados: el errorHandler central responde con err.status si es
// < 500 (ver server/middleware/error-handler.ts), así que lanzar estos en vez
// de Error da 400/404 sin try/catch por ruta.
export class BadRequestError extends Error {
  status = 400;
}

export class NotFoundError extends Error {
  status = 404;
}

export class ConflictError extends Error {
  status = 409;
}
