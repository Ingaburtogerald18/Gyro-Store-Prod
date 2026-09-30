// Nav sticky de la ficha de producto (patrón del V1): queda pegado bajo el
// StoreHeader (h-16) con UNA acción de navegación — volver al catálogo — y las
// acciones de la ficha a la derecha. Sin breadcrumbs duplicados.
//
// El V1 traía además un botón de favorito; acá no va: no existe sistema de
// favoritos en el V2 (ni slice ni backend) y un control muerto es peor que
// ninguno. Cuando exista, este es su lugar.
import { HugeIcon } from '~/components/ui/icon';
import { Share01Icon, ShoppingCart02Icon } from '@hugeicons/core-free-icons';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { openCart, selectCartItems } from '~/store/slices/cartSlice';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';

export function ProductTopNav({
  productName,
  categoryName,
  categoryId,
}: {
  productName: string;
  categoryName?: string;
  categoryId?: string;
}) {
  const dispatch = useAppDispatch();
  const cartCount = useAppSelector(selectCartItems).reduce((n, it) => n + it.quantity, 0);

  async function handleShare() {
    const url = window.location.href;
    // navigator.share solo existe en móvil/HTTPS; el fallback copia el link.
    if (navigator.share) {
      try {
        await navigator.share({ title: productName, url });
      } catch {
        /* cancelado por el usuario: no es un error */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar el link.');
    }
  }

  return (
    <nav
      aria-label="Navegación del producto"
      className="sticky top-16 z-30 -mx-4 border-b bg-background/80 px-4 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between">
        <Breadcrumb className="ml-2">
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink asChild>
                <Link to="/#catalogo" prefetch="intent">
                  Inicio
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            
            {categoryName && categoryId && (
              <>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/?categoria=${encodeURIComponent(categoryId)}#catalogo`} prefetch="intent">
                      {categoryName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[120px] truncate sm:max-w-[200px]">
                {productName}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            aria-label={`Compartir ${productName}`}
            className="h-11 w-11"
          >
            <HugeIcon icon={Share01Icon} size={18} strokeWidth={2} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(openCart())}
            aria-label={cartCount > 0 ? `Abrir carrito (${cartCount})` : 'Abrir carrito'}
            className="relative h-11 w-11"
          >
            <HugeIcon icon={ShoppingCart02Icon} size={18} strokeWidth={2} aria-hidden />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-bold text-primary-foreground tabular-nums">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
}
