// Validación del borrador de portada antes de publicar: informa junto a cada campo, no corrige nada.
import { categoryMode, mobileImageOf, type HeroSlide, type LandingConfig } from '@shared/schemas';

export type SlideField = 'title' | 'buttonText' | 'actionTarget' | 'mediaUrl';
export type SlideErrors = Partial<Record<SlideField, string>>;

export interface ValidationContext {
  /** URLs de producto publicadas (`/producto/slug--id`). */
  productUrls: string[];
  /** Cantidad de redes con enlace cargado en Configuración. */
  socialCount: number;
}

/** Enlace interno de la tienda o https:// externo. */
export function isValidTarget(target: string): boolean {
  const t = target.trim();
  if (!t) return false;
  if (t.startsWith('/') && !t.startsWith('//')) return true;
  if (t.startsWith('#')) return t.length > 1;
  try {
    const url = new URL(t);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateSlide(slide: HeroSlide, ctx: ValidationContext): SlideErrors {
  const errors: SlideErrors = {};
  if (!slide.title.trim()) errors.title = 'Escribí un título.';
  // La móvil sola dejaría el escritorio sin imagen: la principal es la que se usa ahí.
  if (mobileImageOf(slide) && !slide.mediaUrl.trim()) errors.mediaUrl = 'Cargá la imagen principal: se usa en escritorio.';
  if (slide.actionType !== 'modal' && !slide.buttonText.trim()) errors.buttonText = 'Escribí el texto del botón.';
  if (slide.actionType === 'social') {
    if (ctx.socialCount === 0) errors.actionTarget = 'No hay redes con enlace en Configuración. Cargalas o elegí otra acción.';
  } else if (slide.actionType === 'link') {
    const target = slide.actionTarget.trim();
    if (target.startsWith('/producto/')) {
      if (!ctx.productUrls.includes(target)) errors.actionTarget = 'Ese producto ya no está publicado. Elegí otro.';
    } else if (!isValidTarget(target)) {
      errors.actionTarget = 'Usá un enlace de la tienda (empieza con /) o una dirección https://.';
    }
  }
  return errors;
}

export interface LandingErrors {
  slides: Record<string, SlideErrors>;
  headerCategories?: string;
  homeCategories?: string;
}

export function validateLanding(config: LandingConfig, ctx: ValidationContext): LandingErrors {
  const slides: Record<string, SlideErrors> = {};
  for (const slide of config.heroSlides) {
    if (slide.visible === false) continue;
    const errors = validateSlide(slide, ctx);
    if (Object.keys(errors).length) slides[slide.id] = errors;
  }
  const result: LandingErrors = { slides };
  // «Elegir categorías» sin ninguna elegida dejaría la zona vacía sin aviso:
  // hay que elegir al menos una o pasar a Automático / Ocultar.
  if (categoryMode(config.headerCategoriesMode, config.headerCategories) === 'custom' && config.headerCategories.length === 0) {
    result.headerCategories = 'Elegí al menos una categoría, o usá «Automático» u «Ocultar».';
  }
  if (categoryMode(config.homeCategoriesMode, config.homeCategories) === 'custom' && (config.homeCategories?.length ?? 0) === 0) {
    result.homeCategories = 'Elegí al menos una sección, o usá «Automático» u «Ocultar».';
  }
  return result;
}

export const hasLandingErrors = (e: LandingErrors) =>
  Object.keys(e.slides).length > 0 || Boolean(e.headerCategories) || Boolean(e.homeCategories);
