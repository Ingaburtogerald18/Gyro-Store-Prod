// Imagen del celular en los banners: datos viejos, el viaje del campo, qué se muestra y qué se revisa.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  landingConfigSchema,
  landingMediaUrls,
  mobileImageOf,
  storeDraftInputSchema,
  storePublishInputSchema,
  type HeroSlide,
  type LandingConfig,
} from '@shared/schemas';
import { SlideMedia } from '../app/components/catalog/slide-media';
import { mobileImageChange } from '../app/components/editor/store-change-review';
import { validateSlide } from '../app/lib/landing-validation';
import { builderReducer, initBuilderSession, undoBuilderChange, updateHeroSlide } from '../app/state/slices/builder-slice';

const MAIN = 'https://cdn.example.com/landing/principal.webp';
const MOBILE = 'https://cdn.example.com/landing/celular.webp';
const old: HeroSlide = {
  id: 'p', eyebrow: '', title: 'Audífonos KZ', description: '', mediaUrl: MAIN, mediaType: 'image',
  buttonText: 'Ver catálogo', actionType: 'link', actionTarget: '/catalogo', locked: true,
};
const both: HeroSlide = { ...old, mobileImageUrl: MOBILE };
const landing = (slide: HeroSlide): LandingConfig => ({ headerCategories: [], heroSlides: [slide] });
const ctx = { productUrls: [], socialCount: 0 };
const session = '3f1c0b1e-0000-4000-8000-000000000001';

test('un banner guardado antes de la imagen del celular se lee igual y usa la principal', () => {
  const parsed = landingConfigSchema.parse(landing(old));
  assert.equal(parsed.heroSlides[0]?.mobileImageUrl, undefined);
  assert.equal(mobileImageOf(parsed.heroSlides[0]!), undefined);
});

test('la imagen del celular sobrevive al validar, guardar el borrador y publicar', () => {
  const parsed = landingConfigSchema.parse(landing(both));
  assert.equal(parsed.heroSlides[0]?.mobileImageUrl, MOBILE);
  const draft = storeDraftInputSchema.parse({ session, landing: landing(both), products: { items: {}, combos: {} } });
  assert.equal(draft.landing?.heroSlides[0]?.mobileImageUrl, MOBILE);
  const publish = storePublishInputSchema.parse({ session, landing: landing(both), products: { items: {}, combos: {} } });
  assert.equal(publish.landing.heroSlides[0]?.mobileImageUrl, MOBILE);
  // Mismo límite que la principal.
  assert.equal(landingConfigSchema.safeParse(landing({ ...old, mobileImageUrl: `https://x/${'a'.repeat(2048)}` })).success, false);
});

test('se elige la del celular solo en banners de imagen y con una URL de verdad', () => {
  assert.equal(mobileImageOf(both), MOBILE);
  assert.equal(mobileImageOf({ ...both, mobileImageUrl: '  ' }), undefined);
  assert.equal(mobileImageOf({ ...both, mediaType: 'video' }), undefined);
});

test('la tienda deja elegir al navegador: una sola imagen según el ancho, la principal de respaldo', () => {
  const html = renderToString(createElement(SlideMedia, { slide: both }));
  assert.match(html, /^<picture class="contents">/);
  // Cada fuente con su proporción: el navegador reserva el lugar antes de que llegue la imagen.
  assert.match(html, /<source media="not all and \(min-width: 48rem\)" srcSet="https:\/\/cdn\.example\.com\/landing\/celular\.webp" width="1080" height="600"\/>/);
  assert.match(html, /<img src="https:\/\/cdn\.example\.com\/landing\/principal\.webp" alt="Audífonos KZ" fetchpriority="high" loading="eager" width="1200" height="800"/);

  // Novedades: más abajo, se cargan cuando hacen falta.
  assert.match(renderToString(createElement(SlideMedia, { slide: both, priority: false })), /loading="lazy"/);
  // Sin alternativa, la misma <img> de siempre.
  const plain = renderToString(createElement(SlideMedia, { slide: old }));
  assert.doesNotMatch(plain, /<picture|<source/);
  assert.match(plain, /src="https:\/\/cdn\.example\.com\/landing\/principal\.webp"/);
});

test('un video no cambia: ni <picture> ni la imagen del celular', () => {
  const html = renderToString(
    createElement(SlideMedia, { slide: { ...both, mediaUrl: 'https://cdn.example.com/landing/clip.mp4', mediaType: 'video' } }),
  );
  assert.match(html, /^<video/);
  assert.doesNotMatch(html, /celular|<source/);
});

test('con movimiento reducido, una animada se congela eligiendo también entre las dos', () => {
  const html = renderToString(
    createElement(SlideMedia, { slide: { ...both, mobileImageUrl: 'https://cdn.example.com/landing/celular.gif' }, freeze: true }),
  );
  assert.match(html, /<picture hidden="">/);
  assert.match(html, /srcSet="https:\/\/cdn\.example\.com\/landing\/celular\.gif"/);
  assert.match(html, /<canvas role="img" aria-label="Audífonos KZ"/);
});

test('la imagen del celular sin principal no se publica: dejaría el escritorio vacío', () => {
  assert.equal(validateSlide({ ...both, mediaUrl: '' }, ctx).mediaUrl, 'Cargá la imagen principal: se usa en escritorio.');
  assert.equal(validateSlide(both, ctx).mediaUrl, undefined);
  assert.equal(validateSlide({ ...old, mediaUrl: '' }, ctx).mediaUrl, undefined);
});

test('la revisión dice si la imagen del celular se agregó, se reemplazó o se quitó', () => {
  assert.equal(mobileImageChange(old, both), 'Imagen para móvil agregada');
  assert.equal(mobileImageChange(both, { mobileImageUrl: 'https://cdn.example.com/landing/otra.webp' }), 'Imagen para móvil reemplazada');
  assert.equal(mobileImageChange(both, old), 'Imagen para móvil quitada');
  assert.equal(mobileImageChange(old, { mobileImageUrl: '' }), null);
  assert.equal(mobileImageChange(both, both), null);
});

test('un archivo que usa la imagen del celular de un borrador o una versión no queda huérfano', () => {
  assert.deepEqual(landingMediaUrls(landing(both)), [MAIN, MOBILE]);
  assert.deepEqual(landingMediaUrls(landing(old)), [MAIN]);
  // Versiones guardadas con otro formato: se leen sin romper.
  assert.deepEqual(landingMediaUrls({ heroSlides: [{ mobileImageUrl: MOBILE }, null, { mediaUrl: 3 }] }), [MOBILE]);
  assert.deepEqual(landingMediaUrls(null), []);
});

test('quitar o reemplazar una sola imagen en el borrador no toca la otra, y se deshace', () => {
  let state = builderReducer(undefined, initBuilderSession(landing(old)));
  state = builderReducer(state, updateHeroSlide({ slide: both, key: 'p:mobileImageUrl' }));
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.mobileImageUrl, MOBILE);
  state = builderReducer(state, updateHeroSlide({ slide: { ...both, mediaUrl: 'https://cdn.example.com/landing/nueva.webp' }, key: 'p:mediaUrl' }));
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.mobileImageUrl, MOBILE);
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.mediaUrl, MAIN);
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.mobileImageUrl, undefined);
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.mediaUrl, MAIN);
});
