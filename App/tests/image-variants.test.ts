// Miniaturas: solo las fotos subidas por el panel tienen una, con nombre fijo al lado de la original.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { thumbnailUrl } from '../shared/image-variants';

test('la miniatura va al lado de la foto subida y no se inventa para otras direcciones', () => {
  const photo = 'https://media.gyrostorenic.com/productos/0123456789abcdef.webp';
  assert.equal(thumbnailUrl(photo), 'https://media.gyrostorenic.com/productos/0123456789abcdef-480.webp');
  assert.equal(thumbnailUrl('productos/0123456789abcdef.webp'), 'productos/0123456789abcdef-480.webp');
  assert.equal(thumbnailUrl('https://media.gyrostorenic.com/productos/0123456789abcdef-480.webp'), null);
  assert.equal(thumbnailUrl('https://media.gyrostorenic.com/productos/foto.png'), null);
  assert.equal(thumbnailUrl('blob:http://localhost:5173/0123456789abcdef'), null);
  assert.equal(thumbnailUrl(undefined), null);
});
