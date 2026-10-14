// Cambios sobre un lote: llegada a bodega, edición, reversión y borrado.
import { db } from '../../core/supabase';
import { getFinancialConfig } from '../settings/app-config';
import { costPurchaseOnArrival } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';
import { isMissingColumn } from '../orders/order-persistence';
import type { UpdatePurchaseInput, ArrivalInput } from '../../../shared/schemas';
import { resolveTemplateLink } from '../catalog/template-products';
import { codesOfMapping, nameForVariant, type CatalogLink } from './inventory-links';
import type { InventoryRow } from './inventory';

// ============================================================================
// ── Escritura (purchases) ──
// ============================================================================

/** Saca un código de lote de los vínculos que se cargaban a mano en el editor de Catálogo. */
async function dropManualLinks(code: string): Promise<void> {
  const { data, error } = await db.from('catalog_items').select('id, variant_mappings').not('variant_mappings', 'is', null);
  if (error) throw error;
  for (const item of (data ?? []) as { id: string; variant_mappings: Record<string, unknown> }[]) {
    const entries = Object.entries(item.variant_mappings ?? {});
    if (!entries.some(([, entry]) => codesOfMapping(entry).includes(code))) continue;
    const mappings = Object.fromEntries(
      entries.map(([key, entry]) => {
        if (!codesOfMapping(entry).includes(code)) return [key, entry];
        const { sku: _sku, skus: _skus, ...rest } = entry as Record<string, unknown>;
        return [key, { ...rest, codes: codesOfMapping(entry).filter((c) => c !== code) }];
      }),
    );
    const { error: updateError } = await db.from('catalog_items').update({ variant_mappings: mappings }).eq('id', item.id);
    if (updateError) throw updateError;
  }
}

/** Link de fotos y videos del producto de cada lote (`catalog_items.spo_link`). */
export async function withMediaLinks<T extends InventoryRow & { offerTarget?: { catalogItemId: string } | null }>(
  rows: T[],
): Promise<Array<T & { spoLink: string | null }>> {
  const productOf = (row: T) => row.offerTarget?.catalogItemId ?? row.catalogItemId ?? null;
  const ids = [...new Set(rows.map(productOf).filter((id): id is string => Boolean(id)))];
  const links = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await db.from('catalog_items').select('id, spo_link').in('id', ids).not('spo_link', 'is', null);
    if (error) throw error;
    for (const item of (data ?? []) as { id: string; spo_link: string | null }[]) {
      if (item.spo_link) links.set(item.id, item.spo_link);
    }
  }
  return rows.map((row) => ({ ...row, spoLink: links.get(productOf(row) ?? '') ?? null }));
}

/**
 * Vincula (o desvincula, con `null`) un lote existente a una variante del
 * catálogo. Requiere la migración 0022.
 */
export async function setPurchaseLink(id: string, link: CatalogLink | null): Promise<void> {
  const { error } = await db
    .from('purchases')
    .update({ catalog_item_id: link?.catalogItemId ?? null, variant_key: link ? link.variantKey : null })
    .eq('id', id);
  if (isMissingColumn(error)) {
    throw new BadRequestError('Para vincular lotes desde Inventario falta aplicar la migración 0022 en la base.');
  }
  if (error) throw error;
}

// "Sube stock": pasa el lote a `received` y persiste la
// cadena de costeo completa de Docs/03-Finanzas.md §1-3 vía costing.ts. La tasa de cambio
// se congela acá (regla de oro #4) con la vigente en `app_config` al momento
// de recibir — no se vuelve a tocar después.
export async function reportArrival(id: string, input: ArrivalInput): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('quantity, costo_china_usd, impuesto_unit_usd')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  const config = await getFinancialConfig();
  // La tasa que se congela es la que confirma quien recibe (el modal la
  // precarga con la de Configuración); sin ella, la vigente.
  const exchangeRate = input.exchangeRate ?? config.exchangeRate;
  const costing = costPurchaseOnArrival(
    {
      quantity: existing.quantity,
      costoChinaUsd: existing.costo_china_usd ?? 0,
      impuestoUnitUsd: existing.impuesto_unit_usd ?? 0,
      envioUnitUsd: input.shippingUnit,
      exchangeRate,
    },
    config,
  );

  const { error } = await db
    .from('purchases')
    .update({
      status: 'received',
      arrival_date: input.arrivalDate,
      envio_unit_usd: input.shippingUnit,
      exchange_rate: exchangeRate,
      costo_real_usd: costing.costoRealUsd,
      costo_real_cs: costing.costoRealCs,
      costo_f_u: costing.costoFU,
      coste_final: costing.costeFinal,
      suggested_price: input.suggestedPrice,
    })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function simulateCost(
  id: string,
  shippingUnit: number,
  exchangeRateOverride?: number,
): Promise<{ precioSugerido: number; exchangeRate: number }> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('quantity, costo_china_usd, impuesto_unit_usd')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new BadRequestError('Lote no encontrado');

  const config = await getFinancialConfig();
  const exchangeRate = exchangeRateOverride ?? config.exchangeRate;
  const costing = costPurchaseOnArrival(
    {
      quantity: existing.quantity,
      costoChinaUsd: existing.costo_china_usd ?? 0,
      impuestoUnitUsd: existing.impuesto_unit_usd ?? 0,
      envioUnitUsd: shippingUnit,
      exchangeRate,
    },
    config,
  );

  return { precioSugerido: costing.precioSugerido, exchangeRate };
}

