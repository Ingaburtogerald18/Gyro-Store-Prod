// Plantillas de producto: una por modelo (KZ EDX Pro, KZ Castor…). Nombre,
// descripción y categoría son los que muestra la tienda; la nota interna no se
// publica. Los ejes (Color, Micrófono…) arman las variantes y no hay precio,
// fotos ni stock: eso vive en el producto del catálogo que la referencia.
import { db } from '../supabase';
import type { AdminTemplate, SpecRow, TemplateAxis, TemplateInput } from '../../shared/schemas';
import { normalizeAxes, normalizeSpecs } from './catalogPresenter';

const TEMPLATE_COLUMNS =
  'id, name, description, internal_note, category_id, axes, specs, updated_at, products:catalog_items(id, name, published)';

interface TemplateRow {
  id: string;
  name: string | null;
  description: string | null;
  internal_note: string | null;
  category_id: string | null;
  axes: unknown;
  specs: unknown;
  updated_at: string;
  products: { id: string; name: string | null; published: boolean }[] | null;
}

function toAdminTemplate(row: TemplateRow): AdminTemplate {
  return {
    id: row.id,
    name: row.name ?? 'Sin nombre',
    description: row.description ?? '',
    internalNote: row.internal_note ?? '',
    categoryId: row.category_id,
    axes: normalizeAxes(row.axes),
    specs: normalizeSpecs(row.specs),
    updatedAt: row.updated_at,
    products: (row.products ?? []).map((p) => ({ id: p.id, name: p.name ?? row.name ?? 'Sin nombre', published: p.published })),
  };
}

// Descarta los ejes a medio escribir que manda el editor mientras se tipea (una
// fila nueva nace con label y opciones vacías). Sin esto se guardarían ejes sin
// opciones, que generan cero combinaciones y dejan la tabla de mapeo vacía.
function cleanAxes(axes: TemplateAxis[]): TemplateAxis[] {
  return axes
    .map((axis) => ({
      key: axis.key.trim(),
      label: axis.label.trim(),
      options: [...new Set(axis.options.map((o) => o.trim()).filter(Boolean))],
      isColor: Boolean(axis.isColor),
    }))
    .filter((axis) => axis.key && axis.label && axis.options.length > 0);
}

function cleanSpecs(specs: SpecRow[]): SpecRow[] {
  return specs
    .map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.label);
}

function toRow(input: TemplateInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    internal_note: input.internalNote?.trim() ?? '',
    category_id: input.categoryId,
    axes: cleanAxes(input.axes),
    specs: cleanSpecs(input.specs),
  };
}

export async function listTemplates(): Promise<AdminTemplate[]> {
  const { data, error } = await db
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .order('name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as TemplateRow[]).map(toAdminTemplate);
}

export async function getTemplate(id: string): Promise<AdminTemplate | null> {
  const { data, error } = await db
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toAdminTemplate(data as unknown as TemplateRow) : null;
}

export async function createTemplate(input: TemplateInput): Promise<AdminTemplate> {
  const { data, error } = await db
    .from('templates')
    .insert(toRow(input))
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error) throw error;
  return toAdminTemplate(data as unknown as TemplateRow);
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<AdminTemplate | null> {
  const { data, error } = await db
    .from('templates')
    .update(toRow(input))
    .eq('id', id)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toAdminTemplate(data as unknown as TemplateRow) : null;
}

// Borrar un molde en uso dejaría a sus productos sin ejes y con un
// `variant_mappings` que ya no corresponde a ninguna combinación: se bloquea y
// se le dice al admin cuántos productos hay que reasignar primero.
export async function countProductsUsingTemplate(id: string): Promise<number> {
  const { count, error } = await db
    .from('catalog_items')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id);

  if (error) throw error;
  return count ?? 0;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { data, error } = await db
    .from('templates')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
