import { useEffect } from 'react';
import { getSupabaseClient } from '~/lib/supabase.client';
import { useLazyGetMeQuery } from '~/state/api/session-api';
import { useAppDispatch } from '~/state/hooks';
import { signedOut } from '~/state/slices/auth-slice';

/** Sincroniza la sesión de Supabase con el authSlice y /api/auth/me. Se monta una vez en root.tsx. */
export function AuthSync() {
  const dispatch = useAppDispatch();
  const [getMe] = useLazyGetMeQuery();

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    // 1. Check initial session
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        getMe(); // Fetch full user profile from backend (will populate Redux)
      } else {
        dispatch(signedOut());
      }
    });

    // 2. Listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        getMe(); // Re-fetch on login/refresh
      } else {
        dispatch(signedOut());
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [dispatch, getMe]);

  return null; // This component has no UI
}
