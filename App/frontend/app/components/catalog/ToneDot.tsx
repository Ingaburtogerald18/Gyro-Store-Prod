// El punto acompaña al nombre de la categoría y usa el acento común de la marca.
import { toneDotClass } from '~/lib/tone';
import { cn } from '~/lib/utils';

export function ToneDot({
  toneKey,
  className,
}: {
  /** id de la categoría. Vacío = sin clasificar, se pinta gris. */
  toneKey?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', toneDotClass(toneKey), className)}
    />
  );
}
