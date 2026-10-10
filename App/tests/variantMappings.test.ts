// Guardar desde el editor del catálogo no puede borrar la oferta de una variante.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepVariantPromos, toVariantMappings } from '../server/services/variantMappings';

test('la lectura conserva promoPrice y las variantes con solo precio', () => {
  const read = toVariantMappings({
    Negro: { codes: ['L1'], price: 500, promoPrice: 450 },
    Blanco: { codes: [], price: 650 },
    Rojo: { codes: [] },
  });
  assert.deepEqual(read, {
    Negro: { codes: ['L1'], price: 500, promoPrice: 450 },
    Blanco: { codes: [], price: 650 },
  });
});

test('guardar sin promoPrice mantiene la oferta guardada', () => {
  const saved = { Negro: { codes: ['L1'], price: 500, promoPrice: 450 } };
  const fromEditor = { Negro: { codes: ['L1', 'L2'], price: 520 }, Blanco: { codes: ['L3'] } };
  assert.deepEqual(keepVariantPromos(fromEditor, saved), {
    Negro: { codes: ['L1', 'L2'], price: 520, promoPrice: 450 },
    Blanco: { codes: ['L3'] },
  });
});

test('un promoPrice nuevo reemplaza al guardado', () => {
  const saved = { Negro: { codes: ['L1'], promoPrice: 450 } };
  assert.equal(keepVariantPromos({ Negro: { codes: ['L1'], promoPrice: 400 } }, saved).Negro?.promoPrice, 400);
});
