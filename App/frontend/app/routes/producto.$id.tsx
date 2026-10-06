// Ficha de producto. La URL lleva slug + id (`/producto/kz-edx-pro--<uuid>`):
// el slug es para humanos y buscadores, el id es lo que resuelve el producto,
// así el nombre puede cambiar sin romper links viejos.
//
// El dato se carga en el SERVIDOR para que el título, la descripción y la foto
// estén en el HTML (Open Graph al compartir por WhatsApp).
import { HugeIcon } from "~/components/ui/icon";
import { ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from 'react';
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { getBrandName, pageTitle } from '~/lib/brand';
import { useLoaderData } from '@remix-run/react';

import { toast } from 'sonner';
import type { CatalogDetail, CatalogProduct } from '@shared/schemas';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { ProductCarousel } from '~/components/product/product-carousel';
import { ProductDetailTabs } from '~/components/product/product-detail-tabs';
import { ProductGallery } from '~/components/product/product-gallery';
import { ProductTopNav } from '~/components/product/product-top-nav';
import { MobileBuyBar } from '~/components/product/mobile-buy-bar';
import { QuantityStepper } from '~/components/product/quantity-stepper';
import { StockIndicator } from '~/components/product/stock-indicator';
import { TrustBox } from '~/components/product/trust-box';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import {
  VariantPicker,
  pickableAxes,
  autoSelection,
  resolveVariant,
  variantLabel,
  type VariantSelection,
} from '~/components/product/variant-picker';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import type { StoreConfig } from '~/store/api/sessionApi';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { buildWhatsappUrl, formatCordobas, getProductUrl, htmlToText } from "~/lib/formatters";
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
  let config: StoreConfig | null = null;

  try {
    const [detailRes, catalogRes, configRes] = await Promise.all([
      fetch(`${origin}/api/catalog/${productId}`),
      fetch(`${origin}/api/catalog`),
      fetch(`${origin}/api/config`),
    ]);
    if (detailRes.ok) product = (await detailRes.json()) as CatalogDetail;
    if (catalogRes.ok) {
      const items = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
      // "Tal vez te pueda interesar" son productos de LA MISMA categoría; solo si
      // esa gama es muy corta se rellena con el resto del catálogo. Antes cortaba
      // los 12 primeros sin filtrar, así que a una ficha de audífonos le salían
      // accesorios de moto.
      const others = items.filter((p) => p.id !== productId);
      const category = product?.category;
      const sameCategory = category ? others.filter((p) => p.category === category) : [];
      related = (sameCategory.length >= 4 ? sameCategory : others).slice(0, 12);
    }
    if (configRes.ok) config = (await configRes.json()) as StoreConfig;
  } catch {
    // Relacionados y config son accesorios: si fallan, la ficha sale igual.
  }

  if (!product) {
    throw new Response('Producto no encontrado', { status: 404 });
  }

  return { product, related, config, origin };
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
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NIO',
          price: product.price,
          availability:
            product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: `${data?.origin ?? ''}${getProductUrl(product.id, product.name)}`,
        },
      },
    },
  ];
};

