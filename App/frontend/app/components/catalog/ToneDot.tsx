// Punto de color de identidad de una categoría (o de la categoría a la que
// pertenece una plantilla). El tono se deriva del id — ver `~/lib/tone`.
//
// Es DECORATIVO en el sentido accesible del término: el nombre siempre está al
// lado, así que el punto ayuda a reconocer de un vistazo pero nunca es la única
// forma de distinguir un elemento. Por eso va `aria-hidden`.
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