export async function updatePurchase(
  id: string,
  rawInput: UpdatePurchaseInput,
  authorUid?: string,
  opts: { fromOrder?: boolean } = {},
): Promise<boolean> {
  let input = rawInput;
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  const sold = existing.quantity_sold ?? 0;
  const reserved = existing.quantity_reserved ?? 0;

  // Una línea de una orden de Alibaba toma el número y la fecha de la orden:
  // cambiarlos acá la separaría de su orden. Se cambian desde la orden.
  if (existing.order_id) {
    if (input.lot !== undefined && input.lot.trim().toUpperCase() !== String(existing.lot ?? '').trim().toUpperCase()) {
      throw new BadRequestError('El número de orden se cambia desde la orden, no desde una línea.');
    }
    if (input.purchaseDate !== undefined && input.purchaseDate !== existing.purchase_date) {
      throw new BadRequestError('La fecha de compra se cambia desde la orden, no desde una línea.');
    }
    if (!opts.fromOrder && input.taxUnit !== undefined && Number(input.taxUnit) !== Number(existing.impuesto_unit_usd ?? 0)) {
      throw new BadRequestError('El impuesto es el mismo para toda la orden: cambialo desde «Editar orden».');
    }
  }

  // El código lo genera el sistema y es la llave del vínculo con el catálogo:
  // cambiarlo dejaría la variante apuntando a un lote que ya no existe.
  if (input.code !== undefined && input.code !== existing.code) {
    throw new BadRequestError('El código del lote no se puede cambiar.');
  }
  // Las ventas pendientes se costean al aprobarlas buscando su lote por este
  // nombre: renombrar en el medio dejaría esas líneas con costo 0.
  if (input.productName !== undefined && input.productName !== existing.product_name && reserved > 0) {
    throw new BadRequestError(
      `No se puede cambiar el nombre: hay ${reserved} unidad(es) reservadas en ventas o pedidos web pendientes. Resolvelos primero.`,
    );
  }
  if (input.quantity !== undefined && input.quantity < sold + reserved) {
    throw new BadRequestError(
      `La cantidad no puede ser menor a ${sold + reserved}: ya hay ${sold} vendida(s) y ${reserved} reservada(s).`,
    );
  }

  // Con plantilla, el servidor busca (o crea, sin publicar) su producto.
  if (input.templateId) {
    const { link } = await resolveTemplateLink({
      templateId: input.templateId,
      variantKey: input.variantKey ?? '',
      catalogItemId: input.catalogItemId ?? undefined,
    });
    input = { ...input, ...link };
  }

  // Vincular a una variante: el lote toma el nombre que ya usan los otros lotes
  // de esa variante (Ventas los agrupa por nombre). Si tiene unidades
  // reservadas se conserva el nombre: renombrar rompería el costeo.
  if (input.catalogItemId !== undefined) {
    const link: CatalogLink | null = input.catalogItemId
      ? { catalogItemId: input.catalogItemId, variantKey: input.variantKey ?? '' }
      : null;
    const canonical = link && reserved === 0 ? await nameForVariant(link) : null;
    await setPurchaseLink(id, link);
    // El vínculo por columna queda como el único: sin el editor de Catálogo, uno
    // cargado a mano ahí ya no se podría corregir.
    await dropManualLinks(existing.code);
    if (canonical) {
      input = {
        ...input,
        productName: canonical.productName,
        ...(input.templateId && canonical.categoryId ? { category: canonical.categoryId } : {}),
      };
    }
  }

  // Solo se toma como "cambio" lo que es distinto de lo guardado: el panel
  // manda el formulario entero aunque se haya tocado un solo campo.
  const differs = (next: number | undefined, current: number | null) =>
    next !== undefined && Number(next) !== Number(current ?? 0);

  const patch: Record<string, unknown> = {};
  if (input.purchaseDate !== undefined) patch.purchase_date = input.purchaseDate;
  if (input.lot !== undefined) patch.lot = input.lot;
  if (input.productName !== undefined) patch.product_name = input.productName;
  if (input.category !== undefined) patch.category = input.category;
  if (differs(input.quantity, existing.quantity)) patch.quantity = input.quantity;
  if (differs(input.costUnit, existing.costo_china_usd)) patch.costo_china_usd = input.costUnit;
  if (differs(input.taxUnit, existing.impuesto_unit_usd)) patch.impuesto_unit_usd = input.taxUnit;
  if (differs(input.shippingUnit, existing.envio_unit_usd)) patch.envio_unit_usd = input.shippingUnit;
  if (input.suggestedPrice !== undefined) patch.suggested_price = input.suggestedPrice;

  // Si el lote ya fue recibido y un insumo del costeo cambió DE VERDAD, se
  // recalcula la cadena de costos con la tasa YA congelada del lote (regla de
  // oro #4). El precio de venta NO se toca: es una decisión de quien vende,
  // y antes se pisaba con el sugerido en cualquier edición, aunque solo se
  // hubiera corregido el nombre. Para cambiarlo hay que mandarlo explícito.
  const costingInputsChanged =
    existing.status === 'received' &&
    ('quantity' in patch || 'costo_china_usd' in patch || 'impuesto_unit_usd' in patch || 'envio_unit_usd' in patch);

  if (costingInputsChanged) {
    if (existing.exchange_rate == null) {
      throw new BadRequestError('El lote está marcado como recibido pero no tiene tasa de cambio congelada.');
    }
    const config = await getFinancialConfig();
    const costing = costPurchaseOnArrival(
      {
        quantity: (patch.quantity as number | undefined) ?? existing.quantity,
        costoChinaUsd: (patch.costo_china_usd as number | undefined) ?? existing.costo_china_usd ?? 0,
        impuestoUnitUsd: (patch.impuesto_unit_usd as number | undefined) ?? existing.impuesto_unit_usd ?? 0,
        envioUnitUsd: (patch.envio_unit_usd as number | undefined) ?? existing.envio_unit_usd ?? 0,
        exchangeRate: existing.exchange_rate,
      },
      config,
    );
    patch.costo_real_usd = costing.costoRealUsd;
    patch.costo_real_cs = costing.costoRealCs;
    patch.costo_f_u = costing.costoFU;
    patch.coste_final = costing.costeFinal;
  }

  if (Object.keys(patch).length === 0) return true;

  const { data: updated, error } = await db.from('purchases').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) throw error;

  // Rastro de quién cambió qué: cantidades, costos y precio mueven la plata.
  await db.from('audit_logs').insert({
    entity: 'purchases',
    entity_id: id,
    action: 'update',
    reason: 'Edición desde panel',
    author_uid: authorUid ?? null,
    before: existing,
    after: updated ?? null,
  });

  return true;
}

