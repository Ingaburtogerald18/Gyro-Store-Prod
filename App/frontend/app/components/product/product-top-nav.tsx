// Barra de la ficha bajo el header: volver al catálogo y las acciones de la ficha. Sin carrito: el header
// ya tiene uno. Fija desde tableta; en el celular el header suma el buscador y tres barras no caben.
import { HugeIcon } from '~/components/ui/icon';
import { Share01Icon } from '@hugeicons/core-free-icons';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { categoryHref, findCategory } from '~/lib/catalog-query';
import { useStoreConfig } from '~/hooks/use-store-config';

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
      className="z-30 -mx-4 border-b bg-background px-4 md:sticky md:top-(--store-header-height)"
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
