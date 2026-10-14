// Pagos y entregas desde Configuración → Atención y Negocio: el destino principal de estas condiciones;
// ficha, carrito y Ayuda muestran resúmenes y enlazan acá.
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

import { InfoPage, InfoSection, infoPageHeaders, infoPageMeta, type Crumb } from '~/components/storefront/info-page';
import { BusinessHoursList, PickupPoint } from '~/components/storefront/store-details';
import { loadInfoPage } from '~/lib/info-page.server';
import { STORE_PAGES } from '~/lib/store-pages';

const TRAIL: Crumb[] = [
  { name: 'Inicio', to: '/' },
  { name: 'Ayuda', to: STORE_PAGES.help },
  { name: 'Pagos y entregas', to: STORE_PAGES.paymentsDelivery },
];

export const loader = (args: LoaderFunctionArgs) => loadInfoPage(args, STORE_PAGES.paymentsDelivery);
export const headers = infoPageHeaders;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? infoPageMeta({
        title: 'Pagos y entregas',
        description: `Cómo se paga y se entrega en ${data.config.brandName}: delivery en Managua, envíos al resto de Nicaragua por Cargo Trans y retiro coordinado.`,
        siteUrl: data.siteUrl,
        canonicalUrl: data.canonicalUrl,
        trail: TRAIL,
      })
    : [];

export default function PagosYEntregas() {
  const { config } = useLoaderData<typeof loader>();
  const policies = config.policies;
  const hasHours = (config.businessHours?.length ?? 0) > 0;

  return (
    <InfoPage title="Pagos y entregas" trail={TRAIL}>
      {policies && (
        <>
          <InfoSection id="pago" title={policies.payment.title}>
            <p>{policies.payment.text}</p>
          </InfoSection>
          <InfoSection id="managua" title={policies.managua.title}>
            <p>{policies.managua.text}</p>
          </InfoSection>
          <InfoSection id="resto-del-pais" title={policies.outside.title}>
            <p>{policies.outside.text}</p>
          </InfoSection>
          <InfoSection id="retiro" title={policies.pickup.title}>
            <p>{policies.pickup.text}</p>
            <PickupPoint />
          </InfoSection>
          {policies.shippingNote && (
            <InfoSection id="costo-del-envio" title="Costo del envío">
              <p>{policies.shippingNote}</p>
            </InfoSection>
          )}
        </>
      )}
      {hasHours && (
        <InfoSection id="horario" title="Horario de atención">
          <BusinessHoursList />
          <p>Es el horario en que te atendemos; la entrega y el retiro se coordinan por WhatsApp.</p>
        </InfoSection>
      )}
    </InfoPage>
  );
}
