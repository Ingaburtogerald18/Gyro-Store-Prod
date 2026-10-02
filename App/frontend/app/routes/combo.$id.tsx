// Detalle de combo (doc 09 ítem 46). SSR igual que producto.$id.tsx (para que
// el link compartido por WhatsApp tenga foto/título/precio en el preview).
//
// Reciclaje de v1 (routes/combo.$id.tsx): esa versión mostraba el desglose de
// productos incluidos (combo.products con nombre/precio/imagen por ítem) y el
// ahorro vs. comprarlos separados (combo.savings), apoyada en componentes que
// tampoco existen en v2 (DetailHeader, PurchaseCard, MobileBuyBar, etc.). Acá
// se reescribe simplificado siguiendo el patrón REAL de producto.$id.tsx (el
// único PDP que ya existe en v2): `comboSchema.items`/`.images` son
// `z.array(z.unknown())` — forma sin definir (TODO en shared/schemas.ts) — así
// que esta página no puede desglosar contenido ni calcular ahorro; muestra el
// combo como una unidad (nombre, precio, imagen si hay una string válida,
// cantidad de artículos). El carrito YA sabe manejar combos (cartSlice.ts,
// `comboId`) — no hizo falta tocar nada ahí.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft01Icon, Message01Icon, PackageAddIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { getBrandName, pageTitle } from '~/lib/brand';
import { Link, useLoaderData } from '@remix-run/react';

import { toast } from 'sonner';
import type { Combo } from '@shared/schemas';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { StoreConfig } from '~/store/api/sessionApi';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { buildWhatsappUrl, formatCordobas, getComboUrl } from "~/lib/formatters";

export const headers: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
});

// `images` es `unknown[]`: solo se usa si el primer elemento resulta ser un
// string real, nunca se asume la forma.
function firstImageUrl(images: unknown[]): string | null {
  const first = images[0];
  return typeof first === 'string' ? first : null;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const raw = params.id ?? '';
  const comboId = raw.split('--').pop() ?? '';

  let combo: Combo | null = null;
  let config: StoreConfig | null = null;

  try {
    const [comboRes, configRes] = await Promise.all([
      fetch(`${origin}/api/combos/${comboId}`),
      fetch(`${origin}/api/config`),
    ]);
    if (comboRes.ok) combo = (await comboRes.json()) as Combo;
    if (configRes.ok) config = (await configRes.json()) as StoreConfig;
  } catch {
    // Si la API falla, se responde 404 abajo en vez de romper el render.
  }

  if (!combo) {
    throw new Response('Combo no encontrado', { status: 404 });
  }

  return { combo, config, origin };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const combo = data?.combo;
  const brand = getBrandName();
  if (!combo) return [{ title: pageTitle('Combo') }];

  const name = combo.name ?? 'Combo especial';
  const title = pageTitle(name);
  const description = `Combo especial en ${brand}, Managua — ${formatCordobas(combo.price ?? 0)}.`;
  // Si el combo no trae foto propia se cae al logo: un link sin imagen en
  // WhatsApp se lee como spam.
  const image =
    firstImageUrl(combo.images) ||
    data?.config?.images?.logoStatic ||
    `${data?.origin ?? ''}/logo.jpg`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'product' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: image },
    { property: 'og:url', content: `${data?.origin ?? ''}${getComboUrl(combo.id, name)}` },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: image },
  ];
};

export default function ComboDetail() {
  const { combo, config } = useLoaderData<typeof loader>();
  const dispatch = useAppDispatch();

  const image = firstImageUrl(combo.images);
  const price = combo.price ?? 0;
  const name = combo.name ?? 'Combo especial';
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
  }

  function handleWhatsApp() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const message = `Hola, quiero el combo: ${name} — ${formatCordobas(price, config?.currency)}. ${url}`;
    window.open(buildWhatsappUrl(config?.whatsapp ?? '', message), '_blank', 'noopener,noreferrer');
  }

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
          <Link to="/#catalogo" prefetch="intent">
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
                className="h-12 justify-center rounded-md sm:w-auto sm:px-6"
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
