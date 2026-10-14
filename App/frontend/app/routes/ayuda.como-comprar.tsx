// Cómo comprar, tal como funciona la tienda: consultar por WhatsApp, o registrar el pedido en el carrito
// y enviarlo por WhatsApp; después se coordina pago y entrega y se sigue sin cuenta.
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';

import { InfoPage, InfoSection, infoPageHeaders, infoPageMeta, type Crumb } from '~/components/storefront/info-page';
import { INFO_LINK } from '~/components/storefront/store-details';
import { CATALOG_PATH } from '~/lib/catalog-query';
import { loadInfoPage } from '~/lib/info-page.server';
import { STORE_PAGES } from '~/lib/store-pages';

const TRAIL: Crumb[] = [
  { name: 'Inicio', to: '/' },
  { name: 'Ayuda', to: STORE_PAGES.help },
  { name: 'Cómo comprar', to: STORE_PAGES.howToBuy },
];

export const loader = (args: LoaderFunctionArgs) => loadInfoPage(args, STORE_PAGES.howToBuy);
export const headers = infoPageHeaders;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? infoPageMeta({
        title: 'Cómo comprar',
        description: `Cómo comprar en ${data.config.brandName}: consultá por WhatsApp o registrá tu pedido en línea, coordiná pago y entrega y seguí tu pedido sin crear una cuenta.`,
        siteUrl: data.siteUrl,
        canonicalUrl: data.canonicalUrl,
        trail: TRAIL,
      })
    : [];

export default function ComoComprar() {
  const { config } = useLoaderData<typeof loader>();
  const policies = config.policies;

  return (
    <InfoPage
      title="Cómo comprar"
      intro="Podés consultar por WhatsApp o registrar tu pedido en línea. No necesitás crear una cuenta."
      trail={TRAIL}
    >
      <InfoSection title="1. Elegí tus productos">
        <p>
          En el <Link to={CATALOG_PATH} className={INFO_LINK}>catálogo</Link> ves las fotos, las opciones, el precio y la
          disponibilidad de cada producto. Los que dicen «Próximamente» o «Agotado» no se pueden pedir todavía: en su ficha
          podés pedir que te avisemos cuando haya.
        </p>
      </InfoSection>

      <InfoSection title="2. Consultá por WhatsApp">
        <p>
          En la ficha, «Consultar por WhatsApp» abre una conversación con el producto, la opción que elegiste y su enlace.
          Te asesoramos y te mandamos más fotos o videos si los necesitás. El mensaje no se envía solo: lo mandás vos.
        </p>
      </InfoSection>

      <InfoSection title="3. O registrá tu pedido en línea">
        <p>
          Agregá los productos al carrito, completá tu nombre y tu teléfono y elegí entrega o retiro. Si tenés un código de
          descuento, lo podés usar ahí. El pedido queda registrado con un número y se abre WhatsApp con el resumen:
          envialo para que lo atendamos.
        </p>
      </InfoSection>

      <InfoSection title="4. Coordinamos el pago y la entrega">
        {policies && (
          <p>
            <span className="font-medium text-foreground">{policies.payment.title}.</span> {policies.payment.text}
          </p>
        )}
        <p>
          El costo del envío se cotiza aparte.{' '}
          <Link to={STORE_PAGES.paymentsDelivery} className={INFO_LINK}>Ver pagos y entregas</Link>
        </p>
      </InfoSection>

      <InfoSection title="5. Seguí tu pedido">
        <p>
          En <Link to={STORE_PAGES.orders} className={INFO_LINK}>Mis pedidos</Link> ves los pedidos hechos desde este
          navegador, o buscás uno con su número y tu teléfono. El enlace de seguimiento también viene en tu mensaje de
          WhatsApp.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
