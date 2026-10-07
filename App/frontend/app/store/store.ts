import { configureStore, combineReducers, type UnknownAction } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { authReducer, signedOut } from './slices/authSlice';
import { cartReducer } from './slices/cartSlice';
import { uiReducer } from './slices/uiSlice';
import { builderReducer } from './slices/builderSlice';
import { checkoutReducer } from './slices/checkoutSlice';

const appReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  cart: cartReducer,
  ui: uiReducer,
  builder: builderReducer,
  checkout: checkoutReducer,
});

type AppState = ReturnType<typeof appReducer>;

const rootReducer = (state: Parameters<typeof appReducer>[0], action: UnknownAction): AppState => {
  // Solo si HABÍA sesión. AuthSync también despacha `signedOut` al arrancar
  // para un visitante anónimo; vaciar la caché ahí tiraba las consultas que ya
  // estaban en vuelo (p. ej. la página de seguimiento de un pedido quedaba
  // cargando para siempre).
  if (state && signedOut.match(action) && state.auth?.status === 'authenticated') {
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

export const createAppStore = () => configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
