// Metadatos, JSON-LD, sitemap, robots y origen público de la tienda.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogDetail } from '@shared/schemas';
import { originFromEnv } from '../../shared/site-url';
import { buildRobots, buildSitemap, metaDescription, productOffers, storeJsonLd } from '../app/lib/seo';

type Variant = CatalogDetail['variants'][number];
const variant = (price: number, availability: Variant['availability']) =>
  ({ variantName: `v${price}`, axisValues: [], price, isPromo: false, stock: 0, availability }) satisfies Variant;
const URL_FICHA = 'https://gyrostorenic.com/producto/kz--1';

test('el origen público sale de la variable y descarta valores que no son http(s)', () => {
  assert.equal(originFromEnv('https://gyrostorenic.com/'), 'https://gyrostorenic.com');
  assert.equal(originFromEnv(' https://gyrostorenic.com/tienda?x=1 '), 'https://gyrostorenic.com');
  assert.equal(originFromEnv(''), null);
  assert.equal(originFromEnv(undefined), null);
  assert.equal(originFromEnv('gyrostorenic.com'), null);
  assert.equal(originFromEnv('javascript:alert(1)'), null);
});

test('«Próximamente» no publica oferta', () => {
  const offers = productOffers({ availability: 'coming_soon', price: 0, variants: [variant(0, 'coming_soon')] }, URL_FICHA);
  assert.equal(offers, undefined);
});

test('el rango no toma variantes próximas ni sin precio', () => {
  const offers = productOffers(
    { availability: 'available', price: 900, variants: [variant(900, 'available'), variant(1200, 'available'), variant(0, 'coming_soon'), variant(500, 'sold_out')] },
    URL_FICHA,
  );
  assert.deepEqual(offers, {
    '@type': 'AggregateOffer', lowPrice: 900, highPrice: 1200, offerCount: 2,
    priceCurrency: 'NIO', url: URL_FICHA, availability: 'https://schema.org/InStock',
  });
});

test('un solo precio es una oferta simple; disponibilidad desconocida no declara stock', () => {
  const offers = productOffers({ availability: 'unknown', price: 700, variants: [variant(700, 'unknown'), variant(700, 'unknown')] }, URL_FICHA);
  assert.deepEqual(offers, { '@type': 'Offer', price: 700, priceCurrency: 'NIO', url: URL_FICHA });
});

test('sin ningún precio real no hay oferta', () => {
  assert.equal(productOffers({ availability: 'unknown', price: 0, variants: [variant(0, 'unknown')] }, URL_FICHA), undefined);
});

test('la descripción usa el texto real o el respaldo si viene vacío', () => {
  assert.equal(metaDescription('<p>Audífonos <b>KZ</b></p><p>Con micrófono</p>', 'respaldo'), 'Audífonos KZ Con micrófono');
  assert.equal(metaDescription('', 'respaldo'), 'respaldo');
  assert.equal(metaDescription('<p> </p>', 'respaldo'), 'respaldo');
  const long = metaDescription('palabra '.repeat(40), 'respaldo');
  assert.ok(long.length <= 160 && long.endsWith('…'));
});

test('el negocio se describe sin dirección y solo con redes válidas', () => {
  const ld = storeJsonLd({ origin: 'https://gyrostorenic.com', brand: 'Gyro Store', socialLinks: ['https://instagram.com/gyro', '', 'no-es-url'] });
  const organization: Record<string, unknown> = ld['@graph'][0];
  assert.deepEqual(organization.sameAs, ['https://instagram.com/gyro']);
  assert.equal(organization.url, 'https://gyrostorenic.com/');
  assert.equal('address' in organization, false);
});

test('el sitemap escapa las URLs y no repite entradas', () => {
  const xml = buildSitemap(['https://gyrostorenic.com/', 'https://gyrostorenic.com/?a=1&b=2', 'https://gyrostorenic.com/']);
  assert.equal(xml.match(/<url>/g)?.length, 2);
  assert.ok(xml.includes('<loc>https://gyrostorenic.com/?a=1&amp;b=2</loc>'));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
});

test('robots deja rastrear la tienda y la API, cierra el panel y anuncia el sitemap', () => {
  const robots = buildRobots('https://gyrostorenic.com');
  assert.ok(robots.includes('Disallow: /admin'));
  assert.ok(!robots.includes('Disallow: /\n'));
  assert.ok(!robots.includes('/api'));
  assert.ok(robots.includes('Sitemap: https://gyrostorenic.com/sitemap.xml'));
});
