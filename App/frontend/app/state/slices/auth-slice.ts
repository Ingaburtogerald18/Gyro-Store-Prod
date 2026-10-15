// La fuente de verdad del rol es el backend (/api/auth/me); acá solo se cachea. El JWT no vive en Redux.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { isAdminRole, isStaffRole } from '~/lib/roles';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  name?: string | null;
  // 'admin' | 'seller' | 'cashier' | 'logistics_admin' | 'customer' — se deja
  // abierto para no duplicar la lista de roles que ya vive en el backend.
  role: string | null;
  /** Foto de `profiles.avatar_url`, que cada persona sube desde «Mi perfil». */
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
    selectIsStaff: (state) => isStaffRole(state.user?.role),
    selectEditMode: (state) => state.editMode,
    selectIsAdmin: (state) => isAdminRole(state.user?.role),
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
