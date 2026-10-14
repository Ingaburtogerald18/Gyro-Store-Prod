// Metadatos, datos estructurados, sitemap y robots de la tienda pública. Puro: lo cubre tests/seo.test.ts.
import type { CatalogDetail } from '@shared/schemas';
import { htmlToText } from '~/lib/formatters';

const DESCRIPTION_MAX = 160;

/** Texto plano del contenido real, acotado para buscadores; si viene vacío, el de respaldo. */
export function metaDescription(html: string | null | undefined, fallback: string): string {
  const text = htmlToText(html).replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

export function canonicalLink(href: string) {
  return { tagName: 'link', rel: 'canonical', href } as const;
}

// Mismo criterio que el precio visible (summarizeVariants): si hay algo comprable, el rango sale de eso.
// «Próximamente» no publica oferta y las variantes sin precio no entran al rango.
export function productOffers(product: Pick<CatalogDetail, 'availability' | 'price' | 'variants'>, url: string) {
  if (product.availability === 'coming_soon') return undefined;
  const availability =
    product.availability === 'available'
      ? 'https://schema.org/InStock'
      : product.availability === 'sold_out'
        ? 'https://schema.org/OutOfStock'
        : undefined;
  // Todo se vende nuevo en caja (confirmado por el dueño el 14 oct 2026).
  const base = {
    priceCurrency: 'NIO',
    itemCondition: 'https://schema.org/NewCondition',
    url,
    ...(availability ? { availability } : {}),
  };

  const priced = product.variants.filter((v) => v.availability !== 'coming_soon' && v.price > 0);
  const buyable = priced.filter((v) => v.availability === 'available');
  const prices = (buyable.length ? buyable : priced).map((v) => v.price);
  if (prices.length === 0) {
    return product.price > 0 ? { '@type': 'Offer', price: product.price, ...base } : undefined;
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (low === high) return { '@type': 'Offer', price: low, ...base };
  return { '@type': 'AggregateOffer', lowPrice: low, highPrice: high, offerCount: prices.length, ...base };
}

function httpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// Identidad del negocio con datos de Configuración. Ciudad y país, sin calle: es un punto de retiro, no un
// local abierto al público.
export function storeJsonLd({
  origin,
  brand,
  logo,
  email,
  telephone,
  socialLinks = [],
}: {
  origin: string;
  brand: string;
  logo?: string | null;
  email?: string | null;
  telephone?: string | null;
  socialLinks?: (string | null | undefined)[];
}) {
  const home = `${origin}/`;
  const organizationId = `${home}#organizacion`;
  const logoUrl = httpUrl(logo);
  const sameAs = socialLinks.map(httpUrl).filter((url): url is string => Boolean(url));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: brand,
        url: home,
        ...(logoUrl ? { logo: logoUrl } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
        address: { '@type': 'PostalAddress', addressLocality: 'Managua', addressCountry: 'NI' },
        areaServed: { '@type': 'Country', name: 'Nicaragua' },
        ...(telephone?.trim()
          ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', telephone: telephone.trim(), availableLanguage: 'es' } }
          : {}),
        ...(sameAs.length ? { sameAs } : {}),
      },
      { '@type': 'WebSite', '@id': `${home}#sitio`, name: brand, url: home, inLanguage: 'es-NI', publisher: { '@id': organizationId } },
    ],
  };
}

/** El mismo recorrido que muestra la página, en orden. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  };
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);

/** Solo URLs públicas y canónicas. `lastmod` solo donde hay una fecha real de cambio (productos), nunca la hora actual. */
export function buildSitemap(entries: (string | { loc: string; lastmod?: string })[]): string {
  const seen = new Set<string>();
  const body = entries
    .map((entry) => (typeof entry === 'string' ? { loc: entry } : entry))
    .filter(({ loc }) => (seen.has(loc) ? false : (seen.add(loc), true)))
    .map(({ loc, lastmod }) => {
      const date = lastmod ? new Date(lastmod) : null;
      const mod = date && !Number.isNaN(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : '';
      return `  <url><loc>${escapeXml(loc)}</loc>${mod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// La API queda abierta: el buscador la necesita para pintar la página. Login, pedidos y vistas previas
// se excluyen con noindex, que solo se lee si el buscador puede entrar.
export function buildRobots(origin: string): string {
  return ['User-agent: *', 'Disallow: /admin', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}
