import type { Request, Response, NextFunction } from 'express';

const MAX_DEPTH = 10;

// Recorre estructuras anidadas aplicando trim() a los strings sin exceder la profundidad máxima
function trimStrings(obj: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj.trim();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => trimStrings(item, depth + 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = trimStrings(value, depth + 1);
    }
    return result;
  }

  return obj;
}

export function sanitizeBody(req: Request, res: Response, next: NextFunction): void {
  if (req.body !== null && typeof req.body === 'object') {
    req.body = trimStrings(req.body, 0);
  }
  
  next();
}