// El errorHandler responde con `err.status` si es < 500: lanzar estos da 400/404 sin try/catch.
export class BadRequestError extends Error {
  status = 400;
}

export class NotFoundError extends Error {
  status = 404;
}

export class ConflictError extends Error {
  status = 409;
}
