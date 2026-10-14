// Garantía y cambios: solo existe cuando está publicada en Configuración → Atención. En borrador
// responde 404 y no aparece en enlaces ni en el sitemap.
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

import { InfoPage, infoPageHeaders, infoPageMeta, type Crumb } from '~/components/storefront/info-page';
import { formatLongDate } from '~/lib/formatters';
import { loadInfoPage } from '~/lib/info-page.server';
import { STORE_PAGES } from '~/lib/store-pages';

const TRAIL: Crumb[] = [
  { name: 'Inicio', to: '/' },
  { name: 'Ayuda', to: STORE_PAGES.help },
  { name: 'Garantía y cambios', to: STORE_PAGES.warranty },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const data = await loadInfoPage(request, STORE_PAGES.warranty);
  const page = data.config.policies?.warrantyPage;
  if (!page) throw new Response('Página no encontrada', { status: 404 });
  return { ...data, page };
}

export const headers = infoPageHeaders;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? infoPageMeta({
        title: 'Garantía y cambios',
        description: `Garantía por fallas de fábrica y cambios en ${data.config.brandName}: condiciones y cómo pedirlos.`,
        siteUrl: data.siteUrl,
        canonicalUrl: data.canonicalUrl,
        trail: TRAIL,
      })
    : [];

export default function GarantiaYCambios() {
  const { page } = useLoaderData<typeof loader>();
  // El texto se escribe en Configuración como párrafos separados por una línea en blanco.
  const paragraphs = page.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <InfoPage
      title="Garantía y cambios"
      intro={page.updatedAt ? `Actualizado el ${formatLongDate(page.updatedAt)}.` : undefined}
      trail={TRAIL}
    >
      <div className="space-y-4 text-base leading-relaxed text-foreground">
        {paragraphs.map((text, index) => (
          <p key={index} className="whitespace-pre-line">{text}</p>
        ))}
      </div>
    </InfoPage>
  );
}
