// Ficha de producto. La URL lleva slug + id (`/producto/kz-edx-pro--<uuid>`):
// el slug es para humanos y buscadores, el id es lo que resuelve el producto,
// así el nombre puede cambiar sin romper links viejos.
//
// El dato se carga en el SERVIDOR para que el título, la descripción y la foto
// estén en el HTML (Open Graph al compartir por WhatsApp).
import { HugeIcon } from "~/components/ui/icon";
import { Message01Icon, ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
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
import {
  VariantPicker,
  pickableAxes,
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
import { buildWhatsappUrl, formatCordobas, getProductUrl } from "~/lib/formatters";
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
  const [selection, setSelection] = useState<VariantSelection>({});
  const [quantity, setQuantity] = useState(1);

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

  function handleAddToCart() {
    if (missingAxis) {
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
        image: product.images[0] ?? '',
        quantity,
      }),
    );
    dispatch(openCart());
    toast.success(
      quantity > 1 ? `Agregado al carrito (${quantity} uds)` : 'Agregado al carrito',
    );
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
      <main className="mx-auto max-w-7xl px-4">
        <ProductTopNav 
          productName={product.name} 
          categoryName={product.category}
          categoryId={product.categoryId ?? undefined}
        />

        <div className="grid gap-8 py-6 md:grid-cols-2 md:gap-12">
          {/* Galería sticky en desktop (header h-16 + top nav h-12 = top-32),
              con el trust box debajo. En móvil el trust box baja después del
              bloque de compra (ver copia más abajo). */}
          <div className="space-y-4 md:sticky md:top-32 md:self-start">
            <ProductGallery images={product.images} name={product.name} soldOut={soldOut} />
            <div className="hidden md:block">
              <TrustBox />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              {onSale && (
                <Badge variant="promo" className="tabular-nums">−{discountPct}%</Badge>
              )}
              {product.isPromo && !onSale && <Badge variant="promo">Oferta</Badge>}

              <h1 className="text-2xl leading-tight font-black tracking-tight text-balance text-foreground sm:text-4xl">
                {product.name}
              </h1>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-primary-2 tabular-nums">
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

            {axes.length > 0 && (
              <>
                <Separator className="bg-border" />
                <VariantPicker
                  axes={product.axes}
                  variants={product.variants}
                  selection={selection}
                  onChange={setSelection}
                />
              </>
            )}

            <QuantityStepper value={quantity} onChange={setQuantity} max={stock} />

            {quantity > 1 && (
              <p className="text-sm text-muted-foreground">
                Total {quantity} uds:{' '}
                <span className="font-bold text-foreground tabular-nums">
                  {formatCordobas(price * quantity, currency)}
                </span>
              </p>
            )}

            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleAddToCart}
                disabled={soldOut}
                className="h-12 flex-1 text-sm"
              >
                <HugeIcon icon={ShoppingCart02Icon} size={16} strokeWidth={2} aria-hidden />
                {soldOut ? 'Agotado' : 'Agregar al carrito'}
              </Button>
              <Button
                variant="whatsappOutline"
                onClick={handleWhatsApp}
                className="h-12 justify-center rounded-md sm:w-auto sm:px-6"
              >
                <HugeIcon icon={Message01Icon} size={16} strokeWidth={2} aria-hidden />
                {soldOut ? 'Avisame' : 'Pedir por WhatsApp'}
              </Button>
            </div>

            {/* Trust box en móvil: después del bloque de compra, antes de los
                tabs — en desktop vive bajo la galería sticky. */}
            <div className="md:hidden">
              <TrustBox />
            </div>

            <Separator className="bg-border" />
            <ProductDetailTabs
              description={product.description?.replace(/<[^>]*>?/gm, '') ?? ''}
              specs={product.specs}
            />
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-12">
            <ProductCarousel
              title="Tal vez te pueda interesar"
              products={related}
              variant="showcase"
            />
          </div>
        )}

        {/* Aire al pie para que la barra fija no tape el final del contenido. */}
        <div className="h-24 md:hidden" aria-hidden />
      </main>

      <MobileBuyBar
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
