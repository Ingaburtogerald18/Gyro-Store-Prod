// Textos e imágenes del carrito, ya resueltos para pintar.
//
// Salen de `landing.cart` (editable en modo edición, se publica con «Guardar
// cambios»). Mientras se edita, manda el BORRADOR, así el admin ve el cambio en
// vivo. Cada campo vacío cae al texto de siempre, y cada imagen es una CLAVE de
// "Recursos de imágenes" que acá se traduce a su URL: si esa imagen no está
// cargada, el carrito muestra el ícono por defecto.
import type { CartContent, CartImageKey } from '@shared/schemas';
import { useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import { useAppSelector } from '~/store/hooks';
import { selectEditMode, selectIsAdmin } from '~/store/slices/authSlice';
import { selectDraftLandingConfig } from '~/store/slices/builderSlice';

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

export function useCartContent() {
  const config = useStoreConfig();
  const landing = useStoreLanding();
  const draft = useAppSelector(selectDraftLandingConfig);
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const editing = isAdmin && editMode;

  const raw: CartContent = (editing && draft ? draft.cart : landing?.cart) ?? {};
  const images = config?.images ?? {};
  const imageUrl = (key: CartContent['emptyImage']) => (key ? images[key] || '' : '');

  return {
    editing,
    raw,
    images,
    title: raw.title?.trim() || CART_DEFAULTS.title,
    subtitle: raw.subtitle?.trim() || '',
    emptyImage: imageUrl(raw.emptyImage),
    emptyTitle: raw.emptyTitle?.trim() || CART_DEFAULTS.emptyTitle,
    emptyText: raw.emptyText?.trim() || CART_DEFAULTS.emptyText,
    emptyButton: raw.emptyButton?.trim() || CART_DEFAULTS.emptyButton,
    bannerImage: imageUrl(raw.bannerImage),
    bannerText: raw.bannerText?.trim() || '',
    bannerLink: raw.bannerLink?.trim() || '',
    checkoutButton: raw.checkoutButton?.trim() || CART_DEFAULTS.checkoutButton,
    footerNote: raw.footerNote?.trim() || '',
    successImage: imageUrl(raw.successImage),
    successTitle: raw.successTitle?.trim() || CART_DEFAULTS.successTitle,
    successText: raw.successText?.trim() || CART_DEFAULTS.successText,
  };
}
