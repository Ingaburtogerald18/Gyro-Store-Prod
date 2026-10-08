// Nav sticky de la ficha de producto (patrón del V1): queda pegado bajo el
// StoreHeader (57px de alto, por eso top-[57px]) con UNA acción de navegación — volver al catálogo — y las
// acciones de la ficha a la derecha. Sin breadcrumbs duplicados.
//
// El V1 traía además un botón de favorito; acá no va: no existe sistema de
// favoritos en el V2 (ni slice ni backend) y un control muerto es peor que
// ninguno. Cuando exista, este es su lugar.
//
// Tampoco lleva carrito: el header ya tiene uno y dos íconos de carrito a 50px
// de distancia solo hacían dudar cuál usar.
import { HugeIcon } from '~/components/ui/icon';
import { Share01Icon } from '@hugeicons/core-free-icons';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { categoryHref } from '~/components/store/category-nav';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { findCategory } from '~/lib/catalogQuery';

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
  // Mismo enlace que el navbar (por slug), no el id técnico.
  const config = useStoreConfig();
  const category = findCategory(config?.categories ?? [], categoryId) ?? findCategory(config?.categories ?? [], categoryName);

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
      className="sticky top-[57px] z-30 -mx-4 border-b bg-background/80 px-4 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between">
        <Breadcrumb className="ml-2">
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink asChild>
                <Link to="/" prefetch="intent">
                  Inicio
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            
            {category && (
              <>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={categoryHref(category.slug)} prefetch="intent">
                      {category.name}
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
        </div>
      </div>
    </nav>
  );
}
