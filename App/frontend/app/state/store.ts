import { configureStore, combineReducers, type UnknownAction } from '@reduxjs/toolkit';
import { baseApi } from './api/base-api';
import { authReducer, signedOut } from './slices/auth-slice';
import { cartReducer } from './slices/cart-slice';
import { uiReducer } from './slices/ui-slice';
import { builderReducer } from './slices/builder-slice';
import { checkoutReducer } from './slices/checkout-slice';

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
  // Solo si había sesión: AuthSync despacha `signedOut` al arrancar y vaciar la caché ahí cortaba
  // consultas en vuelo (el seguimiento de un pedido quedaba cargando).
  if (state && signedOut.match(action) && state.auth?.status === 'authenticated') {
    // Al cerrar sesión se descarta la caché de RTK Query (ventas, contactos…): nada queda al volver atrás.
    // Se conservan el carrito y la UI.
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
