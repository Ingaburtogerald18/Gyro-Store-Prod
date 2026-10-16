import { z } from 'zod';

// `actionType`: "modal" abre «Quiénes somos», "social" el menú de redes y "link" navega a `actionTarget`.
// `locked` (la de marca) se edita pero no se mueve ni se borra.
export const heroSlideSchema = z.object({
  id: z.string().min(1).max(64),
  eyebrow: z.string().max(60),
  title: z.string().max(120),
  description: z.string().max(400),
  mediaUrl: z.string().max(2048),
  mediaType: z.enum(['image', 'video']),
  // Alternativa para el celular, solo en banners de imagen. Sin ella (o vacía) se usa `mediaUrl`.
  mobileImageUrl: z.string().max(2048).optional(),
  mobileTextInImage: z.boolean().optional(),
  buttonText: z.string().max(40),
  actionType: z.enum(['modal', 'link', 'social']),
  actionTarget: z.string().max(2048),
  locked: z.boolean().optional(),
  layout: z.enum(['left', 'right', 'top']).optional(),
  visible: z.boolean().optional(),
});

// Techo de diapositivas: el hero es una vitrina, no un carrusel infinito.
export const MAX_HERO_SLIDES = 12;
// Destacados de la portada: una selección corta, no otra copia del catálogo.
export const MAX_FEATURED_PRODUCTS = 8;

// Las imágenes del carrito guardan qué recurso usar, no la URL: si cambia el recurso, el carrito
// lo toma solo. Vacío = el texto o ícono por defecto.
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

// auto = las que tienen productos; custom = las elegidas, en ese orden; hidden = ninguna.
// Sin modo (configuraciones viejas), lista vacía es auto y con elementos es custom.
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
  // Destacados de la portada, por id y en orden. Opcional: sin él (configuraciones viejas), los primeros del catálogo.
  featuredProductIds: z.array(z.string().max(64)).max(MAX_FEATURED_PRODUCTS).optional(),
  homeCategoriesMode: z.enum(CATEGORY_MODES).optional(),
  // Textos e imágenes del carrito (modo edición). Opcional: sin esto, los de siempre.
  cart: cartContentSchema.optional(),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type LandingConfig = z.infer<typeof landingConfigSchema>;

/** La presentación es el banner principal (`locked`); en configuraciones sin él, el primero. El resto son novedades. */
export function presentationSlideId(slides: HeroSlide[]): string | undefined {
  return (slides.find((slide) => slide.locked) ?? slides[0])?.id;
}

/** Imagen del celular que se muestra; undefined si no hay alternativa (o es un video): va la principal. */
export function mobileImageOf(slide: Pick<HeroSlide, 'mediaType' | 'mobileImageUrl'>): string | undefined {
  return (slide.mediaType === 'image' && slide.mobileImageUrl?.trim()) || undefined;
}

/**
 * Todos los archivos que nombra una portada guardada. Lee con tolerancia (borradores y versiones
 * viejas): lo que decide si un archivo se puede borrar no puede mirar solo `mediaUrl`.
 */
export function landingMediaUrls(landing: unknown): string[] {
  const slides = (landing as { heroSlides?: unknown } | null)?.heroSlides;
  if (!Array.isArray(slides)) return [];
  return slides
    .flatMap((slide) => [slide?.mediaUrl, slide?.mobileImageUrl])
    .filter((url): url is string => typeof url === 'string' && url.trim() !== '');
}

/** Modo efectivo de una zona, compatible con configuraciones sin modo. */
export function categoryMode(mode: CategoryMode | undefined, ids: string[] | undefined): CategoryMode {
  return mode ?? ((ids?.length ?? 0) > 0 ? 'custom' : 'auto');
}
