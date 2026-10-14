// Índice de Ayuda: a dónde ir para cada duda y respuestas cortas con datos de Configuración. Las
// explicaciones completas viven en una sola página cada una; acá solo el resumen y el enlace.
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';

import { InfoPage, InfoSection, infoPageHeaders, infoPageMeta, type Crumb } from '~/components/storefront/info-page';
import { BusinessHoursList, INFO_LINK, PickupPoint } from '~/components/storefront/store-details';
import { loadInfoPage } from '~/lib/info-page.server';
import { STORE_PAGES } from '~/lib/store-pages';

const TRAIL: Crumb[] = [
  { name: 'Inicio', to: '/' },
  { name: 'Ayuda', to: STORE_PAGES.help },
];

export const loader = ({ request }: LoaderFunctionArgs) => loadInfoPage(request, STORE_PAGES.help);
export const headers = infoPageHeaders;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? infoPageMeta({
        title: 'Ayuda',
        description: `Cómo consultar y comprar en ${data.config.brandName}, pagos y entregas en Managua y el resto de Nicaragua, retiro, horario de atención y garantía.`,
        siteUrl: data.siteUrl,
        canonicalUrl: data.canonicalUrl,
        trail: TRAIL,
      })
    : [];

export default function Ayuda() {
  const { config } = useLoaderData<typeof loader>();
  const policies = config.policies;

  const guides = [
    { to: STORE_PAGES.howToBuy, title: 'Cómo comprar', text: 'Consultar por WhatsApp, registrar un pedido y seguirlo.' },
    { to: STORE_PAGES.paymentsDelivery, title: 'Pagos y entregas', text: 'Managua, el resto del país y retiro.' },
    ...(policies?.warrantyPage ? [{ to: STORE_PAGES.warranty, title: 'Garantía y cambios', text: 'Las condiciones completas.' }] : []),
    { to: STORE_PAGES.orders, title: 'Mis pedidos', text: 'El estado de tus pedidos, sin crear una cuenta.' },
    { to: STORE_PAGES.wholesale, title: 'Compras por mayor', text: 'Cotizaciones por WhatsApp.' },
    { to: STORE_PAGES.contact, title: 'Contacto', text: 'WhatsApp, correo y formulario.' },
  ];

  return (
    <InfoPage title="Ayuda" trail={TRAIL}>
      <nav aria-label="Temas de ayuda">
        <ul className="divide-y divide-border border-y border-border">
          {guides.map((g) => (
            <li key={g.to}>
              <Link to={g.to} prefetch="intent" className="flex min-h-14 flex-col justify-center gap-0.5 py-3 focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="text-sm font-semibold text-primary-2">{g.title}</span>
                <span className="text-sm text-muted-foreground">{g.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="faq-title" className="space-y-6">
        <h2 id="faq-title" className="font-heading text-xl font-bold tracking-tight text-foreground">
          Preguntas frecuentes
        </h2>

        <InfoSection level={3} title="¿Cómo consulto por un producto?">
          <p>
            En la ficha del producto tocá «Consultar por WhatsApp»: se abre una conversación con el producto, la opción que
            elegiste y su enlace. El mensaje no se envía solo: lo mandás vos.
          </p>
        </InfoSection>

        <InfoSection level={3} title="¿Cómo registro un pedido?">
          <p>
            Agregá los productos al carrito, completá tus datos y elegí entrega o retiro. El pedido queda registrado con un
            número y se abre WhatsApp con el resumen para que lo envíes.{' '}
            <Link to={STORE_PAGES.howToBuy} className={INFO_LINK}>Ver cómo comprar</Link>
          </p>
        </InfoSection>

        <InfoSection level={3} title="¿Cómo veo el estado de mi pedido?">
          <p>
            En <Link to={STORE_PAGES.orders} className={INFO_LINK}>Mis pedidos</Link> ves los pedidos hechos desde este
            navegador, o buscás uno con su número y tu teléfono. No hace falta crear una cuenta.
          </p>
        </InfoSection>

        {policies && (
          <>
            <InfoSection level={3} title="¿Cómo pago?">
              <p>
                <span className="font-medium text-foreground">{policies.payment.title}.</span> {policies.payment.text}
              </p>
            </InfoSection>

            <InfoSection level={3} title="¿Hacen entregas en Managua y en el resto del país?">
              <p>
                <span className="font-medium text-foreground">{policies.managua.title}.</span> {policies.managua.text}
              </p>
              <p>
                <span className="font-medium text-foreground">{policies.outside.title}.</span> {policies.outside.text}
              </p>
              {policies.shippingNote && <p>{policies.shippingNote}</p>}
              <p>
                <Link to={STORE_PAGES.paymentsDelivery} className={INFO_LINK}>Ver pagos y entregas</Link>
              </p>
            </InfoSection>

            <InfoSection level={3} title="¿Puedo retirar mi pedido?">
              <p>{policies.pickup.text}</p>
              <PickupPoint />
            </InfoSection>
          </>
        )}

        {(config.businessHours?.length ?? 0) > 0 && (
          <InfoSection level={3} title="¿Cuál es el horario de atención?">
            <BusinessHoursList />
          </InfoSection>
        )}

        {policies && (
          <InfoSection level={3} title="¿Qué garantía tienen los productos?">
            <p>
              <span className="font-medium text-foreground">{policies.warranty.title}.</span> {policies.warranty.text}{' '}
              {policies.warrantyPage ? (
                <Link to={STORE_PAGES.warranty} className={INFO_LINK}>Ver garantía y cambios</Link>
              ) : (
                <>Si tenés un problema con un producto, escribinos por WhatsApp con tu número de pedido.</>
              )}
            </p>
          </InfoSection>
        )}

        <InfoSection level={3} title="¿Venden por mayor?">
          <p>
            Sí, cotizamos por WhatsApp según los productos y las cantidades que necesitás.{' '}
            <Link to={STORE_PAGES.wholesale} className={INFO_LINK}>Ver compras por mayor</Link>
          </p>
        </InfoSection>
      </section>
    </InfoPage>
  );
}
