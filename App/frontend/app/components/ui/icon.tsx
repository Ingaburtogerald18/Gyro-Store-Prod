// Ícono estático de @hugeicons: los íconos son datos (path, circle, ellipse, rect) y se dibujan como <svg>.
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
    // Los paths traen su propio strokeWidth: para que la prop funcione hay que pisarlo en cada uno.
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
        // Decorativo por defecto; si se declaró `role` o `aria-label`, no se oculta del lector de pantalla.
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
