// Chasis de las rutas públicas: header, el contenido de la ruta, el footer y
// una sola instancia del carrito (es estado global).
//
// El <main> lo pone cada ruta porque los anchos varían.
import type { ReactNode } from 'react';
import { useSearchParams } from '@remix-run/react';
import { StoreEditorGate } from '~/components/editor/store-editor-gate';
import { LandingPreviewBridge } from '~/components/editor/landing-preview';

import { CartDrawer } from '~/components/cart/cart-drawer';
import { PublicFooter } from '~/components/storefront/public-footer';
import { StoreHeader } from '~/components/storefront/store-header';
import { useAppSelector } from '~/state/hooks';
import { selectEditMode, selectIsAdmin } from '~/state/slices/auth-slice';
import { cn } from '~/lib/utils';

export function StorefrontShell({ children }: { children: ReactNode }) {
  const editMode = useAppSelector(selectEditMode);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [params] = useSearchParams();
  const preview = params.get('landing-preview') === '1';
  if (editMode && isAdmin && !preview) return <StoreEditorGate />;

  return (
    <div className={cn("flex min-h-dvh flex-col pb-[var(--consent-height,0px)] transition-all duration-300", editMode && "editing-mode")}>
      {preview && <LandingPreviewBridge />}
      <StoreHeader />
      {/* flex-1 empuja el footer al fondo aunque la página sea corta. */}
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
      <CartDrawer />
    </div>
  );
}
