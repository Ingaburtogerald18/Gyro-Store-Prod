import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasStoredSession, loadSupabase, onSupabaseCreated } from '~/lib/session.client';
import { useLazyGetMeQuery } from '~/state/api/session-api';
import { useAppDispatch } from '~/state/hooks';
import { signedOut } from '~/state/slices/auth-slice';

/** Sincroniza la sesión de Supabase con el authSlice y /api/auth/me. Se monta una vez en root.tsx. */
export function AuthSync() {
  const dispatch = useAppDispatch();
  const [getMe] = useLazyGetMeQuery();

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const follow = (supabase: SupabaseClient) => {
      if (!active) return;
      // 1. Sesión inicial
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        if (data.session) getMe();
        else dispatch(signedOut());
      });
      // 2. Cambios: login, renovación del token, salida
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        if (session) getMe();
        else dispatch(signedOut());
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    let stopWaiting = () => {};
    if (hasStoredSession()) {
      loadSupabase().then(({ getSupabaseClient }) => follow(getSupabaseClient()));
    } else {
      // Visitante: no se carga supabase-js. Si después abre el login, el cliente nace ahí y se sigue desde entonces.
      dispatch(signedOut());
      stopWaiting = onSupabaseCreated(follow);
    }

    return () => {
      active = false;
      stopWaiting();
      unsubscribe();
    };
  }, [dispatch, getMe]);

  return null;
}
