// Carrito y checkout en un solo panel por pasos (carrito → datos → pedido),
// para que haya un único overlay con el foco y Escape bien resueltos.
import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, Delete02Icon, ImageNotFound01Icon, MinusSignIcon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useId, useState } from 'react';
import { useNavigate } from '@remix-run/react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { CheckoutPanel } from './checkout-panel';
import { GyroCartMascot } from './gyro-cart-mascot';
import { useCartContent } from '~/hooks/use-cart-content';
import { cn } from '~/lib/utils';
import { lineCeiling, variantText } from '~/lib/cart';
import { useMediaQuery } from '~/hooks/use-media-query';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import {
  closeCart,
  lineKey,
  removeItem,
  selectCartCount,
  selectCartItems,
  selectCartOpen,
  selectCartSubtotal,
  setQuantity,
} from '~/state/slices/cart-slice';
import type { CreatedPublicOrder } from '~/state/api/storefront-api';
import { formatCordobas } from "~/lib/formatters";
import { CATALOG_PATH } from '~/lib/catalog-query';
import { ThumbnailImg } from '~/components/product/thumbnail-img';
import { selectCheckoutDraft } from '~/state/slices/checkout-slice';

type Step = 'cart' | 'checkout';

export function CartDrawer() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector(selectCartOpen);
  const items = useAppSelector(selectCartItems);
  const count = useAppSelector(selectCartCount);
  const subtotal = useAppSelector(selectCartSubtotal);
  const config = useStoreConfig();
  const currency = config?.currency;
  const [step, setStep] = useState<Step>('cart');
  const [placed, setPlaced] = useState<CreatedPublicOrder | null>(null);
  const { attempt } = useAppSelector(selectCheckoutDraft);
  useEffect(() => {
    if (isOpen && attempt) setStep('checkout');
    // Solo al abrir: «Volver al carrito» sigue funcionando con un intento pendiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // Textos e imágenes editables (modo edición); con valores por defecto.
  const cart = useCartContent();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const titleId = useId();
  // SheetTitle no reenvía refs (React 18): se ubica por id.
  const focusTitle = () => document.getElementById(titleId)?.focus();

  function close() {
    dispatch(closeCart());
    // Al cerrar después de un pedido, la próxima apertura arranca en el carrito.
    if (placed) {
      setPlaced(null);
      setStep('cart');
    }
  }

  // "Seguir comprando": cierra el carrito y lleva al catálogo.
  function keepShopping() {
    close();
    navigate(CATALOG_PATH);
  }

  const inCheckout = step === 'checkout' && (items.length > 0 || placed || attempt);
  const title = placed ? 'Pedido registrado' : inCheckout ? 'Finalizar pedido' : cart.title;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className="flex min-h-0 flex-col gap-0 overflow-hidden bg-card p-0 data-[side=bottom]:h-[90dvh] data-[side=bottom]:max-h-[90dvh] max-md:rounded-t-3xl md:max-w-md"
        // El foco inicial va al título, no a la primera imagen ni a la mascota:
        // el lector de pantalla anuncia dónde está y Tab sigue a las acciones.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusTitle();
        }}
      >
        <SheetHeader className="shrink-0 gap-1 border-b border-border p-4 pr-16">
          <SheetTitle id={titleId} tabIndex={-1} className="text-lg font-bold text-foreground outline-none">
            {title}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {placed
              ? 'Ya lo tenemos. Falta enviarnos el mensaje por WhatsApp.'
              : inCheckout
                ? 'Completá tus datos: registramos el pedido y abrimos WhatsApp con el mensaje.'
                : items.length > 0
                  ? `${count} ${count === 1 ? 'artículo' : 'artículos'}${cart.subtitle ? ` · ${cart.subtitle}` : ''}`
                  : 'Todavía no agregaste nada.'}
          </SheetDescription>
        </SheetHeader>

        {inCheckout ? (
          <CheckoutPanel
            placed={placed}
            onPlaced={setPlaced}
            onBack={() => {
              setStep('cart');
              requestAnimationFrame(focusTitle);
            }}
            onDone={close}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {items.length === 0 ? (
                <CartEmptyState content={cart} active={isOpen} onExplore={keepShopping} />
              ) : (
                <div className="space-y-3">
                  {/* Banner de promo (opcional), compacto: la lista va primero en importancia. */}
                  {(cart.bannerImage || cart.bannerText) && (
                    <CartBanner
                      active={isOpen}
                      image={cart.bannerImage}
                      text={cart.bannerText}
                      link={cart.bannerLink}
                      onNavigate={(to) => {
                        close();
                        navigate(to);
                      }}
                    />
                  )}
                  <ul className="space-y-2.5" aria-label="Productos en el carrito">
                    {items.map((item) => (
                      <CartLine key={lineKey(item)} itemKey={lineKey(item)} currency={currency} item={item} />
                    ))}
                  </ul>

                  <Button
                    variant="ghost"
                    onClick={keepShopping}
                    className="h-11 w-full justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                    Agregar otro producto
                  </Button>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <footer className="shrink-0 space-y-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal de productos</span>
                  <span className="text-xl font-bold text-foreground tabular-nums">
                    {formatCordobas(subtotal, currency)}
                  </span>
                </div>
                <Button className="h-12 w-full text-base" onClick={() => setStep('checkout')}>
                  {cart.checkoutButton}
                </Button>
                {cart.footerNote && (
                  <p className="text-center text-xs text-muted-foreground">{cart.footerNote}</p>
                )}
              </footer>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Carrito vacío: Gyro grande, un mensaje corto y una sola salida al catálogo. */
export function CartEmptyState({
  content,
  active,
  onExplore,
}: {
  content: Pick<ReturnType<typeof useCartContent>, 'emptyImage' | 'emptyTitle' | 'emptyText' | 'emptyButton'>;
  active: boolean;
  onExplore: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      {content.emptyImage ? (
        <GyroCartMascot key={content.emptyImage} src={content.emptyImage} active={active} size="lg" />
      ) : (
        <div className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
          <HugeIcon icon={ShoppingBag02Icon} size={28} strokeWidth={2} aria-hidden />
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-lg font-bold text-foreground">{content.emptyTitle}</p>
        <p className="mx-auto max-w-[17rem] text-sm leading-relaxed text-muted-foreground">{content.emptyText}</p>
      </div>
      <Button onClick={onExplore} className="h-12 px-6 text-base">{content.emptyButton}</Button>
    </div>
  );
}

/** Una línea: foto, nombre y variante completos, precio unitario y total. */
export function CartLine({ item, itemKey, currency }: { item: import('~/types/cart').CartItem; itemKey: string; currency?: string }) {
  const dispatch = useAppDispatch();
  const ceiling = lineCeiling(item);
  const variant = variantText(item);
  const atMax = item.quantity >= ceiling;

  return (
    <li className="flex gap-3 rounded-xl border border-border bg-background p-3">
      <div className="product-stage size-16 shrink-0 overflow-hidden rounded-xl bg-card">
        {item.image ? (
          <ThumbnailImg src={item.image} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <HugeIcon icon={ImageNotFound01Icon} size={20} strokeWidth={2} aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm leading-snug font-semibold text-foreground">
              {item.comboId && (
                <Badge variant="promo" className="mr-1.5 align-middle text-2xs">Combo</Badge>
              )}
              {item.name}
            </p>
            {/* Un combo es una línea atómica: lo que la aclara es QUÉ trae. */}
            {item.comboId
              ? item.comboProducts && item.comboProducts.length > 0 && (
                  <p className="text-xs text-muted-foreground">{item.comboProducts.map((p) => p.name).join(' + ')}</p>
                )
              : variant && <p className="text-xs text-muted-foreground">{variant}</p>}
            <p className="text-xs text-muted-foreground tabular-nums">{formatCordobas(item.price, currency)} c/u</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(removeItem(itemKey))}
            aria-label={`Eliminar ${item.name}${variant ? ` (${variant})` : ''} del carrito`}
            className="-mt-1 -mr-1 size-11 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <HugeIcon icon={Delete02Icon} size={18} strokeWidth={2} aria-hidden />
          </Button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center rounded-xl border border-border" role="group" aria-label={`Cantidad de ${item.name}`}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Quitar una unidad"
              disabled={item.quantity <= 1}
              onClick={() => dispatch(setQuantity({ key: itemKey, quantity: item.quantity - 1 }))}
              className="size-11 rounded-l-xl rounded-r-none"
            >
              <HugeIcon icon={MinusSignIcon} size={14} strokeWidth={2} aria-hidden />
            </Button>
            <span className="w-8 text-center text-sm font-semibold text-foreground tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Agregar una unidad"
              disabled={atMax}
              title={atMax ? 'No hay más unidades disponibles' : undefined}
              onClick={() => dispatch(setQuantity({ key: itemKey, quantity: item.quantity + 1 }))}
              className="size-11 rounded-l-none rounded-r-xl"
            >
              <HugeIcon icon={Add01Icon} size={14} strokeWidth={2} aria-hidden />
            </Button>
          </div>
          <span className={cn('text-sm font-bold text-foreground tabular-nums')}>
            {formatCordobas(item.price * item.quantity, currency)}
          </span>
        </div>
        {atMax && item.maxQuantity !== undefined && (
          <p className="text-xs text-muted-foreground">Llegaste al máximo disponible para esta opción.</p>
        )}
      </div>
    </li>
  );
}

/** Banner de promo del carrito. Link interno → navega y cierra; externo → pestaña nueva. */
export function CartBanner({
  active,
  image,
  text,
  link,
  onNavigate,
}: {
  active: boolean;
  image: string;
  text: string;
  link: string;
  onNavigate: (to: string) => void;
}) {
  // Gyro libre y compacto (≈104px), con el texto al lado: no empuja la lista.
  const body = (
    <>
      {image && <GyroCartMascot key={image} src={image} active={active} interactive={!link} size="sm" />}
      {text && <p className="min-w-0 flex-1 text-left text-sm leading-snug font-semibold text-foreground">{text}</p>}
    </>
  );
  const className = cn('flex w-full items-center gap-3 rounded-xl', text ? 'justify-start' : 'justify-center');

  if (!link) return <div className={className}>{body}</div>;
  if (/^https?:\/\//i.test(link)) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={cn(className, 'transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onNavigate(link)} className={cn(className, 'transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}>
      {body}
    </button>
  );
}
