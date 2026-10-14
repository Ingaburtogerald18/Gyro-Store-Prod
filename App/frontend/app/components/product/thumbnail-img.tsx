// Foto chica de producto (miniaturas de la galería, carrito): pide la miniatura y, si no existe, la original.
import type { ImgHTMLAttributes } from 'react';
import { useThumbnail } from '~/hooks/use-thumbnail';

export function ThumbnailImg({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const { ref, thumb, fallback } = useThumbnail(src);
  return <img {...props} ref={ref} src={thumb ?? src} alt={alt} onError={fallback} />;
}
