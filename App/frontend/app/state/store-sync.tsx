import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { setupListeners } from '@reduxjs/toolkit/query';
import type { AppStore } from '~/state/store';
import { hydrate } from '~/state/slices/cart-slice';
import { loadCart, persistCart } from '~/lib/cart-storage';
import { loadCheckoutAttempt } from '~/lib/checkout-attempt';
import { checkoutExtrasChanged, checkoutFieldsChanged } from '~/state/slices/checkout-slice';

const useAppStore = useStore.withTypes<AppStore>();

// Los efectos del store se activan después de la hidratación de React.
export function StoreSync() {
  const store = useAppStore();

  useEffect(() => {
    const stopListeners = setupListeners(store.dispatch);
    // La vista previa del editor de portada es aislada: no toca el carrito real
    // guardado en este navegador (mismo origen que la tienda).
    if (new URLSearchParams(window.location.search).get('landing-preview') === '1') return stopListeners;
    store.dispatch(hydrate(loadCart()));
    const attempt = loadCheckoutAttempt();
    if (attempt) {
      const { customerName, phone, deliveryMethod, address, locationUrl, note } = attempt;
      // Un intento guardado antes de separar Managua de Cargo Trans dice 'envio': el formulario muestra
      // Managua y la persona lo cambia si hace falta. El intento guardado sigue igual para recuperarlo.
      store.dispatch(checkoutFieldsChanged({
        customerName, phone, address, locationUrl, note,
        deliveryMethod: deliveryMethod === 'envio' ? 'managua' : deliveryMethod,
      }));
      store.dispatch(checkoutExtrasChanged({ attempt, codeInput: attempt.discountCode ?? '' }));
    }
    let items = store.getState().cart.items;
    const unsubscribe = store.subscribe(() => {
      const nextItems = store.getState().cart.items;
      if (nextItems !== items) {
        items = nextItems;
        persistCart(items);
      }
    });
    return () => {
      unsubscribe();
      stopListeners();
    };
  }, [store]);

  return null;
}
