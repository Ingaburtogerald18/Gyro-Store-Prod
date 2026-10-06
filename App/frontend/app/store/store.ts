import { configureStore, combineReducers, type UnknownAction } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { authReducer, signedOut } from './slices/authSlice';
import { cartReducer } from './slices/cartSlice';
import { uiReducer } from './slices/uiSlice';
import { builderReducer } from './slices/builderSlice';

const appReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  cart: cartReducer,
  ui: uiReducer,
  builder: builderReducer,
});

type AppState = ReturnType<typeof appReducer>;

const rootReducer = (state: Parameters<typeof appReducer>[0], action: UnknownAction): AppState => {
  if (state && signedOut.match(action)) {
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
