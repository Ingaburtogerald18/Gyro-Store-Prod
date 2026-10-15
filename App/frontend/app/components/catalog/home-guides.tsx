// Cierre de la portada: cómo comprar en tres pasos y la salida a mayoreo. Resúmenes cortos que llevan a
// Ayuda y Por mayor; las condiciones viven allá, no se repiten acá.
import { Link } from '@remix-run/react';

import { INFO_LINK } from '~/components/storefront/store-details';
import { Button } from '~/components/ui/button';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useStoreConfig } from '~/hooks/use-store-config';
import { buildWhatsappUrl } from '~/lib/formatters';
import { trackWhatsappOpen } from '~/lib/analytics.client';
import { STORE_PAGES } from '~/lib/store-pages';

const STEPS = [
  { title: 'Elegí tus productos', text: 'Mirá fotos, opciones, precio y disponibilidad en el catálogo.' },
  { title: 'Consultá o registrá tu pedido', text: 'Escribinos por WhatsApp o agregá los productos al carrito y envianos el pedido.' },
  { title: 'Coordinamos pago y entrega', text: 'Delivery en Managua, envío por Cargo Trans al resto del país o retiro.' },
];

export function HomeGuides() {
  const config = useStoreConfig();
  const brand = config?.brandName ?? '';
  const wholesaleUrl = buildWhatsappUrl(
    config?.whatsapp ?? '',
    `Hola ${brand}, quiero cotizar una compra por mayor. Productos y cantidades: `.replace(/\s+,/, ','),
  );

  return (
    <>
      <section aria-labelledby="home-how-to-buy" className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <h2 id="home-how-to-buy" className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Cómo comprar
        </h2>
        <ol className="mt-4 grid gap-5 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="space-y-1">
              <p className="font-semibold text-foreground">
                {index + 1}. {step.title}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          <Link to={STORE_PAGES.howToBuy} className={INFO_LINK}>Ver cómo comprar</Link>
          <span className="text-muted-foreground"> · </span>
          <Link to={STORE_PAGES.paymentsDelivery} className={INFO_LINK}>Pagos y entregas</Link>
        </p>
      </section>

      <section aria-labelledby="home-wholesale" className="mx-auto max-w-7xl px-4 pb-6 md:pb-8">
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 id="home-wholesale" className="text-lg font-semibold text-foreground">¿Comprás por mayor?</h2>
            <p className="text-sm text-muted-foreground">
              Cotizamos por WhatsApp según los productos y las cantidades que necesitás.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="whatsappOutline" asChild className="h-12 px-5">
              <a href={wholesaleUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsappOpen('wholesale')}>
                <WhatsappIcon aria-hidden className="size-4 shrink-0" />
                Cotizar por WhatsApp
              </a>
            </Button>
            <Link to={STORE_PAGES.wholesale} className={`${INFO_LINK} text-sm`}>Ver compras por mayor</Link>
          </div>
        </div>
      </section>
    </>
  );
}
