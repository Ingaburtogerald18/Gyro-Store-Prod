// Compras por mayor: se cotizan por WhatsApp. Sin mínimos, tablas ni precios mayoristas: no están
// aprobados, así que la página solo pide lo que hace falta para responder con una propuesta.
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';

import { InfoPage, InfoSection, infoPageHeaders, infoPageMeta, type Crumb } from '~/components/storefront/info-page';
import { Button } from '~/components/ui/button';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { CATALOG_PATH } from '~/lib/catalog-query';
import { buildWhatsappUrl } from '~/lib/formatters';
import { trackWhatsappOpen } from '~/lib/analytics.client';
import { loadInfoPage } from '~/lib/info-page.server';
import { STORE_PAGES } from '~/lib/store-pages';

const TRAIL: Crumb[] = [
  { name: 'Inicio', to: '/' },
  { name: 'Compras por mayor', to: STORE_PAGES.wholesale },
];

export const loader = (args: LoaderFunctionArgs) => loadInfoPage(args, STORE_PAGES.wholesale);
export const headers = infoPageHeaders;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? infoPageMeta({
        title: 'Compras por mayor',
        description: `Cotizá compras por mayor con ${data.config.brandName} en Managua: contanos qué productos y cuántas unidades necesitás y te enviamos una propuesta por WhatsApp.`,
        siteUrl: data.siteUrl,
        canonicalUrl: data.canonicalUrl,
        trail: TRAIL,
      })
    : [];

export default function PorMayor() {
  const { config } = useLoaderData<typeof loader>();
  const whatsappUrl = buildWhatsappUrl(
    config.whatsapp,
    `Hola ${config.brandName}, quiero cotizar una compra por mayor. Productos y cantidades: `,
  );

  return (
    <InfoPage
      title="Compras por mayor"
      intro="Atendemos compras por mayor con cotización por WhatsApp."
      trail={TRAIL}
    >
      <InfoSection title="Qué contarnos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Qué productos te interesan (podés mandar el enlace de cada uno).</li>
          <li>Cuántas unidades de cada uno y, si importa, qué colores u opciones.</li>
          <li>Para qué los necesitás y dónde los recibirías.</li>
        </ul>
        <p>Con eso te respondemos con una propuesta.</p>
      </InfoSection>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="whatsapp" asChild className="h-12 px-6 text-base">
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsappOpen('wholesale')}>
            <WhatsappIcon className="size-4" aria-hidden />
            Cotizar por WhatsApp
          </a>
        </Button>
        <Button variant="outline" asChild className="h-12 px-6">
          <Link to={CATALOG_PATH}>Ver el catálogo</Link>
        </Button>
      </div>
    </InfoPage>
  );
}