// Deshace una recepción (received → china). Bloqueado si ya se vendió o
// reservó algo del lote: revertir eso dejaría números inconsistentes.
export async function revertPurchase(id: string): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('status, quantity_sold, quantity_reserved')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  if (existing.status !== 'received') {
    throw new BadRequestError('Solo se puede revertir un lote que ya fue recibido.');
  }
  if (existing.quantity_sold > 0 || existing.quantity_reserved > 0) {
    throw new BadRequestError('No se puede revertir un lote con stock ya vendido o reservado.');
  }

  const { error } = await db
    .from('purchases')
    .update({
      status: 'china',
      arrival_date: null,
      envio_unit_usd: 0,
      exchange_rate: null,
      costo_real_usd: null,
      costo_real_cs: null,
      costo_f_u: null,
      coste_final: null,
    })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function deletePurchase(id: string, authorUid: string): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  if (existing.quantity_sold > 0 || existing.quantity_reserved > 0) {
    throw new BadRequestError('No se puede borrar un lote con stock ya vendido o reservado.');
  }

  const { error } = await db.from('purchases').delete().eq('id', id);
  if (error) throw error;
  await dropManualLinks(existing.code);

  await db.from('audit_logs').insert({
    entity: 'purchases',
    entity_id: id,
    action: 'delete',
    reason: 'Eliminación manual desde panel',
    author_uid: authorUid,
    before: existing,
    after: null,
  });

  return true;
}
