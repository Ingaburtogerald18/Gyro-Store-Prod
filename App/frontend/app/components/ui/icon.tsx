// Icono estático sobre cualquier icono de @hugeicons/core-free-icons.
//
// Reemplazo directo del antiguo `AnimatedIcon`: misma API (icon/size/strokeWidth/
// className), pero SIN animación ni framer-motion. Un icono de HugeIcons es data
// (un array de `[tag, attrs]`, y en toda la librería solo aparecen path, circle,
// ellipse y rect); acá se dibuja como un `<svg>` plano.
import * as React from 'react';
import type { IconSvgElement } from '@hugeicons/react';

export interface HugeIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** El icono de HugeIcons, tal cual se importa. */
  icon: IconSvgElement;
  size?: number;
  strokeWidth?: number;
}

export const HugeIcon = React.forwardRef<SVGSVGElement, HugeIconProps>(
  function HugeIcon({ icon, size = 24, strokeWidth, className, ...rest }, ref) {
    // Los sub-paths de HugeIcons traen su propio strokeWidth ("1.5"), que gana
    // sobre el del <svg>. Para que la prop `strokeWidth` haga algo hay que
    // pisarlo elemento por elemento.
    const childAttrs = (attrs: { readonly [key: string]: string | number }) =>
      strokeWidth === undefined ? { ...attrs } : { ...attrs, strokeWidth };

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        // El color SIEMPRE se hereda: los attrs de HugeIcons ya traen
        // stroke="currentColor", así que el theming funciona sin tocar nada.
        color="currentColor"
        className={className}
        // Decorativo POR DEFECTO, que es lo que son casi todos: el texto del
        // control ya dice qué hace. Pero si el call-site declaró `role` o
        // `aria-label`, mandan ellos y no se oculta del lector de pantalla.
        {...(rest['aria-label'] === undefined && rest.role === undefined
          ? { 'aria-hidden': true as const }
          : {})}
        {...rest}
      >
        {icon.map(([tag, attrs], i) =>
          React.createElement(tag, { ...childAttrs(attrs), key: attrs.key ?? i }),
        )}
      </svg>
    );
  },
);

HugeIcon.displayName = 'HugeIcon';