export default function ProductDetail() {
  const { product, related, config } = useLoaderData<typeof loader>();
  const dispatch = useAppDispatch();
  // Los ejes con una sola opción disponible ya vienen elegidos: obligar a tocar
  // la única opción posible era un clic de más y un error al agregar.
  const [selection, setSelection] = useState<VariantSelection>(() =>
    autoSelection(product.axes, product.variants),
  );
  const [quantity, setQuantity] = useState(1);
  const [showMissing, setShowMissing] = useState(false);
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
  const compareAt = product.compareAtPrice ?? 0;
  const onSale = compareAt > product.price;
  const discountPct = onSale ? Math.round((1 - product.price / compareAt) * 100) : 0;

  // Todos los ejes con opciones deben estar elegidos antes de agregar.
  const axes = pickableAxes(product.axes);
  const missingAxis = axes.find((a) => !selection[a.key]);
  const variantName = variantLabel(product.axes, selection);

  // La combinación elegida manda sobre el producto: su precio y su stock son
  // los que aplican. Mientras falte elegir un eje, se muestra el del producto.
  const variant = resolveVariant(product.axes, product.variants, selection);
  const price = variant?.price ?? product.price;
  const stock = variant?.stock ?? product.stock;
  const soldOut = stock <= 0;
  const description = htmlToText(product.description);

  const colorAxis = product.axes.find((a) => a.isColor);
  const selectedColor = colorAxis ? selection[colorAxis.key] : undefined;
  const activeImages = useMemo(() => {
    if (selectedColor && product.colorImages?.[selectedColor]?.length) {
      return product.colorImages[selectedColor];
    }
    return product.images;
  }, [selectedColor, product.colorImages, product.images]);

  function handleAddToCart() {
    if (missingAxis) {
      // Se marca el eje en la ficha y se lleva la vista hasta él: con la barra
      // fija del móvil el selector puede estar fuera de pantalla.
      setShowMissing(true);
      document.getElementById("variantes")?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error(`Elegí ${missingAxis.label || missingAxis.key} antes de agregar.`);
      return;
    }
    if (soldOut) return;
    dispatch(
      addItem({
        catalogId: product.id,
        name: product.name,
        variantName,
        price,
        image: activeImages[0] ?? '',
        quantity,
      }),
    );
    dispatch(openCart());
  }

  function handleWhatsApp() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const variantText = variantName !== 'Estándar' ? ` (${variantName})` : '';
    const qtyText = quantity > 1 ? `${quantity}× ` : '';
    const message = soldOut
      ? `Hola, quiero que me avisen cuando vuelva a haber stock de: ${product.name}. ${url}`
      : `Hola, quiero: ${qtyText}${product.name}${variantText} — ${formatCordobas(price * quantity, currency)}. ${url}`;
    window.open(
      buildWhatsappUrl(config?.whatsapp ?? '', message),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <StorefrontShell>
      <main key="product-detail" className="mx-auto w-full max-w-7xl px-4">
        <ProductTopNav 
          productName={product.name} 
          categoryName={product.category}
          categoryId={product.categoryId ?? undefined}
        />

        <div className="grid gap-6 py-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-5">
            {/* En móvil, nombre y precio identifican el producto antes de la foto. */}
            <div className="min-w-0 space-y-3 md:col-start-2 md:row-start-1">
              {onSale && (
                <Badge variant="promo" className="tabular-nums">−{discountPct}%</Badge>
              )}
              {product.isPromo && !onSale && <Badge variant="promo">Oferta</Badge>}

                <h1 className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-balance text-foreground lg:text-3xl">
                  {product.name}
                </h1>
                {description && (
                  <p className="line-clamp-2 text-base leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-heading text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
                    {formatCordobas(price, currency)}
                  </span>
                  {onSale && (
                    <span className="text-base text-muted-foreground line-through tabular-nums">
                      {formatCordobas(compareAt, currency)}
                    </span>
                  )}
                </div>
              <StockIndicator stock={stock} />
            </div>

          <div className="min-w-0 md:sticky md:top-28 md:col-start-1 md:row-start-1 md:row-span-2 md:self-start">
            <ProductGallery images={activeImages} name={product.name} soldOut={soldOut} />
          </div>

          <div className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-5 md:col-start-2 md:row-start-2 md:self-start">
            {axes.length > 0 && (
                <div id="variantes" className="scroll-mt-32">
                  <VariantPicker
                    layout="rows"
                    axes={product.axes}
                    variants={product.variants}
                    selection={selection}
                    onChange={(next) => {
                      setSelection(next);
                      setShowMissing(false);
                    }}
                    missingKey={showMissing ? missingAxis?.key : undefined}
                  />
                </div>
            )}

            {axes.length > 0 && <Separator className="bg-border" />}
            <QuantityStepper value={quantity} onChange={setQuantity} max={stock} />

            {quantity > 1 && (
              <p className="text-sm text-muted-foreground">
                Total {quantity} uds:{' '}
                <span className="font-bold text-foreground tabular-nums">
                  {formatCordobas(price * quantity, currency)}
                </span>
              </p>
            )}

            <div id="product-buy-actions" className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <Button
                onClick={handleAddToCart}
                disabled={soldOut}
                className="h-12 min-h-12 w-full shrink-0 text-base sm:flex-1 md:flex-none lg:flex-1 lg:text-sm"
              >
                <HugeIcon icon={ShoppingCart02Icon} size={16} strokeWidth={2} aria-hidden />
                {soldOut ? 'Agotado' : 'Agregar al carrito'}
              </Button>
              <Button
                variant="whatsappOutline"
                onClick={handleWhatsApp}
                className="h-12 min-h-12 w-full shrink-0 justify-center text-base sm:w-auto sm:px-4 md:w-full lg:w-auto lg:text-sm"
              >
                <WhatsappIcon className="h-4 w-4" />
                {soldOut ? 'Avisame' : 'Pedir por WhatsApp'}
              </Button>
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
        price={formatCordobas(price * quantity, currency)}
        disabled={soldOut}
        addLabel={soldOut ? 'Agotado' : 'Agregar'}
        onAdd={handleAddToCart}
        onWhatsApp={handleWhatsApp}
      />
    </StorefrontShell>
  );
}
