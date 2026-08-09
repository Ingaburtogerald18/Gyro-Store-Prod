// Traduce el NOMBRE de un color de producto ("Negro", "Azul marino") al token
// visual que le corresponde.
//
// Los valores viven en `tailwind.css` como `--swatch-*` y son invariantes al
// tema: un audífono negro es negro en claro y en oscuro. Acá solo se resuelve
// el nombre → variable; ningún componente escribe un hex (DESIGN.md §11.10).
//
// Si el nombre no está en la tabla NO se inventa un color: se devuelve null y
// el selector cae a un chip de texto. Un círculo gris genérico mentiría sobre
// cómo se ve el producto.

const SWATCHES: Record<string, string> = {
  negro: 'black',
  black: 'black',
  blanco: 'white',
  white: 'white',
  // "Transparente" se dibuja como el blanco: en un audífono es carcasa clara.
  // Conserva su etiqueta escrita, que es lo que de verdad lo distingue.
  transparente: 'white',
  clear: 'white',
  gris: 'gray',
  grey: 'gray',
  gray: 'gray',
  plata: 'silver',
  plateado: 'silver',
  silver: 'silver',
  azul: 'blue',
  blue: 'blue',
  celeste: 'cyan',
  cyan: 'cyan',
  cian: 'cyan',
  turquesa: 'cyan',
  verde: 'green',
  green: 'green',
  rojo: 'red',
  red: 'red',
  rosa: 'pink',
  rosado: 'pink',
  pink: 'pink',
  morado: 'purple',
  violeta: 'purple',
  purple: 'purple',
  amarillo: 'yellow',
  yellow: 'yellow',
  naranja: 'orange',
  orange: 'orange',
  dorado: 'gold',
  oro: 'gold',
  gold: 'gold',
  cafe: 'brown',
  marron: 'brown',
  brown: 'brown',
};

// Mismo criterio que la búsqueda del catálogo: sin acentos y en minúsculas, para
// que "Café" y "cafe" caigan en la misma entrada.
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** `var(--swatch-*)` del color, o null si el nombre no se reconoce. */
export function swatchVar(colorName: string): string | null {
  const key = SWATCHES[normalize(colorName)];
  return key ? `var(--swatch-${key})` : null;
}

/** Los claros necesitan borde propio: sobre fondo blanco desaparecerían. */
export function isLightSwatch(colorName: string): boolean {
  const key = SWATCHES[normalize(colorName)];
  return key === 'white' || key === 'silver' || key === 'yellow';
}
