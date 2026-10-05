// Carrito. En desktop es un panel lateral desde la derecha; en móvil baja desde
// arriba, al alcance del pulgar. Lista las líneas, deja ajustar cantidad o
// eliminar, y abre el checkout.
//
// Construido sobre <Sheet> de shadcn/ui: el foco atrapado, el cierre con Escape
// y el aria del diálogo vienen resueltos por Radix.
import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, Delete02Icon, ImageNotFound01Icon, MinusSignIcon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
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
import { CheckoutDialog } from './checkout-dialog';
import { useCartContent } from '~/hooks/useCartContent';
import { cn } from '~/lib/utils';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  closeCart,
  lineKey,
  removeItem,
  selectCartCount,
  selectCartItems,
  selectCartOpen,
  selectCartSubtotal,
  setQuantity,
} from '~/store/slices/cartSlice';
import { formatCordobas } from "~/lib/formatters";

export function CartDrawer() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector(selectCartOpen);
  const items = useAppSelector(selectCartItems);
  const count = useAppSelector(selectCartCount);
  const subtotal = useAppSelector(selectCartSubtotal);
  const { data: config } = useGetConfigQuery();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Textos e imágenes editables (modo edición); con valores por defecto.
  const cart = useCartContent();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // "Seguir comprando": cierra el carrito y baja a la grilla del catálogo. El
  // scroll manual cubre el caso de ya estar en la home (la ruta no remonta).
  function keepShopping() {
    dispatch(closeCart());
    navigate('/#catalogo');
    setTimeout(
      () =>
        document
          .getElementById('catalogo')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      120,
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && dispatch(closeCart())}>
        {/* En móvil sube desde abajo (al alcance del pulgar), como el resto de
            paneles de la tienda; antes bajaba desde arriba. */}
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          className="flex flex-col bg-card p-0 max-md:h-[85dvh] max-md:rounded-t-3xl md:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-border p-4">
            <SheetTitle className="text-lg font-bold text-foreground">{cart.title}</SheetTitle>
            <SheetDescription className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {items.length > 0
                ? `${count} artículo${count === 1 ? "" : "s"} · ${cart.subtitle || "envío o retiro lo elegís al finalizar"}`
                : "Todavía no agregaste nada."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                {cart.emptyImage ? (
                  <img src={cart.emptyImage} alt="" className="size-40 object-contain" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-muted text-muted-foreground">
                    <HugeIcon icon={ShoppingBag02Icon} size={28} strokeWidth={2} aria-hidden />
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-lg font-bold text-foreground">{cart.emptyTitle}</p>
                  <p className="mx-auto max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                    {cart.emptyText}
                  </p>
                </div>
                <Button onClick={keepShopping}>{cart.emptyButton}</Button>
              </div>
            ) : (
              <>
                {/* Banner de promo (opcional): imagen y/o texto; si tiene link,
                    toda la tarjeta lo abre. */}
                {(cart.bannerImage || cart.bannerText) && (
                  <CartBanner
                    image={cart.bannerImage}
                    text={cart.bannerText}
                    link={cart.bannerLink}
                    onNavigate={(to) => {
                      dispatch(closeCart());
                      navigate(to);
                    }}
                  />
                )}
                {items.map((item) => {
                  const key = lineKey(item);
                  return (
                    <div
                      key={key}
                      className="flex gap-3 rounded-xl border border-border bg-background p-3"
                    >
                      <div className="product-stage h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {item.image ? (
                          <img src={item.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground">
                            <HugeIcon icon={ImageNotFound01Icon} size={20} strokeWidth={2} aria-hidden />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col">
                        <p className="flex items-center gap-1.5 text-sm leading-tight font-medium text-foreground">
                          {item.comboId && (
                            <Badge variant="promo" className="shrink-0 text-2xs">
                              Combo
                            </Badge>
                          )}
                          {item.name}
                        </p>
                        {/* Un combo es una línea atómica: lo que aclara la línea
                            no es su variante sino QUÉ trae el paquete. */}
                        {item.comboId ? (
                          item.comboProducts && item.comboProducts.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {item.comboProducts.map((p) => p.name).join(' + ')}
                            </p>
                          )
                        ) : (
                          item.variantName !== 'Estándar' && (
                            <p className="text-xs text-muted-foreground">{item.variantName}</p>
                          )
                        )}
                        <div className="mt-auto flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Quitar una unidad de ${item.name}`}
                              onClick={() =>
                                dispatch(setQuantity({ key, quantity: item.quantity - 1 }))
                              }
                              className="h-11 w-11 rounded-md md:h-6 md:w-6"
                            >
                              <HugeIcon icon={MinusSignIcon} size={12} strokeWidth={2} aria-hidden />
                            </Button>
                            <span className="w-5 text-center text-sm text-foreground tabular-nums">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Agregar una unidad de ${item.name}`}
                              onClick={() =>
                                dispatch(setQuantity({ key, quantity: item.quantity + 1 }))
                              }
                              className="h-11 w-11 rounded-md md:h-6 md:w-6"
                            >
                              <HugeIcon icon={Add01Icon} size={12} strokeWidth={2} aria-hidden />
                            </Button>
                          </div>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatCordobas(item.price * item.quantity, config?.currency)}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => dispatch(removeItem(key))}
                        aria-label={`Eliminar ${item.name} del carrito`}
                        className="h-11 w-11 shrink-0 self-start text-muted-foreground hover:text-destructive md:h-8 md:w-8"
                      >
                        <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                      </Button>
                    </div>
                  );
                })}

                <Button
                  variant="ghost"
                  onClick={keepShopping}
                  className="w-full justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 py-3 text-sm font-medium text-muted-foreground hover:border-primary-2/40 hover:text-foreground"
                >
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                  Agregar otro producto
                </Button>
              </>
            )}
          </div>

          {items.length > 0 && (
            <footer className="shrink-0 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-xl font-bold text-foreground tabular-nums">
                  {formatCordobas(subtotal, config?.currency)}
                </span>
              </div>
              {/* El total definitivo lo recalcula el servidor al crear el pedido. */}
              {/* Acción principal de la tienda (llena), no WhatsApp: este botón abre
                  el formulario; WhatsApp recién entra al enviar el pedido. */}
              <Button className="h-12 w-full" onClick={() => setCheckoutOpen(true)}>
                {cart.checkoutButton}
              </Button>
              {cart.footerNote && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{cart.footerNote}</p>
              )}
            </footer>
          )}
        </SheetContent>
      </Sheet>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </>
  );
}

/** Banner de promo del carrito. Link interno → navega y cierra; externo → pestaña nueva. */
function CartBanner({
  image,
  text,
  link,
  onNavigate,
}: {
  image: string;
  text: string;
  link: string;
  onNavigate: (to: string) => void;
}) {
  const body = (
    <>
      {image && <img src={image} alt={text || ''} className="w-full rounded-lg object-cover" />}
      {text && <p className="px-1 text-sm font-semibold text-foreground">{text}</p>}
    </>
  );
  const className =
    'flex w-full flex-col gap-2 rounded-xl border border-border bg-background p-2 text-left';

  if (!link) return <div className={className}>{body}</div>;
  if (/^https?:\/\//i.test(link)) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={cn(className, 'hover:border-foreground/30')}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onNavigate(link)} className={cn(className, 'hover:border-foreground/30')}>
      {body}
    </button>
  );
}
