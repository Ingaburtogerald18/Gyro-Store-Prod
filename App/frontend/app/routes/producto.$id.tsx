// Ficha de producto. La URL lleva slug + id (`/producto/kz-edx-pro--<uuid>`):
// el slug es para humanos y buscadores, el id es lo que resuelve el producto,
// así el nombre puede cambiar sin romper links viejos.
//
// El dato se carga en el SERVIDOR para que el título, la descripción y la foto
// estén en el HTML (Open Graph al compartir por WhatsApp).
import { HugeIcon } from "~/components/ui/icon";
import { ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { getBrandName, pageTitle } from '~/lib/brand';
import { useLoaderData } from '@remix-run/react';
import { useReducedMotion } from 'framer-motion';

import type { CatalogDetail, CatalogProduct } from '@shared/schemas';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { ProductCarousel } from '~/components/product/product-carousel';
import { ProductDetailTabs } from '~/components/product/product-detail-tabs';
import { ProductGallery } from '~/components/product/product-gallery';
import { ProductTopNav } from '~/components/product/product-top-nav';
import { MobileBuyBar } from '~/components/product/mobile-buy-bar';
import { QuantityStepper } from '~/components/product/quantity-stepper';
import { PurchaseStatus, addLabel, cartItemFor } from '~/components/product/purchase-panel';
import { TrustBox } from '~/components/product/trust-box';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { VariantPicker } from '~/components/product/variant-picker';
import { autoSelection, pickableAxes, purchaseState, variantLabel, type VariantSelection } from '~/lib/purchase';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import type { StoreConfig } from '~/store/api/sessionApi';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { buildWhatsappUrl, formatCordobas, getProductUrl, htmlToText, productWhatsappMessage } from "~/lib/formatters";
import { trackProductView } from '~/lib/analytics.client';

export const headers: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
});

export async function loader({ params, request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const raw = params.id ?? '';
  const productId = raw.split('--').pop() ?? '';

  let product: CatalogDetail | null = null;
  let related: CatalogProduct[] = [];
  // El catálogo completo viaja con la ficha: header, footer y conteos leen el
  // mismo dato que el servidor ya pidió (sin repetir la consulta en el cliente).
  let products: CatalogProduct[] = [];
  let config: StoreConfig | null = null;
  // «No existe» y «no se pudo cargar» son cosas distintas: solo un 404 real
  // del API es «Producto no encontrado»; una caída es un error reintentable.
  let detailStatus = 0;

  try {
    const [detailRes, catalogRes, configRes] = await Promise.all([
      fetch(`${origin}/api/catalog/${productId}`),
      fetch(`${origin}/api/catalog`).catch(() => null),
      fetch(`${origin}/api/config`).catch(() => null),
    ]);
    detailStatus = detailRes.status;
    if (detailRes.ok) product = (await detailRes.json()) as CatalogDetail;
    if (catalogRes?.ok) {
      const items = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
      products = items;
      // "Tal vez te pueda interesar": productos de la misma categoría; solo si
      // son pocos se completa con el resto del catálogo.
      const others = items.filter((p) => p.id !== productId);
      const category = product?.category;
      const sameCategory = category ? others.filter((p) => p.category === category) : [];
      // Primero lo que se puede comprar: no se llena con agotados si hay
      // alternativas disponibles.
      const pool = sameCategory.length >= 4 ? sameCategory : others;
      related = [...pool]
        .sort((a, b) => Number(b.availability === 'available') - Number(a.availability === 'available'))
        .slice(0, 12);
    }
    if (configRes?.ok) config = (await configRes.json()) as StoreConfig;
  } catch {
    // Relacionados y config son accesorios: si fallan, la ficha sale igual.
  }

  if (!product) {
    if (detailStatus === 404) throw new Response('Producto no encontrado', { status: 404 });
    throw new Response('No pudimos cargar este producto. Probá de nuevo en un momento.', { status: 503 });
  }

  return { product, related, products, config, origin };
}

// Datos estructurados de la oferta. Solo «InStock» con stock verificado: sin
// datos de bodega no se afirma disponibilidad. Con precios distintos por
// variante, rango (AggregateOffer) en vez de un precio único engañoso.
function productOffers(product: CatalogDetail, url: string) {
  const availability =
    product.availability === 'available'
      ? 'https://schema.org/InStock'
      : product.availability === 'sold_out'
        ? 'https://schema.org/OutOfStock'
        : undefined;
  const extra = availability ? { availability } : {};
  const prices = product.variants.map((v) => v.price);
  if (product.priceFrom && prices.length) {
    return { '@type': 'AggregateOffer', priceCurrency: 'NIO', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length, url, ...extra };
  }
  return { '@type': 'Offer', priceCurrency: 'NIO', price: product.price, url, ...extra };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const product = data?.product;
  const brand = getBrandName();
  if (!product) return [{ title: pageTitle('Producto') }];

  const title = pageTitle(product.name);
  const description =
    product.description?.replace(/<[^>]*>?/gm, '').slice(0, 160) ??
    `${product.name} disponible en ${brand}, Managua.`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'product' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    ...(product.images[0] ? [{ property: 'og:image', content: product.images[0] }] : []),
    { property: 'og:url', content: `${data?.origin ?? ''}${getProductUrl(product.id, product.name)}` },
    { name: 'twitter:card', content: 'summary_large_image' },
    // Datos estructurados: es lo que hace que Google muestre precio y
    // disponibilidad en el resultado de búsqueda. Sale del mismo dato que ya
    // pinta la página, así que no puede desincronizarse.
    {
      'script:ld+json': {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        image: product.images,
        description,
        offers: productOffers(product, `${data?.origin ?? ''}${getProductUrl(product.id, product.name)}`),
      },
    },
  ];
};

