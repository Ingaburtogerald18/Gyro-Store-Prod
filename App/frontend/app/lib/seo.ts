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
  const base = { priceCurrency: 'NIO', url, ...(availability ? { availability } : {}) };

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

// Identidad del negocio con datos de Configuración. Sin dirección: no es un local abierto al público.
export function storeJsonLd({
  origin,
  brand,
  logo,
  email,
  socialLinks = [],
}: {
  origin: string;
  brand: string;
  logo?: string | null;
  email?: string | null;
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
        ...(sameAs.length ? { sameAs } : {}),
      },
      { '@type': 'WebSite', '@id': `${home}#sitio`, name: brand, url: home, inLanguage: 'es-NI', publisher: { '@id': organizationId } },
    ],
  };
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Solo URLs públicas y canónicas. Sin lastmod: el catálogo no guarda una fecha de cambio confiable. */
export function buildSitemap(urls: string[]): string {
  const body = [...new Set(urls)]
    .map((loc) => `  <url><loc>${loc.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// La API queda abierta: el buscador la necesita para pintar la página. Login, pedidos y vistas previas
// se excluyen con noindex, que solo se lee si el buscador puede entrar.
export function buildRobots(origin: string): string {
  return ['User-agent: *', 'Disallow: /admin', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}
