// Textos e imágenes del carrito ya resueltos. Mientras se edita manda el borrador; vacío cae al texto
// de siempre y cada imagen es una clave de Recursos.
import type { CartContent, CartImageKey } from '@shared/schemas';
import { useStoreConfig, useStoreLanding } from '~/hooks/use-store-config';
import { useAppSelector } from '~/state/hooks';
import { selectEditMode, selectIsAdmin } from '~/state/slices/auth-slice';
import { selectDraftLandingConfig } from '~/state/slices/builder-slice';

export const CART_DEFAULTS = {
  title: 'Tu carrito',
  emptyTitle: 'Tu carrito está vacío… por ahora',
  emptyText: 'Explorá la tienda y descubrí lo que podés llevarte hoy.',
  emptyButton: 'Explorar catálogo',
  checkoutButton: 'Finalizar pedido',
  successTitle: '¡Pedido recibido!',
  successText: 'Mandanos el mensaje por WhatsApp para confirmar la entrega y el pago.',
} as const;

/** Nombre legible de cada recurso, para el selector del editor. */
export const CART_IMAGE_LABELS: Record<CartImageKey, string> = {
  cartEmpty: 'Carrito vacío',
  cartBanner: 'Banner del carrito',
  orderSuccess: 'Pedido recibido',
  logoStatic: 'Logo estático',
};

/** Imagen de Recursos que usa cada lugar si no se eligió otra. */
export const CART_IMAGE_FALLBACK = {
  emptyImage: 'cartEmpty',
  bannerImage: 'cartBanner',
  successImage: 'orderSuccess',
} as const satisfies Record<string, CartImageKey>;

export type CartImages = Partial<Record<CartImageKey, string | undefined>>;

/**
 * Pura: la usan el carrito y la vista previa. Sin elegir, cada lugar usa su imagen de Recursos;
 * solo «Sin imagen» ('') la oculta.
 */
export function resolveCartContent(raw: CartContent, images: CartImages) {
  const imageUrl = (key: CartContent['emptyImage'], fallback: CartImageKey) => {
    const k = key === undefined ? fallback : key;
    return k ? images[k] || '' : '';
  };
  return {
    title: raw.title?.trim() || CART_DEFAULTS.title,
    subtitle: raw.subtitle?.trim() || '',
    emptyImage: imageUrl(raw.emptyImage, CART_IMAGE_FALLBACK.emptyImage),
    emptyTitle: raw.emptyTitle?.trim() || CART_DEFAULTS.emptyTitle,
    emptyText: raw.emptyText?.trim() || CART_DEFAULTS.emptyText,
    emptyButton: raw.emptyButton?.trim() || CART_DEFAULTS.emptyButton,
    bannerImage: imageUrl(raw.bannerImage, CART_IMAGE_FALLBACK.bannerImage),
    bannerText: raw.bannerText?.trim() || '',
    bannerLink: raw.bannerLink?.trim() || '',
    checkoutButton: raw.checkoutButton?.trim() || CART_DEFAULTS.checkoutButton,
    footerNote: raw.footerNote?.trim() || '',
    successImage: imageUrl(raw.successImage, CART_IMAGE_FALLBACK.successImage),
    successTitle: raw.successTitle?.trim() || CART_DEFAULTS.successTitle,
    successText: raw.successText?.trim() || CART_DEFAULTS.successText,
  };
}

export type ResolvedCartContent = ReturnType<typeof resolveCartContent>;

export function useCartContent() {
  const config = useStoreConfig();
  const landing = useStoreLanding();
  const draft = useAppSelector(selectDraftLandingConfig);
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const editing = isAdmin && editMode;

  const raw: CartContent = (editing && draft ? draft.cart : landing?.cart) ?? {};
  const images: CartImages = config?.images ?? {};

  return { editing, raw, images, ...resolveCartContent(raw, images) };
}
