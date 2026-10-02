// QuickAddSheet: con >1 combinación, la tarjeta abre este panel para elegir
// ANTES de agregar, en vez de mandar "Estándar" al carrito.
//
// Los ejes no viajan en el listado (solo `variantCount`/`axesSummary`), así que
// se piden al detalle recién al abrir — RTK Query los cachea por id. Y el sheet
// se monta desde la tarjeta solo tras el primer clic: con 40 productos en
// pantalla, 40 portales vacíos es puro ruido en el DOM.
import { useMemo, useState } from 'react';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';
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
import {
  VariantPicker,
  pickableAxes,
  resolveVariant,
  variantLabel,
  type VariantSelection,
} from '~/components/product/variant-picker';
import { useGetCatalogDetailQuery } from '~/store/api/storefrontApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { formatCordobas, getProductUrl } from '~/lib/formatters';
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
  const { data: config } = useGetConfigQuery();
  // skip mientras está cerrado: no gastar el fetch en tarjetas que nadie tocó.
  const { data: detail, isLoading, isError } = useGetCatalogDetailQuery(product.id, { skip: !open });
  const [selection, setSelection] = useState<VariantSelection>({});

  const axes = detail?.axes ?? [];
  const variants = detail?.variants ?? [];
  const missingAxis = pickableAxes(axes).find((a) => !selection[a.key]);
  const variant = resolveVariant(axes, variants, selection);

  // El precio de la combinación elegida manda sobre el del listado: dos
  // variantes del mismo producto pueden no valer lo mismo.
  const price = variant?.price ?? product.price;
  // Sin datos de stock no se bloquea la compra; con datos, una combinación
  // agotada no se puede agregar.
  const soldOut = variants.length > 0 && variant != null && variant.stock <= 0;
  const colorAxis = axes.find((a) => a.isColor);
  const selectedColor = colorAxis ? selection[colorAxis.key] : undefined;
  const image = useMemo(() => {
    if (selectedColor && detail?.colorImages?.[selectedColor]?.length) {
      return detail.colorImages[selectedColor][0];
    }
    return product.images[0];
  }, [selectedColor, detail?.colorImages, product.images]);

  function handleAdd() {
    if (missingAxis) {
      toast.error(`Elegí ${missingAxis.label || missingAxis.key} antes de agregar.`);
      return;
    }
    if (soldOut) return;

    dispatch(
      addItem({
        catalogId: product.id,
        name: product.name,
        variantName: variantLabel(axes, selection),
        price,
        image: image ?? '',
        quantity: 1,
      }),
    );
    setSelection({});
    onOpenChange(false);
    dispatch(openCart());
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
        <SheetHeader>
          <div className="flex items-center gap-3 text-left">
            <span className="product-stage grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <HugeIcon
                  icon={ImageNotFound01Icon}
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                  className="text-muted-foreground"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="line-clamp-1 text-left">{product.name}</SheetTitle>
              <SheetDescription className="text-left">
                <span className="font-heading text-lg font-extrabold tracking-tight text-primary-2 tabular-nums">
                  {formatCordobas(price, config?.currency)}
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-2">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-pill" />
                <Skeleton className="h-8 w-20 rounded-pill" />
                <Skeleton className="h-8 w-20 rounded-pill" />
              </div>
            </div>
          ) : isError || axes.length === 0 ? (
            // Degradar con honestidad: la ficha completa siempre funciona.
            <p className="py-4 text-center text-sm text-muted-foreground">
              No se pudieron cargar las variantes. Probá desde la página del producto.
            </p>
          ) : (
            <VariantPicker
              axes={axes}
              variants={variants}
              selection={selection}
              onChange={setSelection}
            />
          )}
        </div>

        <SheetFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button onClick={handleAdd} disabled={isLoading || soldOut} className="h-12 w-full">
            {soldOut ? 'Variante agotada' : 'Agregar al carrito'}
          </Button>
          <Button variant="ghost" asChild className="h-10 w-full">
            <Link
              to={getProductUrl(product.id, product.name)}
              prefetch="intent"
              onClick={() => onOpenChange(false)}
            >
              Ver detalles completos
              <HugeIcon icon={ArrowRight02Icon} size={14} strokeWidth={2} aria-hidden />
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
