// Cabecera visual de una tarjeta del catálogo admin: la foto (o su fallback) con
// el badge de Público/Oculto encima.
//
// Estaba duplicada CARÁCTER POR CARÁCTER en `SortableCatalogGrid` y en
// `CombosPanel` — mismo `aspect-square`, mismo icono de fallback, mismas clases
// del badge. Dos copias del mismo bloque son dos lugares donde arreglar el mismo
// detalle visual, y basta que alguien toque una para que las tarjetas de
// productos y las de combos dejen de parecerse.
import { HugeIcon } from '~/components/ui/icon';
import { GlobeIcon, Image01Icon, LockIcon } from '@hugeicons/core-free-icons';

import { Badge } from '~/components/ui/badge';

export function CatalogCardMedia({
  image,
  alt,
  published,
}: {
  image?: string | null;
  alt: string;
  published?: boolean;
}) {
  return (
    <div className="aspect-square w-full shrink-0 overflow-hidden bg-muted/40 relative flex items-center justify-center text-muted-foreground">
      {image ? (
        <img src={image} alt={alt} className="absolute inset-0 object-cover w-full h-full" />
      ) : (
        <HugeIcon icon={Image01Icon} size={48} strokeWidth={2} className="opacity-50" />
      )}

      {/* El estado va sobre la imagen y no debajo del título: en una grilla, lo
          primero que se busca es cuáles están publicados. */}
      <div className="absolute bottom-2 right-2">
        {published ? (
          <Badge variant="secondary" className="bg-primary text-primary-foreground shadow-sm">
            <HugeIcon icon={GlobeIcon} size={12} strokeWidth={2} className="mr-1" /> Público
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-muted/80 text-muted-foreground hover:bg-muted">
            <HugeIcon icon={LockIcon} size={12} strokeWidth={2} className="mr-1" /> Oculto
          </Badge>
        )}
      </div>
    </div>
  );
}
