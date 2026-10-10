// Una compra nueva se registra contra una plantilla y una variante. Acá se
// busca (o se crea, sin publicar) el producto del catálogo de esa plantilla.
import { db } from '../supabase';
import { BadRequestError } from '../utils/httpError';
import { normalizeAxes } from './catalogPresenter';
import { axisOptionsWithVariant, chooseTemplateProduct, templateVariantKeys } from './templateVariants';
import type { CatalogLink } from './inventory';

export interface TemplateLink {
  templateId: string;
  variantKey: string;
  catalogItemId?: string;
}

export interface ResolvedTemplateLink {
  link: CatalogLink;
  /** El producto nació en esta llamada: si la compra falla, se borra. */
  created: boolean;
}

function toAxisOptions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(list)) out[key] = list.filter((v): v is string => typeof v === 'string');
  }
  return out;
}

export async function resolveTemplateLink(input: TemplateLink): Promise<ResolvedTemplateLink> {
  const { data: template, error } = await db
    .from('templates')
    .select('id, name, category_id, axes')
    .eq('id', input.templateId)
    .maybeSingle();
  if (error) throw error;
  if (!template) throw new BadRequestError('La plantilla elegida ya no existe.');

  const name = ((template.name as string | null) ?? '').trim() || 'Sin nombre';
  const axes = normalizeAxes(template.axes);
  if (!templateVariantKeys(axes).includes(input.variantKey)) {
    throw new BadRequestError(`Elegí una variante de ${name}.`);
  }

  const { data: products, error: productsError } = await db
    .from('catalog_items')
    .select('id, axis_options')
    .eq('template_id', input.templateId)
    .order('created_at', { ascending: true });
  if (productsError) throw productsError;
  const rows = (products ?? []) as { id: string; axis_options: unknown }[];

  const choice = chooseTemplateProduct(rows.map((r) => r.id), input.catalogItemId, name);

  if (choice.action === 'use') {
    const row = rows.find((r) => r.id === choice.id)!;
    const axisOptions = axisOptionsWithVariant(toAxisOptions(row.axis_options), axes, input.variantKey);
    if (axisOptions) {
      const { error: updateError } = await db.from('catalog_items').update({ axis_options: axisOptions }).eq('id', row.id);
      if (updateError) throw updateError;
    }
    return { link: { catalogItemId: row.id, variantKey: input.variantKey }, created: false };
  }

  if (!template.category_id) {
    throw new BadRequestError(`La plantilla ${name} no tiene categoría: completala en Plantillas.`);
  }
  // Al final de la tienda, sin publicar: se prepara en el modo edición.
  const { data: last } = await db
    .from('catalog_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: item, error: insertError } = await db
    .from('catalog_items')
    .insert({
      template_id: input.templateId,
      name,
      category_id: template.category_id,
      published: false,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return { link: { catalogItemId: item.id as string, variantKey: input.variantKey }, created: true };
}

/** Borra los productos creados por una compra que no se llegó a guardar. */
export async function dropCreatedProducts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.from('catalog_items').delete().in('id', ids);
}
