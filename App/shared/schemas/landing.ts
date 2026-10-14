import { z } from 'zod';

// Una diapositiva del hero. `actionType` "modal" abre "Quiénes Somos";
// "social" abre un menú con las redes de la config (Facebook, Instagram,
// TikTok) y no usa `actionTarget`;
// "link" navega a `actionTarget`. `locked` (la de marca) impide mover o
// eliminar, pero sí editar.
export const heroSlideSchema = z.object({
  id: z.string().min(1).max(64),
  eyebrow: z.string().max(60),
  title: z.string().max(120),
  description: z.string().max(400),
  mediaUrl: z.string().max(2048),
  mediaType: z.enum(['image', 'video']),
  buttonText: z.string().max(40),
  actionType: z.enum(['modal', 'link', 'social']),
  actionTarget: z.string().max(2048),
  locked: z.boolean().optional(),
  layout: z.enum(['left', 'right', 'top']).optional(),
  visible: z.boolean().optional(),
});

// Techo de diapositivas: el hero es una vitrina, no un carrusel infinito.
export const MAX_HERO_SLIDES = 12;

// Textos e imágenes del carrito, editables desde el modo edición de la tienda.
// Las imágenes NO guardan una URL: guardan QUÉ recurso de "Recursos de
// imágenes" usar. Así, si el admin cambia esa imagen en Recursos, el carrito la
// toma sola, y el borrado de huérfanas de Recursos nunca deja el carrito roto.
// Todos los campos son opcionales: vacío = el texto o ícono por defecto.
export const CART_IMAGE_KEYS = ['cartEmpty', 'cartBanner', 'orderSuccess', 'logoStatic'] as const;
const cartImageKeySchema = z.enum(CART_IMAGE_KEYS).or(z.literal('')).optional();

export const cartContentSchema = z.object({
  title: z.string().max(60).optional(),
  subtitle: z.string().max(120).optional(),
  emptyImage: cartImageKeySchema,
  emptyTitle: z.string().max(80).optional(),
  emptyText: z.string().max(200).optional(),
  emptyButton: z.string().max(40).optional(),
  bannerImage: cartImageKeySchema,
  bannerText: z.string().max(120).optional(),
  bannerLink: z.string().max(2048).optional(),
  checkoutButton: z.string().max(40).optional(),
  footerNote: z.string().max(160).optional(),
  successImage: cartImageKeySchema,
  successTitle: z.string().max(80).optional(),
  successText: z.string().max(300).optional(),
});
export type CartContent = z.infer<typeof cartContentSchema>;
export type CartImageKey = (typeof CART_IMAGE_KEYS)[number];

// Cómo se eligen las categorías de una zona de la portada:
//   · auto   → todas las que tienen productos, en su orden natural;
//   · custom → solo las elegidas, en ese orden;
//   · hidden → la zona no muestra categorías.
// Opcional para que las configuraciones guardadas antes sigan valiendo: sin
// modo, una lista vacía es «auto» y una con elementos es «custom».
export const CATEGORY_MODES = ['auto', 'custom', 'hidden'] as const;
export type CategoryMode = (typeof CATEGORY_MODES)[number];

export const landingConfigSchema = z.object({
  // Ids de categoría en el orden/visibilidad que eligió el admin. Vacío = todas
  // en su orden natural (los nombres salen del catálogo, no de aquí).
  headerCategories: z.array(z.string().max(64)).max(50),
  headerCategoriesMode: z.enum(CATEGORY_MODES).optional(),
  heroSlides: z.array(heroSlideSchema).max(MAX_HERO_SLIDES),
  // Categorías que se muestran como carriles en la home.
  homeCategories: z.array(z.string().max(64)).max(50).optional(),
  homeCategoriesMode: z.enum(CATEGORY_MODES).optional(),
  // Textos e imágenes del carrito (modo edición). Opcional: sin esto, los de siempre.
  cart: cartContentSchema.optional(),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type LandingConfig = z.infer<typeof landingConfigSchema>;

/** Modo efectivo de una zona, compatible con configuraciones sin modo. */
export function categoryMode(mode: CategoryMode | undefined, ids: string[] | undefined): CategoryMode {
  return mode ?? ((ids?.length ?? 0) > 0 ? 'custom' : 'auto');
}
