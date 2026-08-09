// Callback de OAuth (Microsoft/Entra vía Supabase). Es la URL a la que Supabase
// redirige tras autenticar, con `?code=…` (flujo PKCE).
//
// El cliente de Supabase (detectSessionInUrl: true) intercambia ese code por una
// sesión en segundo plano al inicializarse; esta ruta solo ESPERA a que la
// sesión exista y entonces manda a /admin. Antes no había callback: el usuario
// caía en `/` con el `?code=` colgado, logueado pero sin llegar al panel.
import { useEffect, useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import { Spinner } from "~/components/ui/spinner";
import { getSupabaseClient } from "~/lib/supabase.client";
import { pageTitle } from "~/lib/brand";

export const meta: MetaFunction = () => [{ title: pageTitle("Iniciando sesión") }];

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Si el proveedor devolvió un error explícito, no tiene sentido esperar.
    const params = new URLSearchParams(window.location.search);
    const providerError = params.get("error_description") || params.get("error");
    if (providerError) {
      setError(decodeURIComponent(providerError));
      return;
    }

    let done = false;
    const supabase = getSupabaseClient();

    const goAdmin = () => {
      if (done) return;
      done = true;
      // Navegación completa (no client-side): arranca /admin con estado limpio y
      // deja el JWT ya persistido por Supabase.
      window.location.replace("/admin");
    };

    // 1) Puede que la sesión ya exista (intercambio instantáneo).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goAdmin();
    });

    // 2) Si no, el intercambio de detectSessionInUrl dispara SIGNED_IN al terminar.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) goAdmin();
    });

    // 3) Red de seguridad: si en 10 s no hubo sesión, algo falló (code inválido,
    //    verifier perdido, etc.). Mostramos error en vez de un spinner eterno.
    const timeout = setTimeout(() => {
      if (!done) setError("No se pudo completar el inicio de sesión. Intentá de nuevo.");
    }, 10_000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      {error ? (
        <>
          <p className="text-sm text-destructive max-w-sm text-center px-6">{error}</p>
          <a href="/login" className="text-sm text-primary underline underline-offset-4">
            Volver a intentar
          </a>
        </>
      ) : (
        <>
          <Spinner className="text-primary" />
          <p className="text-sm text-muted-foreground">Completando inicio de sesión…</p>
        </>
      )}
    </main>
  );
}
