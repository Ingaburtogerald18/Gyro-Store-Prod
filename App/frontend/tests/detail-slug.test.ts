// URLs de fichas: solo el nombre, únicas aunque dos productos se llamen igual, y los enlaces viejos con
// el id siguen llevando al mismo producto.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findByDetailParam, parseDetailParam, slugify, uniqueSlugs } from '@shared/detail-slug';
import { productFromTarget, productTarget } from '../app/lib/detail-links';
import { getComboUrl, getProductUrl } from '../app/lib/formatters';
import { validateSlide } from '../app/lib/landing-validation';

const A = 'ad611ffb-218d-4e99-a1b2-000000000001';
const B = '3f1c0b1e-0000-4000-8000-000000000002';
const C = 'ad611f00-0000-4000-8000-000000000003';

test('el slug es el nombre, sin acentos ni signos', () => {
  assert.equal(slugify('Audífonos KZ EDX Pro'), 'audifonos-kz-edx-pro');
  assert.equal(slugify('F92 — Pantalla CarPlay y Android Auto para moto'), 'f92-pantalla-carplay-y-android-auto-para-moto');
  assert.equal(slugify('  ¡!  '), '');
});

test('dos con el mismo nombre llevan los dos el comienzo de su id; los demás, solo el nombre', () => {
  const slugs = uniqueSlugs(
    [
      { id: A, name: 'KZ EDX Pro' },
      { id: B, name: 'KZ EDX Pro' },
      { id: '11111111-0000-4000-8000-000000000004', name: 'Attack Shark X11' },
      { id: '22222222-0000-4000-8000-000000000005', name: null },
    ],
    'producto',
  );
  assert.equal(slugs.get(A), 'kz-edx-pro-ad611f');
  assert.equal(slugs.get(B), 'kz-edx-pro-3f1c0b');
  assert.equal(slugs.get('11111111-0000-4000-8000-000000000004'), 'attack-shark-x11');
  assert.equal(slugs.get('22222222-0000-4000-8000-000000000005'), 'producto');
  // Si los 6 primeros coinciden, se alarga hasta distinguirlos.
  const close = uniqueSlugs([{ id: A, name: 'Cable' }, { id: C, name: 'Cable' }], 'producto');
  assert.notEqual(close.get(A), close.get(C));
  assert.ok(close.get(A)!.startsWith('cable-ad611f'));
});

test('la URL trae un slug o, en los enlaces viejos, el id', () => {
  assert.deepEqual(parseDetailParam(`kz-edx-pro--${A}`), { id: A });
  assert.deepEqual(parseDetailParam(A.toUpperCase()), { id: A });
  assert.deepEqual(parseDetailParam('kz-edx-pro'), { slug: 'kz-edx-pro' });
});

test('se encuentra el producto por slug, por id y aunque su slug haya cambiado por un duplicado', () => {
  const items = [
    { id: A, name: 'KZ EDX Pro', slug: 'kz-edx-pro' },
    { id: B, name: 'Attack Shark X11', slug: 'attack-shark-x11' },
  ];
  assert.equal(findByDetailParam(items, 'kz-edx-pro')?.id, A);
  assert.equal(findByDetailParam(items, `kz-edx-pro--${A}`)?.id, A);
  // Era «kz-edx-pro-ad611f» mientras había otro igual; ya no lo hay.
  assert.equal(findByDetailParam(items, 'kz-edx-pro-ad611f')?.id, A);
  // Era «kz-edx-pro» y después se publicó otro con el mismo nombre: el primero de la tienda.
  const dup = [{ id: A, name: 'KZ EDX Pro', slug: 'kz-edx-pro-ad611f' }, { id: B, name: 'KZ EDX Pro', slug: 'kz-edx-pro-3f1c0b' }];
  assert.equal(findByDetailParam(dup, 'kz-edx-pro')?.id, A);
  assert.equal(findByDetailParam(items, 'no-existe'), undefined);
});

test('la tienda enlaza con el nombre; sin slug (carrito), con el id para que la ficha redirija', () => {
  assert.equal(getProductUrl({ id: A, slug: 'kz-edx-pro' }), '/producto/kz-edx-pro');
  assert.equal(getProductUrl({ id: A }), `/producto/${A}`);
  assert.equal(getComboUrl({ id: B, slug: 'combo-gamer' }), '/combo/combo-gamer');
});

test('un banner guarda el id del producto y los enlaces viejos siguen valiendo', () => {
  const products = [{ id: A, name: 'KZ EDX Pro', slug: 'kz-edx-pro' }];
  assert.equal(productTarget(products[0]!), `/producto/${A}`);
  assert.equal(productFromTarget(`/producto/kz-edx-pro--${A}`, products)?.id, A);
  assert.equal(productFromTarget('/producto/kz-edx-pro', products)?.id, A);
  assert.equal(productFromTarget('/catalogo', products), undefined);
  const slide = {
    id: 's', eyebrow: '', title: 'KZ', description: '', mediaUrl: '', mediaType: 'image' as const,
    buttonText: 'Ver', actionType: 'link' as const, actionTarget: `/producto/kz-edx-pro--${A}`,
  };
  assert.equal(validateSlide(slide, { products, socialCount: 0 }).actionTarget, undefined);
  assert.ok(validateSlide({ ...slide, actionTarget: `/producto/${B}` }, { products, socialCount: 0 }).actionTarget);
});
