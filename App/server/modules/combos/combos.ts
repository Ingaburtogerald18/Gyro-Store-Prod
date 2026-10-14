import { db } from '../../core/supabase';
import { comboSchema, type Combo } from '../../../shared/schemas';
import { parseDbRows } from '../../utils/parse-db-rows';

// Obtiene los combos publicados.
// TODO(Claude): enriquecer "items" (Docs/02-Arquitectura.md) cuando se defina la forma del jsonb — hoy se devuelve tal cual viene de la DB.
export async function listPublishedCombos(): Promise<Combo[]> {
  const { data, error } = await db
    .from('combos')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  // Si la base no cumple el contrato es un 500, no un 400: el cliente no tiene nada que corregir.
  return parseDbRows(comboSchema, data, 'combos');
}

// Null si no existe o no está publicado: el mismo 404, así no se sondea por id.
export async function getPublishedCombo(id: string): Promise<Combo | null> {
  const { data, error } = await db
    .from('combos')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return parseDbRows(comboSchema, [data], 'combos')[0] ?? null;
}
