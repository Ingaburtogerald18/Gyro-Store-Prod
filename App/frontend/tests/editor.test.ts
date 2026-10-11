// Editor de portada: historia del borrador, validación antes de publicar y
// subida con progreso real, cancelación, error y límite de espera. Sin red: la
// subida usa un XMLHttpRequest falso.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingConfigSchema, type HeroSlide, type LandingConfig } from '@shared/schemas';
import { builderReducer, initBuilderSession, updateHeroSlide, updateHeroSlides, setCategoryMode, updateCartContent, undoBuilderChange, redoBuilderChange, endBuilderChange } from '../app/store/slices/builderSlice';
import { hasLandingErrors, isValidTarget, validateLanding, validateSlide } from '../app/lib/landingValidation';

const slide: HeroSlide = {
  id: 's1', eyebrow: '', title: 'KZ en oferta', description: '', mediaUrl: '', mediaType: 'image',
  buttonText: 'Ver catálogo', actionType: 'link', actionTarget: '/#catalogo',
};
const config: LandingConfig = { headerCategories: [], heroSlides: [slide] };

test('la historia agrupa escritura y conserva banners, categorías y carrito', () => {
  let state = builderReducer(undefined, initBuilderSession(config));
  state = builderReducer(state, updateHeroSlide({ slide: { ...slide, title: 'A' }, key: 's1:title' }));
  state = builderReducer(state, updateHeroSlide({ slide: { ...slide, title: 'Audio' }, key: 's1:title' }));
  assert.equal(state.past.length, 1);
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.title, slide.title);
  state = builderReducer(state, redoBuilderChange());
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.title, 'Audio');
  state = builderReducer(state, endBuilderChange());
  state = builderReducer(state, setCategoryMode({ zone: 'header', mode: 'hidden' }));
  state = builderReducer(state, updateCartContent({ content: { title: 'Tu pedido' } }));
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.cart, undefined);
  assert.equal(state.draftLandingConfig?.headerCategoriesMode, 'hidden');
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.headerCategoriesMode, undefined);
  state = builderReducer(state, updateHeroSlides([slide, { ...slide, id: 's2' }]));
  assert.equal(state.future.length, 0);
  assert.equal(state.draftLandingConfig?.heroSlides.length, 2);
  state = builderReducer(state, undoBuilderChange());
  assert.equal(state.draftLandingConfig?.heroSlides.length, 1);
  assert.equal(state.draftLandingConfig?.heroSlides[0]?.title, 'Audio');
});

test('composición y visibilidad se conservan sin romper configuraciones anteriores', () => {
  assert.equal(landingConfigSchema.safeParse(config).success, true);
  const next = { ...config, heroSlides: [{ ...slide, layout: 'right', visible: false }] };
  const parsed = landingConfigSchema.parse(next);
  assert.equal(parsed.heroSlides[0]?.layout, 'right');
  assert.equal(parsed.heroSlides[0]?.visible, false);
  assert.equal(landingConfigSchema.safeParse({ ...config, heroSlides: [{ ...slide, layout: 'free' }] }).success, false);
  assert.equal(hasLandingErrors(validateLanding({ ...config, heroSlides: [{ ...slide, title: '', visible: false }] }, { productUrls: [], socialCount: 0 })), false);
});

const ctx = { productUrls: ['/producto/kz-edx-pro--1'], socialCount: 0 };

test('destinos, títulos y acciones se validan sin corregirse solos', () => {
  assert.equal(isValidTarget('/#catalogo'), true);
  assert.equal(isValidTarget('https://instagram.com/x'), true);
  assert.equal(isValidTarget('//evil.example'), false);
  assert.equal(isValidTarget('javascript:alert(1)'), false);
  assert.deepEqual(validateSlide(slide, ctx), {});
  assert.ok(validateSlide({ ...slide, title: ' ' }, ctx).title);
  assert.ok(validateSlide({ ...slide, actionTarget: '' }, ctx).actionTarget);
  assert.ok(validateSlide({ ...slide, actionTarget: '/producto/borrado--2' }, ctx).actionTarget);
  assert.ok(validateSlide({ ...slide, actionType: 'social', actionTarget: '' }, ctx).actionTarget);
});

test('«Elegidas» sin ninguna categoría no se publica; las configuraciones viejas siguen valiendo', () => {
  assert.equal(hasLandingErrors(validateLanding(config, ctx)), false); // sin modo y vacío = automático
  const errors = validateLanding({ ...config, headerCategoriesMode: 'custom' }, ctx);
  assert.ok(errors.headerCategories);
  assert.equal(hasLandingErrors(validateLanding({ ...config, headerCategoriesMode: 'hidden' }, ctx)), false);
});

// ── Subida ──

type Listener = () => void;
class FakeXhr {
  static last: FakeXhr | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: Listener | null } = { onprogress: null, onload: null };
  onload: Listener | null = null;
  onerror: Listener | null = null;
  onabort: Listener | null = null;
  ontimeout: Listener | null = null;
  timeout = 0;
  status = 0;
  responseText = '';
  constructor() { FakeXhr.last = this; }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() { this.onabort?.(); }
}

async function withFakeUpload<T>(run: (upload: typeof import('../app/lib/uploadSlideMedia').uploadSlideMedia) => Promise<T>) {
  const g = globalThis as Record<string, unknown>;
  const original = g.XMLHttpRequest;
  g.XMLHttpRequest = FakeXhr;
  try {
    const mod = await import('../app/lib/uploadSlideMedia');
    return await run(mod.uploadSlideMedia);
  } finally {
    g.XMLHttpRequest = original;
  }
}

test('la subida informa el porcentaje real y solo termina con una URL confirmada', async () => {
  await withFakeUpload(async (upload) => {
    const steps: string[] = [];
    const promise = upload(new File(['x'], 'a.png', { type: 'image/png' }), {
      signal: new AbortController().signal,
      onProgress: (p) => steps.push(`p${p}`),
      onTransferred: () => steps.push('procesando'),
      accessToken: async () => null,
    });
    await new Promise((r) => setTimeout(r, 0));
    const xhr = FakeXhr.last!;
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onload?.();
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ url: 'https://cdn.example/a.webp' });
    xhr.onload?.();
    assert.equal(await promise, 'https://cdn.example/a.webp');
    assert.deepEqual(steps, ['p50', 'procesando']);
  });
});

test('respuesta sin URL, error de red, cancelación y demora se informan como fallos', async () => {
  await withFakeUpload(async (upload) => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const opts = () => ({ signal: new AbortController().signal, onProgress: () => {}, onTransferred: () => {}, accessToken: async () => null });

    let p = upload(file, opts());
    await new Promise((r) => setTimeout(r, 0));
    FakeXhr.last!.status = 200;
    FakeXhr.last!.responseText = '{}';
    FakeXhr.last!.onload?.();
    await assert.rejects(p, /no confirmó/);

    p = upload(file, opts());
    await new Promise((r) => setTimeout(r, 0));
    FakeXhr.last!.onerror?.();
    await assert.rejects(p, /red/);

    const controller = new AbortController();
    p = upload(file, { ...opts(), signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await assert.rejects(p, (err: Error) => err.name === 'AbortError');

    p = upload(file, { ...opts(), timeoutMs: 1000 });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(FakeXhr.last!.timeout, 1000);
    FakeXhr.last!.ontimeout?.();
    await assert.rejects(p, /tardó demasiado/);
  });
});
