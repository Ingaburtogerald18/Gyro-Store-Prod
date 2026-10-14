// Contenido de la tienda que edita el dueño: lo que sale al público y qué banner es la presentación.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  businessInfoSchema,
  presentationSlideId,
  storePoliciesSchema,
  toPublicPolicies,
  type HeroSlide,
  type StorePolicies,
} from '../shared/schemas';

const summary = { title: 'Título', text: 'Texto' };
const policies = (status: 'draft' | 'published', text = 'Condiciones'): StorePolicies => ({
  payment: summary,
  managua: summary,
  outside: summary,
  pickup: summary,
  warranty: summary,
  shippingNote: 'Se cotiza.',
  warrantyPage: { status, text, updatedAt: '2026-10-14T18:00:00.000Z' },
});

test('un borrador de garantía nunca sale en la configuración pública', () => {
  const draft = toPublicPolicies(policies('draft', 'Texto sin revisar'));
  assert.equal(draft.warrantyPage, null);
  assert.ok(!JSON.stringify(draft).includes('Texto sin revisar'));
  assert.deepEqual(toPublicPolicies(policies('published')).warrantyPage, { text: 'Condiciones', updatedAt: '2026-10-14T18:00:00.000Z' });
  // Publicada pero vacía no es una página.
  assert.equal(toPublicPolicies(policies('published', '')).warrantyPage, null);
});

test('las políticas exigen título y aceptan solo los estados conocidos', () => {
  assert.ok(storePoliciesSchema.safeParse(policies('draft')).success);
  assert.ok(!storePoliciesSchema.safeParse({ ...policies('draft'), payment: { title: ' ', text: '' } }).success);
  const wrongStatus = { ...policies('draft'), warrantyPage: { status: 'archivada', text: '', updatedAt: null } };
  assert.ok(!storePoliciesSchema.safeParse(wrongStatus).success);
});

test('los datos del negocio guardados antes de los horarios siguen siendo válidos', () => {
  const legacy = { brandName: 'Gyro Store', ruc: '', whatsapp: '+505 0000 0000', contactEmail: '', address: '', currency: 'C$' };
  const parsed = businessInfoSchema.parse(legacy);
  assert.deepEqual(parsed.businessHours, []);
  assert.ok(!businessInfoSchema.safeParse({ ...legacy, businessHours: [{ days: '', hours: '8 a 5' }] }).success);
});

test('la presentación es el banner principal; sin él, el primero', () => {
  const slide = (id: string, locked?: boolean): HeroSlide => ({
    id, eyebrow: '', title: id, description: '', mediaUrl: '', mediaType: 'image',
    buttonText: '', actionType: 'link', actionTarget: '', ...(locked ? { locked } : {}),
  });
  assert.equal(presentationSlideId([slide('a'), slide('marca', true), slide('b')]), 'marca');
  assert.equal(presentationSlideId([slide('a'), slide('b')]), 'a');
  assert.equal(presentationSlideId([]), undefined);
});
