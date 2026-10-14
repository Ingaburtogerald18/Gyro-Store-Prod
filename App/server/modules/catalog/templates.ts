// Plantillas: una por modelo. Nombre, descripción y categoría los muestra la tienda; los ejes arman
// las variantes. Precio, fotos y stock viven en el producto del catálogo.
import { db } from '../../core/supabase';
import type { AdminTemplate, SpecRow, TemplateAxis, TemplateInput } from '../../../shared/schemas';
import { normalizeAxes, normalizeSpecs } from './catalog-presenter';
import { templateNameKey } from '../../../shared/template-names';
import { BadRequestError, ConflictError } from '../../utils/http-error';

const TEMPLATE_COLUMNS =
  'id, name, brand, description, internal_note, category_id, axes, specs, updated_at, products:catalog_items(id, name, published)';

interface TemplateRow {
  id: string;
  name: string | null;
  brand: string | null;
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
    brand: row.brand ?? '',
    description: row.description ?? '',
    internalNote: row.internal_note ?? '',
    categoryId: row.category_id,
    axes: normalizeAxes(row.axes),
    specs: normalizeSpecs(row.specs),
    updatedAt: row.updated_at,
    products: (row.products ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? row.name ?? 'Sin nombre',
      published: p.published,
    })),
  };
}

// Descarta ejes a medio escribir: sin opciones generan cero combinaciones y dejan el mapeo vacío.
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
    brand: input.brand?.trim() ?? '',
    description: input.description?.trim() ?? '',
    internal_note: input.internalNote?.trim() ?? '',
    category_id: input.categoryId,
    axes: cleanAxes(input.axes),
    specs: cleanSpecs(input.specs),
  };
}

export async function listTemplates(): Promise<AdminTemplate[]> {
  const templates: AdminTemplate[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('templates')
      .select(TEMPLATE_COLUMNS)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const rows = (data ?? []) as unknown as TemplateRow[];
    templates.push(...rows.map(toAdminTemplate));
    if (rows.length < 1000) return templates;
  }
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

async function assertUniqueName(name: string, excludedId?: string): Promise<void> {
  const key = templateNameKey(name);
  if (!key) throw new BadRequestError('Escribí el nombre del modelo.');
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('templates')
      .select('id, name')
      .order('id')
      .range(offset, offset + 999);
    if (error) throw error;
    if (
      data?.some(
        (template) => template.id !== excludedId && templateNameKey(template.name ?? '') === key,
      )
    ) {
      throw new ConflictError(
        'Ya existe una plantilla para este modelo. Seleccionala en la búsqueda.',
      );
    }
    if (!data || data.length < 1000) return;
  }
}

function templateWriteError(error: { code?: string } & object): never {
  if (error.code === '23505')
    throw new ConflictError(
      'Ya existe una plantilla para este modelo. Seleccionala en la búsqueda.',
    );
  throw error;
}

export async function createTemplate(input: TemplateInput): Promise<AdminTemplate> {
  await assertUniqueName(input.name);
  const { data, error } = await db
    .from('templates')
    .insert(toRow(input))
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error) templateWriteError(error);
  return toAdminTemplate(data as unknown as TemplateRow);
}

export async function updateTemplate(
  id: string,
  input: TemplateInput,
): Promise<AdminTemplate | null> {
  // Las plantillas antiguas duplicadas se pueden editar sin cambiar su nombre.
  const previous = await getTemplate(id);
  if (!previous) return null;
  if (templateNameKey(previous.name) !== templateNameKey(input.name))
    await assertUniqueName(input.name, id);
  const { data, error } = await db
    .from('templates')
    .update(toRow(input))
    .eq('id', id)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();

  if (error) templateWriteError(error);
  return data ? toAdminTemplate(data as unknown as TemplateRow) : null;
}

// Una plantilla en uso no se borra: sus productos quedarían sin ejes ni mapeo válido.
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
