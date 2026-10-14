import { db } from '../../core/supabase';
import type { Category } from '../../../shared/schemas';

const CATEGORY_COLUMNS = 'id, name, slug, icon';

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await db
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Category[];
}

export async function createCategory(name: string, slug: string, icon: string = ''): Promise<Category> {
  const { data, error } = await db
    .from('categories')
    .insert({ name, slug, icon })
    .select(CATEGORY_COLUMNS)
    .single();

  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string, slug: string, icon: string = ''): Promise<Category | null> {
  const { data, error } = await db
    .from('categories')
    .update({ name, slug, icon })
    .eq('id', id)
    .select(CATEGORY_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data as Category | null;
}

export async function deleteCategory(id: string): Promise<boolean> {
  // Nota: Los catalog_items relacionados se pondrán en nulo automáticamente
  // por el ON DELETE SET NULL en la base de datos.
  const { error } = await db
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}
