import type { ParsedQs } from 'qs';

export interface CursorData {
  createdAt: string;
  id: string;
}

export interface PaginationParams {
  cursorData: CursorData | null;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

// Decodifica el cursor base64 (formato: "created_at|id") y lee el limit del query
export function parseCursor(query: Record<string, unknown> | ParsedQs): PaginationParams {
  const q = query as Record<string, unknown>;
  const rawLimit = q['limit'];
  const rawCursor = q['cursor'];

  let limit = 20;
  
  if (typeof rawLimit === 'string') {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  } else if (typeof rawLimit === 'number') {
    limit = Math.min(rawLimit, 100);
  }

  let cursorData: CursorData | null = null;

  if (typeof rawCursor === 'string' && rawCursor.length > 0) {
    try {
      const decoded = Buffer.from(rawCursor, 'base64').toString('utf-8');
      const parts = decoded.split('|');
      
      const createdAt = parts[0];
      const id = parts[1];

      // Verificamos undefined por noUncheckedIndexedAccess
      if (parts.length === 2 && createdAt !== undefined && id !== undefined) {
        cursorData = { createdAt, id };
      }
    } catch {
      // Retornamos null ante cualquier error de parseo (cursor inválido/manipulado)
    }
  }

  return { cursorData, limit };
}

// Procesa los registros traídos de la BD y rearma el nuevo cursor si hay una página extra
export function buildPage<T extends { created_at: string; id: string }>(
  rows: T[],
  limit: number
): PaginatedResult<T> {
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;

  if (hasNextPage) {
    const lastItem = items[items.length - 1];
    
    // Check de seguridad por noUncheckedIndexedAccess
    if (lastItem) {
      const cursorRaw = `${lastItem.created_at}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorRaw, 'utf-8').toString('base64');
    }
  }

  return { items, nextCursor };
}