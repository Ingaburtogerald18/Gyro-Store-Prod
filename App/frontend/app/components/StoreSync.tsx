import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { setupListeners } from '@reduxjs/toolkit/query';
import type { AppStore } from '~/store/store';
import { hydrate } from '~/store/slices/cartSlice';
import { loadCart, persistCart } from '~/lib/cartStorage';

const useAppStore = useStore.withTypes<AppStore>();

// Los efectos del store se activan después de la hidratación de React.
export function StoreSync() {
  const store = useAppStore();

  useEffect(() => {
    const stopListeners = setupListeners(store.dispatch);
    store.dispatch(hydrate(loadCart()));
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
