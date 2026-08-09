// Estado de sesión reflejado en el cliente. La fuente de verdad del ROL es el
// backend (GET /api/auth/me lo resuelve server-side con la service_role); acá
// solo se cachea lo que el server devolvió. El JWT nunca vive en Redux: lo
// gestiona el cliente de Supabase (lib/supabase.client.ts).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  name?: string | null;
  // 'admin' | 'seller' | 'cashier' | 'logistics_admin' | 'customer' — se deja
  // abierto para no duplicar la lista de roles que ya vive en el backend.
  role: string | null;
  /**
   * Foto de perfil resuelta por el BACKEND (`profiles.avatar_url`, que llena la
   * sincronización con Microsoft Graph). Es la única fuente confiable: en los
   * logins con Entra, `user_metadata.avatar_url` de Supabase viene vacío.
   */
  photoURL?: string | null;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  editMode: boolean;
}

const initialState: AuthState = {
  // 'unknown' hasta que useAuth consulte la sesión de Supabase al montar la app.
  status: 'unknown',
  user: null,
  editMode: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // La despacha useAuth al resolver la sesión inicial o en onAuthStateChange.
    sessionResolved(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? 'authenticated' : 'anonymous';
    },
    signedOut(state) {
      state.user = null;
      state.status = 'anonymous';
      state.editMode = false;
    },
    toggleEditMode(state) {
      state.editMode = !state.editMode;
    }
  },
  selectors: {
    selectAuthStatus: (state) => state.status,
    selectUser: (state) => state.user,
    selectIsStaff: (state) =>
      state.user?.role != null && state.user.role !== 'customer',
    selectEditMode: (state) => state.editMode,
    selectIsAdmin: (state) => state.user?.role === 'admin' || state.user?.role === 'global_admin',
    selectIsGlobalAdmin: (state) => state.user?.role === 'global_admin',
    // Cadena vacía → null, para que el `??` del call site caiga al fallback.
    selectUserPhoto: (state) => state.user?.photoURL || null,
  },
});

export const { sessionResolved, signedOut, toggleEditMode } = authSlice.actions;
export const {
  selectAuthStatus,
  selectUser,
  selectIsStaff,
  selectEditMode,
  selectIsAdmin,
  selectIsGlobalAdmin,
  selectUserPhoto,
} = authSlice.selectors;
export const authReducer = authSlice.reducer;
