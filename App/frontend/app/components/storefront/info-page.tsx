// Armazón de las páginas informativas: recorrido, título y contenido a ancho de lectura, con sus
// metadatos (canonical y BreadcrumbList del mismo recorrido que se ve).
import type { HeadersFunction } from '@remix-run/node';
import { Link } from '@remix-run/react';
import { Fragment, type ReactNode } from 'react';

import { StorefrontShell } from '~/components/storefront/storefront-shell';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';
import { pageTitle } from '~/lib/brand';
import { breadcrumbJsonLd, canonicalLink } from '~/lib/seo';

export type Crumb = { name: string; to: string };

// Contenido público que cambia solo al editar Configuración: misma caché corta que el resto de la tienda.
export const infoPageHeaders: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
});

export function infoPageMeta({
  title,
  description,
  siteUrl,
  canonicalUrl,
  trail,
}: {
  title: string;
  description: string;
  siteUrl: string;
  canonicalUrl: string;
  trail: Crumb[];
}) {
  const fullTitle = pageTitle(title);
  return [
    { title: fullTitle },
    { name: 'description', content: description },
    canonicalLink(canonicalUrl),
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonicalUrl },
    { 'script:ld+json': breadcrumbJsonLd(trail.map((c) => ({ name: c.name, url: `${siteUrl}${c.to}` }))) },
  ];
}

/** `trail` empieza en Inicio y termina en esta página. */
export function InfoPage({ title, intro, trail, children }: { title: string; intro?: ReactNode; trail: Crumb[]; children: ReactNode }) {
  const parents = trail.slice(0, -1);
  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:py-8">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            {parents.map((crumb) => (
              <Fragment key={crumb.to}>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to} prefetch="intent">{crumb.name}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </Fragment>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {intro && <p className="mt-2 text-base leading-relaxed text-muted-foreground">{intro}</p>}

        <div className="mt-8 space-y-8">{children}</div>
      </main>
    </StorefrontShell>
  );
}

/** Bloque con título dentro de una página informativa; `level` 3 bajo un h2 propio (preguntas frecuentes). */
export function InfoSection({ id, title, level = 2, children }: { id?: string; title: string; level?: 2 | 3; children: ReactNode }) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <section id={id} className="scroll-below-header space-y-2">
      <Heading className="text-lg font-semibold text-foreground">{title}</Heading>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
