// Color de identidad para categorías y plantillas.
//
// El tono se DERIVA del id, no se guarda: la misma categoría tiene siempre el
// mismo color, en todas las pantallas y entre sesiones, sin columna nueva en la
// base ni un selector de color que el admin tenga que mantener.
//
// Sale de los 7 tonos que DESIGN.md §2 ya define (`--tone-*`). No se usan los
// `--chart-*` a propósito: en este preset son toda la escala Green y todas las
// categorías quedarían del mismo color.
//
// El color NUNCA va solo: siempre acompaña al nombre. Diferenciar únicamente
// por color deja afuera a quien no lo distingue (DESIGN.md §8).

export const TONES = ['indigo', 'sky', 'amber', 'emerald', 'rose', 'purple', 'red'] as const;

export type Tone = (typeof TONES)[number];

// Las clases se listan enteras porque Tailwind escanea el código fuente como
// texto: una plantilla tipo `bg-tone-${tone}` no genera ninguna clase.
const DOT_CLASS: Record<Tone, string> = {
  indigo: 'bg-tone-indigo',
  sky: 'bg-tone-sky',
  amber: 'bg-tone-amber',
  emerald: 'bg-tone-emerald',
  rose: 'bg-tone-rose',
  purple: 'bg-tone-purple',
  red: 'bg-tone-red',
};

// Hash determinista (djb2 recortado). No necesita ser criptográfico: solo
// repartir ids parejo entre los 7 tonos y dar siempre el mismo resultado.
function hash(value: string): number {
  let acc = 5381;
  for (let i = 0; i < value.length; i++) acc = (acc * 33 + value.charCodeAt(i)) >>> 0;
  return acc;
}

export function toneOf(key: string | null | undefined): Tone | null {
  if (!key) return null;
  return TONES[hash(key) % TONES.length];
}

// Clase de fondo del punto. Sin key (categoría sin asignar) devuelve un gris
// neutro, que es información real: "esto todavía no está clasificado".
export function toneDotClass(key: string | null | undefined): string {
  const tone = toneOf(key);
  return tone ? DOT_CLASS[tone] : 'bg-muted-foreground/40';
}
