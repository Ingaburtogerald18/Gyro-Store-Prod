// Estado de la selección y línea de carrito, compartidos por la ficha y el selector rápido.
import type { CatalogProduct, CatalogVariant } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { StockIndicator } from '~/components/product/stock-indicator';
import type { PurchaseState } from '~/lib/purchase';
import type { CartItem } from '~/types/cart';

/** Línea de carrito para una variante comprable. */
export function cartItemFor(
  product: Pick<CatalogProduct, 'id' | 'name'>,
  variant: CatalogVariant,
  image: string | undefined,
  quantity: number,
): CartItem {
  return {
    catalogId: product.id,
    name: product.name,
    variantName: variant.variantName,
    price: variant.price,
    image: image ?? '',
    quantity,
    maxQuantity: variant.stock > 0 ? variant.stock : undefined,
  };
}

/** Texto del botón principal según el estado: nunca promete algo que no hará. */
export function addLabel(state: PurchaseState, { short = false } = {}) {
  switch (state.kind) {
    case 'loading':
      return 'Cargando opciones…';
    case 'error':
      return short ? 'Ver detalles' : 'Ver detalles completos';
    case 'missing':
      return short ? 'Elegir opciones' : `Elegí ${(state.axis.label || state.axis.key).toLowerCase()}`;
    case 'invalid':
      return 'Elegí otra combinación';
    case 'sold_out':
      return 'Agotado';
    case 'coming_soon':
      return 'Próximamente';
    case 'unknown':
      return 'Consultar disponibilidad';
    case 'ready':
      return short ? 'Agregar' : 'Agregar al carrito';
  }
}

/** Para agotado o sin stock verificable ofrece WhatsApp y cambiar la selección: nadie queda atrapado. */
export function PurchaseStatus({
  state,
  onRetry,
  onClear,
  canClear,
}: {
  state: PurchaseState;
  onRetry?: () => void;
  onClear?: () => void;
  canClear?: boolean;
}) {
  if (state.kind === 'loading') {
    return <p role="status" className="text-sm text-muted-foreground">Cargando opciones y disponibilidad…</p>;
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>No pudimos cargar las opciones de este producto.</span>
        {onRetry && (
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (state.kind === 'missing' || state.kind === 'invalid') return null;

  const availability = state.kind === 'ready' ? 'available' : state.kind;
  return (
    <div role="status" className="space-y-1">
      <StockIndicator availability={availability} />
      {state.kind === 'sold_out' && (
        <p className="text-sm text-muted-foreground">
          Esta opción está agotada. Pedí que te avisemos cuando vuelva
          {canClear && onClear ? ' o elegí otra.' : '.'}
        </p>
      )}
      {state.kind === 'coming_soon' && (
        <p className="text-sm text-muted-foreground">
          Esta opción viene en camino y todavía no se puede pedir. Pedí que te avisemos cuando llegue
          {canClear && onClear ? ' o elegí otra.' : '.'}
        </p>
      )}
      {state.kind === 'unknown' && (
        <p className="text-sm text-muted-foreground">
          No tenemos confirmada la disponibilidad de esta opción. Consultanos por WhatsApp
          {canClear && onClear ? ' o elegí otra.' : '.'}
        </p>
      )}
      {state.kind !== 'ready' && canClear && onClear && (
        <Button type="button" variant="ghost" className="h-11 px-3 text-primary-2" onClick={onClear}>
          Cambiar selección
        </Button>
      )}
    </div>
  );
}
