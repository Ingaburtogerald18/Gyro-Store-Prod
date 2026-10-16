// Detalle de combo. SSR igual que producto.$id.tsx, para que el link compartido
// por WhatsApp tenga foto, título y precio en la vista previa.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft01Icon, Message01Icon, PackageAddIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { redirect, type HeadersFunction, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { getBrandName, pageTitle } from '~/lib/brand';
import { canonicalLink } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';
import { readStoreFrame, storeReader } from '~/lib/store-reader.server';
import { Link, useLoaderData } from '@remix-run/react';

import { toast } from 'sonner';
import { StorefrontShell } from '~/components/storefront/storefront-shell';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useAppDispatch } from '~/state/hooks';
import { addItem, openCart } from '~/state/slices/cart-slice';
import { buildWhatsappUrl, comboName, formatCordobas, getComboUrl } from "~/lib/formatters";
import { CATALOG_PATH } from '~/lib/catalog-query';
import { trackAddToCart, trackWhatsappOpen } from '~/lib/analytics.client';

export const headers: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
});

// `images` es `unknown[]`: solo se usa si el primer elemento resulta ser un
// string real, nunca se asume la forma.
function firstImageUrl(images: unknown[]): string | null {
  const first = images[0];
  return typeof first === 'string' ? first : null;
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // El slug del nombre o un enlace viejo con el id: el servidor resuelve los dos.
  const ref = params.id ?? '';
  const store = storeReader(context, request);

  // La config es accesoria. Igual que la ficha de producto: una caída es reintentable, no «no existe».
  const [combo, frame] = await Promise.all([store.combo(ref).catch(() => 'error' as const), readStoreFrame(store)]);
  if (combo === 'error') throw new Response('No pudimos cargar este combo. Probá de nuevo en un momento.', { status: 503 });
  if (!combo) throw new Response('Combo no encontrado', { status: 404 });

  const canonicalPath = getComboUrl(combo);
  if (url.pathname !== canonicalPath) throw redirect(`${canonicalPath}${url.search}`, 301);

  return { combo, ...frame, canonicalUrl: `${siteOrigin(request)}${canonicalPath}` };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const combo = data?.combo;
  const brand = getBrandName();
  if (!combo) return [{ title: pageTitle('Combo') }];

  const title = pageTitle(comboName(combo.name));
  const description = `Combo especial en ${brand}, Managua — ${formatCordobas(combo.price ?? 0)}.`;
  // Sin foto propia, el logo: un link sin imagen en WhatsApp se lee como spam.
  const image = firstImageUrl(combo.images) || data.config?.images?.logoStatic || '';

  return [
    { title },
    { name: 'description', content: description },
    canonicalLink(data.canonicalUrl),
    { property: 'og:type', content: 'product' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    ...(image ? [{ property: 'og:image', content: image }, { name: 'twitter:image', content: image }] : []),
    { property: 'og:url', content: data.canonicalUrl },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
  ];
};

export default function ComboDetail() {
  const { combo, config } = useLoaderData<typeof loader>();
  const dispatch = useAppDispatch();

  const image = firstImageUrl(combo.images);
  const price = combo.price ?? 0;
  const name = comboName(combo.name);
  const itemCount = combo.items.length;

  function handleAddToCart() {
    dispatch(
      addItem({
        catalogId: combo.id,
        comboId: combo.id,
        name,
        variantName: 'Combo',
        price,
        image: image ?? '',
        quantity: 1,
      }),
    );
    dispatch(openCart());
    toast.success('Combo agregado al carrito');
    trackAddToCart(combo.id, 1, 'combo');
  }

  function handleWhatsApp() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const message = `Hola, quiero el combo: ${name} — ${formatCordobas(price, config?.currency)}. ${url}`;
    window.open(buildWhatsappUrl(config?.whatsapp ?? '', message), '_blank', 'noopener,noreferrer');
    trackWhatsappOpen('consult');
  }

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
          <Link to={CATALOG_PATH} prefetch="intent">
            <HugeIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden /> Volver al catálogo
          </Link>
        </Button>

        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <div className="aspect-square overflow-hidden rounded-xl bg-muted">
            {image ? (
              <img src={image} alt={name} className="h-full w-full object-contain p-8" />
            ) : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <HugeIcon icon={SparklesIcon} size={40} strokeWidth={2} aria-hidden />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <Badge variant="promo" className="inline-flex items-center gap-1.5">
                <HugeIcon icon={SparklesIcon} size={14} strokeWidth={2} aria-hidden />
                Combo
              </Badge>

              <h1 className="font-heading text-3xl leading-[1.05] font-extrabold tracking-tight text-balance text-foreground sm:text-4xl">
                {name}
              </h1>

              <p className="font-heading text-3xl font-extrabold tracking-tight text-primary-2 tabular-nums">
                {formatCordobas(price, config?.currency)}
              </p>

              {itemCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Incluye {itemCount} artículo{itemCount === 1 ? '' : 's'}.
                </p>
              )}
            </div>

            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleAddToCart} className="h-12 flex-1 text-sm">
                <HugeIcon icon={PackageAddIcon} size={16} strokeWidth={2} aria-hidden />
                Agregar al carrito
              </Button>
              <Button
                variant="whatsappOutline"
                onClick={handleWhatsApp}
                className="h-12 justify-center sm:w-auto sm:px-6"
              >
                <HugeIcon icon={Message01Icon} size={16} strokeWidth={2} aria-hidden />
                Pedir por WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