export default function ProductDetail() {
  const { product, related, config } = useLoaderData<typeof loader>();
  const dispatch = useAppDispatch();
  const reduce = useReducedMotion();
  // Los ejes con una sola opción válida ya vienen elegidos; con varias, la
  // persona elige explícitamente.
  const [selection, setSelection] = useState<VariantSelection>(() =>
    autoSelection(product.axes, product.variants),
  );
  const [quantity, setQuantity] = useState(1);
  const [showMissing, setShowMissing] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Al pasar de una ficha a otra (relacionados) Remix reusa el componente: la
  // selección y la cantidad del producto anterior no deben arrastrarse.
  const [shownId, setShownId] = useState(product.id);
  if (shownId !== product.id) {
    setShownId(product.id);
    setSelection(autoSelection(product.axes, product.variants));
    setQuantity(1);
    setShowMissing(false);
  }

  // Telemetría: una vista de producto por ficha abierta. El track descarta la
  // emisión si no hay consentimiento o si es staff (ver analytics.client).
  useEffect(() => {
    trackProductView(product.id);
  }, [product.id]);

  const currency = config?.currency;
  const axes = pickableAxes(product.axes);
  const state = purchaseState({ axes: product.axes, variants: product.variants, selection });
  const variant = 'variant' in state ? state.variant : null;
  const maxQuantity = state.kind === 'ready' ? state.maxQuantity : 1;
  // Cambiar a una variante con menos unidades no deja una cantidad imposible.
  const safeQuantity = Math.min(quantity, Math.max(1, maxQuantity));

  // La combinación elegida manda: su precio y su promoción. Sin elegir, el
  // precio del producto («Desde» si las variantes no valen lo mismo).
  const price = variant?.price ?? product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;
  const onSale = Boolean(compareAt && compareAt > price);
  const discountPct = onSale && compareAt ? Math.round((1 - price / compareAt) * 100) : 0;
  const showFrom = !variant && product.priceFrom;
  const promoNote = !variant && product.promoScope === 'some';
  const showPromoBadge = onSale || (variant ? variant.isPromo : product.promoScope === 'all');
  const description = htmlToText(product.description);
  const selectedLabel = variantLabel(product.axes, selection);

  const colorAxis = product.axes.find((a) => a.isColor);
  const selectedColor = colorAxis ? selection[colorAxis.key] : undefined;
  const activeImages = useMemo(() => {
    if (selectedColor && product.colorImages?.[selectedColor]?.length) {
      return product.colorImages[selectedColor];
    }
    return product.images;
  }, [selectedColor, product.colorImages, product.images]);

  function goToPicker() {
    setShowMissing(true);
    // Con la barra fija del móvil el selector puede estar fuera de pantalla.
    pickerRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    pickerRef.current?.querySelector<HTMLElement>('[aria-pressed]')?.focus({ preventScroll: true });
  }

  function handleAddToCart() {
    if (state.kind === 'missing' || state.kind === 'invalid') {
      goToPicker();
      return;
    }
    if (state.kind !== 'ready') return;
    dispatch(addItem(cartItemFor(product, state.variant, activeImages[0], safeQuantity)));
    dispatch(openCart());
  }

  function handleWhatsApp() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const message =
      state.kind === 'ready'
        ? productWhatsappMessage({
            kind: 'order',
            name: product.name,
            variant: selectedLabel || undefined,
            quantity: safeQuantity,
            total: formatCordobas(price * safeQuantity, currency),
            url,
          })
        : productWhatsappMessage({
            kind: state.kind === 'sold_out' || state.kind === 'unknown' ? 'availability' : 'info',
            name: product.name,
            variant: selectedLabel || undefined,
            url,
          });
    window.open(buildWhatsappUrl(config?.whatsapp ?? '', message), '_blank', 'noopener,noreferrer');
  }

  // Agotado o sin stock verificable: la acción principal es consultar.
  const consultOnly = state.kind === 'sold_out' || state.kind === 'unknown';
  const whatsappLabel = state.kind === 'ready' ? 'Pedir por WhatsApp' : 'Consultar por WhatsApp';

  return (
    <StorefrontShell>
      <main key="product-detail" className="mx-auto w-full max-w-7xl px-4">
        <ProductTopNav
          productName={product.name}
          categoryName={product.category}
          categoryId={product.categoryId ?? undefined}
        />

        <div className="grid gap-5 py-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-5 md:py-6">
          {/* En móvil, nombre y precio identifican el producto antes de la foto. */}
          <div className="min-w-0 space-y-2.5 md:col-start-2 md:row-start-1">
            {showPromoBadge && (
              <Badge variant="promo" className="tabular-nums">{onSale ? `−${discountPct}%` : 'Oferta'}</Badge>
            )}
            <h1 className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-balance text-foreground lg:text-3xl">
              {product.name}
            </h1>
            {description && (
              <p className="line-clamp-2 text-base leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-heading text-3xl font-extrabold tracking-tight text-primary-2 tabular-nums">
                {showFrom && <span className="mr-1.5 text-base font-semibold text-muted-foreground">Desde</span>}
                {formatCordobas(price, currency)}
              </span>
              {onSale && compareAt && (
                <span className="text-base text-muted-foreground line-through tabular-nums">
                  <span className="sr-only">Antes </span>
                  {formatCordobas(compareAt, currency)}
                </span>
              )}
            </div>
            {promoNote && (
              <p className="text-sm font-medium text-foreground">
                Oferta en algunas opciones: elegí una para ver su precio.
              </p>
            )}
          </div>

          <div className="min-w-0 md:sticky md:top-28 md:col-start-1 md:row-start-1 md:row-span-2 md:self-start">
            <ProductGallery images={activeImages} name={product.name} soldOut={state.kind === 'sold_out'} />
          </div>

          <div className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-5 md:col-start-2 md:row-start-2 md:self-start">
            {axes.length > 0 && (
              <div id="variantes" ref={pickerRef} className="scroll-mt-32">
                <VariantPicker
                  layout="rows"
                  idPrefix="ficha"
                  axes={product.axes}
                  variants={product.variants}
                  selection={selection}
                  onChange={(next) => {
                    setSelection(next);
                    setShowMissing(false);
                  }}
                  missingKey={showMissing && state.kind === 'missing' ? state.axis.key : undefined}
                />
              </div>
            )}

            <PurchaseStatus
              state={state}
              canClear={axes.length > 0 && Object.keys(selection).length > 0}
              onClear={() => setSelection({})}
            />

            {state.kind === 'ready' && (
              <>
                {axes.length > 0 && <Separator className="bg-border" />}
                <QuantityStepper value={safeQuantity} onChange={setQuantity} max={maxQuantity} />
                {safeQuantity > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Total de {safeQuantity} unidades:{' '}
                    <span className="font-bold text-foreground tabular-nums">
                      {formatCordobas(price * safeQuantity, currency)}
                    </span>
                  </p>
                )}
              </>
            )}

            <div id="product-buy-actions" className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              {consultOnly ? (
                <Button
                  variant="whatsapp"
                  onClick={handleWhatsApp}
                  className="h-12 min-h-12 w-full text-base sm:flex-1 md:flex-none lg:flex-1"
                >
                  <WhatsappIcon className="size-4" />
                  Consultar por WhatsApp
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleAddToCart}
                    className="h-12 min-h-12 w-full shrink-0 text-base sm:flex-1 md:flex-none lg:flex-1"
                  >
                    <HugeIcon icon={ShoppingCart02Icon} size={18} strokeWidth={2} aria-hidden />
                    {addLabel(state)}
                  </Button>
                  <Button
                    variant="whatsappOutline"
                    onClick={handleWhatsApp}
                    className="h-12 min-h-12 w-full shrink-0 justify-center text-base sm:w-auto sm:px-4 md:w-full lg:w-auto"
                  >
                    <WhatsappIcon className="size-4" />
                    {whatsappLabel}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 border-t border-border py-6 sm:space-y-8 sm:py-8">
          {(description || product.specs.length > 0) && (
            <section aria-labelledby="product-details-heading" className="min-w-0 space-y-4">
              <h2 id="product-details-heading" className="font-heading text-xl font-bold text-foreground">
                {description ? 'Detalles del producto' : 'Especificaciones'}
              </h2>
              <ProductDetailTabs description={description} specs={product.specs} />
            </section>
          )}
          <TrustBox />
        </div>

        {related.length > 0 && (
          <div className="mt-6 sm:mt-12">
            <ProductCarousel
              title="También te puede gustar"
              products={related}
              variant="showcase"
            />
          </div>
        )}

        {/* Aire al pie para que la barra fija no tape el final del contenido. */}
        <div className="h-24 md:hidden" aria-hidden />
      </main>

      <MobileBuyBar
        key={product.id}
        buyActionsId="product-buy-actions"
        name={product.name}
        price={`${showFrom ? 'Desde ' : ''}${formatCordobas(price * (state.kind === 'ready' ? safeQuantity : 1), currency)}`}
        mode={consultOnly ? 'consult' : 'add'}
        addLabel={addLabel(state, { short: true })}
        onAdd={handleAddToCart}
        onWhatsApp={handleWhatsApp}
      />
    </StorefrontShell>
  );
}
