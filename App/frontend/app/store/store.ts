// Store global (doc 09 ítem 40): baseApi (RTK Query) + slices auth/cart/ui.
//
// Es un singleton de módulo: en SSR el proceso lo comparte entre requests, lo
// cual es seguro HOY porque nada del server despacha acciones (RTK Query corre
// solo en el navegador). Si algún día se hace prefetch SSR, hay que pasar a
// un store por request.
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from './api/baseApi';
import { authReducer } from './slices/authSlice';
import { cartReducer, hydrate } from './slices/cartSlice';
import { uiReducer } from './slices/uiSlice';

const appReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  cart: cartReducer,
  ui: uiReducer,
});

const rootReducer = (state: any, action: any) => {
  if (action.type === 'auth/signedOut') {
    // Al cerrar sesión, destruimos toda la caché de RTK Query (ventas, contactos, etc.)
    // para evitar que queden datos expuestos si el usuario presiona "Atrás".
    // Mantenemos solo el carrito (público) y la UI.
    state = {
      cart: state.cart,
      ui: state.ui,
    };
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

// refetchOnFocus / refetchOnReconnect para los endpoints que lo pidan.
setupListeners(store.dispatch);

// Rehidrata el carrito desde localStorage (el SSR arranca vacío). La escritura
// la hace el propio cartSlice en cada reducer que muta líneas.
if (typeof window !== 'undefined') {
  store.dispatch(hydrate());
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
