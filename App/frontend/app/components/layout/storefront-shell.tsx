// Chasis de las rutas públicas (home, ficha, combo, contacto): header sticky,
// el contenido de la ruta, y UNA sola instancia del carrito.
//
// Por qué existe: antes cada ruta montaba su propio <CartDrawer />. Eso daba
// tres copias vivas (home, producto, combo) y —peor— NINGUNA en /contacto, así
// que ahí el botón del carrito abría un panel que no existía. El carrito es
// estado global (cartSlice); su panel tiene que ser uno solo.
//
// El <main> lo pone cada ruta, no el shell: los anchos varían (la home es
// full-width por el hero, la ficha usa max-w-7xl y contacto max-w-4xl).
//
// El footer sí vive acá: antes era un bloque suelto dentro de `_index`, así que
// solo lo veía quien llegaba a la home — y la dirección, la garantía y el acceso
// del personal son justo lo que se busca desde una ficha de producto.
import type { ReactNode } from 'react';

import { CartDrawer } from '~/components/cart/cart-drawer';
import { PublicFooter } from '~/components/layout/public-footer';
import { StoreHeader } from '~/components/store/store-header';

export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StoreHeader />
      {/* flex-1 empuja el footer al fondo aunque la página sea corta. */}
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
      <CartDrawer />
    </div>
  );
}
