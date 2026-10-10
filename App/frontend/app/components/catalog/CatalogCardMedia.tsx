// Foto (o su fallback) de una tarjeta del catálogo admin con el badge de
// Público/Oculto, compartida por productos y combos para que se vean iguales.
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
          <Badge variant="category" className="bg-primary text-primary-foreground">
            <HugeIcon icon={GlobeIcon} size={12} strokeWidth={2} className="mr-1" /> Público
          </Badge>
        ) : (
          <Badge variant="category" className="bg-muted/80 text-muted-foreground hover:bg-muted">
            <HugeIcon icon={LockIcon} size={12} strokeWidth={2} className="mr-1" /> Oculto
          </Badge>
        )}
      </div>
    </div>
  );
}
