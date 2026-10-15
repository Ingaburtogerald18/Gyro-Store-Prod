// Miniatura de una foto subida, con vuelta a la original mientras no exista: las fotos anteriores a las
// miniaturas no tienen una hasta correr `npm run thumbnails:backfill`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { thumbnailUrl } from '@shared/image-variants';

export function useThumbnail(url: string | undefined) {
  const ref = useRef<HTMLImageElement>(null);
  const candidate = thumbnailUrl(url);
  const [failed, setFailed] = useState<string | null>(null);
  const thumb = candidate && failed !== candidate ? candidate : null;

  /** `true` si pasó a la foto original; `false` si ya la estaba usando. */
  const fallback = useCallback(() => {
    if (!thumb) return false;
    setFailed(thumb);
    return true;
  }, [thumb]);

  // Un error antes de hidratar no llega a onError: se revisa la imagen del DOM.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) fallback();
  }, [fallback]);

  return { ref, thumb, fallback };
}
