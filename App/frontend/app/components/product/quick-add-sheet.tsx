// QuickAddSheet: con >1 combinación, la tarjeta abre este panel para elegir
// ANTES de agregar.
//
// Los ejes no viajan en el listado (solo `variantCount`/`axesSummary`), así que
// se piden al detalle recién al abrir — RTK Query los cachea por id. Las reglas
// (qué se puede agregar, qué falta, qué está agotado) son las mismas de la ficha:
// `lib/purchase.ts`. Mientras carga, si falla o si la combinación no es
// comprable, no se agrega nada.
import { useMemo, useState } from 'react';
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight02Icon, ImageNotFound01Icon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Skeleton } from '~/components/ui/skeleton';
import { VariantPicker } from '~/components/product/variant-picker';
import { PurchaseStatus, addLabel, cartItemFor } from '~/components/product/purchase-panel';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { autoSelection, purchaseState, variantLabel, type VariantSelection } from '~/lib/purchase';
import { useGetCatalogDetailQuery } from '~/store/api/storefrontApi';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { buildWhatsappUrl, formatCordobas, getProductUrl, productWhatsappMessage } from '~/lib/formatters';
import type { CatalogProduct } from '@shared/schemas';

export function QuickAddSheet({
  product,
  open,
  onOpenChange,
}: {
  product: CatalogProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const config = useStoreConfig();
  // skip mientras está cerrado: no gastar el fetch en tarjetas que nadie tocó.
  const { data: detail, isLoading, isFetching, isError, refetch } = useGetCatalogDetailQuery(product.id, { skip: !open });
  const [touched, setTouched] = useState<VariantSelection | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const axes = useMemo(() => detail?.axes ?? [], [detail?.axes]);
  const variants = useMemo(() => detail?.variants ?? [], [detail?.variants]);
  // Hasta que la persona toca algo, rige la preselección de ejes de una opción.
  const selection = touched ?? autoSelection(axes, variants);
  const state = purchaseState({ loading: isLoading || (isFetching && !detail), error: isError || (!isLoading && !detail), axes, variants, selection });
  const variant = 'variant' in state ? state.variant : null;
  const price = variant?.price ?? product.price;

  const colorAxis = axes.find((a) => a.isColor);
  const selectedColor = colorAxis ? selection[colorAxis.key] : undefined;
  const image = useMemo(() => {
    if (selectedColor && detail?.colorImages?.[selectedColor]?.length) {
      return detail.colorImages[selectedColor][0];
    }
    return product.images[0];
  }, [selectedColor, detail?.colorImages, product.images]);

  const productUrl = getProductUrl(product.id, product.name);

  function close(next: boolean) {
    if (!next) {
      setTouched(null);
      setShowMissing(false);
    }
    onOpenChange(next);
  }

  function handleAdd() {
    if (state.kind === 'missing') {
      setShowMissing(true);
      return;
    }
    if (state.kind !== 'ready') return;
    dispatch(addItem(cartItemFor(product, state.variant, image, 1)));
    close(false);
    dispatch(openCart());
  }

  function handleConsult() {
    const url = typeof window !== 'undefined' ? window.location.origin + productUrl : '';
    const label = variantLabel(axes, selection);
    const message = productWhatsappMessage({ kind: state.kind === 'sold_out' || state.kind === 'unknown' ? 'availability' : 'info', name: product.name, variant: label || undefined, url });
    window.open(buildWhatsappUrl(config?.whatsapp ?? '', message), '_blank', 'noopener,noreferrer');
  }

  const consultable = state.kind === 'sold_out' || state.kind === 'unknown';

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-10 text-left">
            <span className="product-stage grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-card">
              {image ? (
                <img src={image} alt="" width={64} height={64} className="h-full w-full object-contain" />
              ) : (
                <HugeIcon icon={ImageNotFound01Icon} size={18} strokeWidth={2} aria-hidden className="text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="line-clamp-2 text-left text-base">{product.name}</SheetTitle>
              <SheetDescription className="text-left">
                <span className="font-heading text-lg font-extrabold tracking-tight text-foreground tabular-nums">
                  {!variant && product.priceFrom ? 'Desde ' : ''}
                  {formatCordobas(price, config?.currency)}
                </span>
                {variant?.compareAtPrice && (
                  <span className="ml-2 text-sm text-muted-foreground line-through tabular-nums">
                    {formatCordobas(variant.compareAtPrice, config?.currency)}
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-2">
          {state.kind === 'loading' ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-11 w-20 rounded-xl" />
                <Skeleton className="h-11 w-20 rounded-xl" />
                <Skeleton className="h-11 w-20 rounded-xl" />
              </div>
            </div>
          ) : state.kind !== 'error' ? (
            <VariantPicker
              idPrefix={`quick-${product.id}`}
              axes={axes}
              variants={variants}
              selection={selection}
              onChange={(next) => {
                setTouched(next);
                setShowMissing(false);
              }}
              missingKey={showMissing && state.kind === 'missing' ? state.axis.key : undefined}
            />
          ) : null}
          <PurchaseStatus
            state={state}
            onRetry={() => void refetch()}
            canClear={Object.keys(selection).length > 0}
            onClear={() => setTouched({})}
          />
        </div>

        <SheetFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {consultable ? (
            <Button variant="whatsapp" onClick={handleConsult} className="h-12 w-full text-base">
              <WhatsappIcon aria-hidden className="size-4" />
              Consultar por WhatsApp
            </Button>
          ) : (
            <Button
              onClick={handleAdd}
              disabled={state.kind === 'loading' || state.kind === 'error' || state.kind === 'invalid'}
              className="h-12 w-full text-base"
            >
              {addLabel(state)}
            </Button>
          )}
          <Button variant="ghost" asChild className="h-11 w-full">
            <Link to={productUrl} prefetch="intent" onClick={() => close(false)}>
              Ver detalles completos
              <HugeIcon icon={ArrowRight02Icon} size={14} strokeWidth={2} aria-hidden />
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
