// Resolución de las líneas de un pedido público contra el catálogo.
//
// Separado de `orders.ts` (que habla con la base) para poder probar las reglas
// sin red: qué variante corresponde a cada línea, cuánto vale y si se puede
// vender. El servidor es la autoridad de precio y disponibilidad; lo que manda el
// cliente (`variantName`, `unitPrice`) solo identifica y se coteja.
import type {
  CatalogDetail,
  CatalogVariant,
  OrderIssue,
  PublicOrderItemInput,
} from '../../shared/schemas';

export interface ResolvedComboInfo {
  id: string;
  name: string;
  price: number | null;
}

export interface ResolvedOrderLine {
  catalogItemId?: string;
  comboId?: string;
  name: string;
  /** Identidad de la combinación ('' si el producto no tiene ejes). */
  variantName?: string;
  quantity: number;
  unitPrice: number;
}

// Los precios se comparan en centavos: 390 y 390.0000001 son el mismo precio.
const samePrice = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

// Carritos viejos guardaban 'Estándar' cuando el producto no tenía opciones.
const LEGACY_NO_VARIANT = 'Estándar';

/**
 * Elige la variante de una línea. Devuelve el motivo de rechazo cuando no se
 * puede resolver sin adivinar:
 *   · sin nombre y con varias combinaciones → falta elegir;
 *   · con un nombre que no coincide con ninguna combinación → inválida.
 * Con una sola combinación posible (incluido el producto sin ejes), esa es.
 */
export function pickVariant(
  detail: Pick<CatalogDetail, 'variants'>,
  variantName: string | undefined,
): { variant: CatalogVariant } | { reason: 'variant_required' | 'invalid_variant' } {
  const variants = detail.variants;
  const requested = variantName?.trim();
  if (!requested || requested === LEGACY_NO_VARIANT) {
    const only = variants.length === 1 ? variants[0] : undefined;
    if (only) return { variant: only };
    return { reason: variants.length === 0 ? 'invalid_variant' : 'variant_required' };
  }
  const match = variants.find((v) => v.variantName === requested);
  return match ? { variant: match } : { reason: 'invalid_variant' };
}

/**
 * Resuelve todas las líneas. Si alguna necesita revisión, devuelve TODOS los
 * problemas juntos (no solo el primero): el cliente corrige el carrito de una vez.
 *
 * La disponibilidad se valida por combinación completa y sumando las líneas que
 * apuntan a la misma variante. No es una reserva: el flujo sigue siendo manual.
 */
export function resolveOrderLines(
  items: PublicOrderItemInput[],
  details: Map<string, CatalogDetail>,
  combos: Map<string, ResolvedComboInfo>,
): { lines: ResolvedOrderLine[]; issues: OrderIssue[] } {
  const lines: ResolvedOrderLine[] = [];
  const issues: OrderIssue[] = [];
  const requestedByVariant = new Map<string, number>();

  items.forEach((item, index) => {
    if (item.comboId) {
      const combo = combos.get(item.comboId);
      // Combos: se respeta su regla actual (precio de paquete, sin stock propio).
      if (!combo || combo.price == null) {
        issues.push({ index, reason: 'not_found' });
        return;
      }
      if (item.unitPrice !== undefined && !samePrice(item.unitPrice, combo.price)) {
        issues.push({ index, reason: 'price_changed', currentPrice: combo.price });
      }
      lines.push({ comboId: combo.id, name: combo.name, quantity: item.quantity, unitPrice: combo.price });
      return;
    }

    const detail = item.catalogItemId ? details.get(item.catalogItemId) : undefined;
    if (!detail) {
      issues.push({ index, reason: 'not_found' });
      return;
    }

    const picked = pickVariant(detail, item.variantName);
    if ('reason' in picked) {
      issues.push({ index, reason: picked.reason });
      return;
    }
    const { variant } = picked;

    if (variant.availability === 'unknown') {
      issues.push({ index, reason: 'unknown_stock' });
      return;
    }
    if (variant.availability === 'coming_soon') {
      issues.push({ index, reason: 'coming_soon' });
      return;
    }
    if (variant.availability === 'sold_out' || variant.stock <= 0) {
      issues.push({ index, reason: 'sold_out' });
      return;
    }

    const key = `${detail.id}::${variant.variantName}`;
    const requested = (requestedByVariant.get(key) ?? 0) + item.quantity;
    requestedByVariant.set(key, requested);
    if (requested > variant.stock) {
      const alreadyRequested = requested - item.quantity;
      issues.push({ index, reason: 'insufficient', maxQuantity: Math.max(0, variant.stock - alreadyRequested) });
    }

    if (item.unitPrice !== undefined && !samePrice(item.unitPrice, variant.price)) {
      issues.push({ index, reason: 'price_changed', currentPrice: variant.price });
    }

    lines.push({
      catalogItemId: detail.id,
      name: detail.name,
      variantName: variant.variantName,
      quantity: item.quantity,
      unitPrice: variant.price,
    });
  });

  return { lines, issues };
}
