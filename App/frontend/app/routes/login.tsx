import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";
import { Link } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { getSupabaseClient } from "~/lib/supabase.client";
import { useGetConfigQuery } from "~/store/api/sessionApi";
import { Spinner } from "~/components/ui/spinner";
import { getBrandName, pageTitle } from "~/lib/brand";

export const meta: MetaFunction = () => [
  { title: pageTitle("Acceso Colaboradores") },
  { name: "description", content: `Acceso exclusivo para personal de ${getBrandName()}` }
];

export default function Login() {
  const { data: config } = useGetConfigQuery();
  const brand = config?.brandName || getBrandName();
  const internalDomain = config?.internalDomain ?? "";

  const [busy, setBusy] = useState<null | "microsoft">(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => setGreeting(getGreeting()), []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          window.location.href = '/admin';
        } else {
          setIsLoading(false);
        }
      } catch (e) {
        console.error(e);
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  async function runMicrosoft() {
    setBusy("microsoft");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          scopes: 'email openid profile User.Read',
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      
    } catch (err: any) {
      toast.error(err?.message || "No se pudo iniciar sesión con Microsoft.");
      setBusy(null);
    }
  }

  // Imagen propia del acceso (Recursos de imágenes → "Inicio de sesión"); si no
  // se cargó, el logo estático, igual que el header de la tienda.
  const loginImage = config?.images?.loginImage || config?.images?.logoStatic;

  if (isLoading) {
    return (
      <div className="store-palette min-h-screen flex items-center justify-center bg-background">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    // `.store-palette` trae la paleta de la tienda (crema, amarillo, tinta) sin
    // cambiar el área de la ruta; la tipografía Chivo ya es compartida.
    // Pantalla partida, sin tarjeta: la imagen sobre el teal de marca (en oscuro,
    // gris carbón: el color lo pone la imagen) y el formulario sobre el fondo.
    <main className="store-palette grid min-h-screen w-full bg-background font-sans text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section
        aria-label={brand}
        className="flex items-center justify-center border-b-2 border-[var(--ink)] bg-brand px-6 py-8 lg:border-b-0 lg:border-r-2 lg:p-12 dark:border-border dark:bg-card lg:dark:border-r"
      >
        {loginImage ? (
          <img
            src={loginImage}
            alt={brand}
            className="max-h-36 w-full max-w-[520px] object-contain lg:max-h-[420px]"
          />
        ) : (
          <span className="text-3xl font-extrabold tracking-tight text-brand-foreground lg:text-5xl">
            {brand}
          </span>
        )}
      </section>

      <section className="flex flex-col px-6 py-6 sm:px-10 lg:px-16 lg:py-10">
        {/* Salir/cancelar va en rojo lleno, como en el resto del proyecto. */}
        <Button asChild variant="destructiveSolid" className="w-fit font-semibold">
          <Link to="/">
            <HugeIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2} /> Volver al catálogo
          </Link>
        </Button>

        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[400px]">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-2">
              Acceso colaboradores
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Iniciar sesión</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {greeting ? `${greeting}. ` : ""}Ingresa con tu cuenta corporativa de Microsoft.
            </p>

            <Button
              disabled={busy === "microsoft"}
              onClick={runMicrosoft}
              className="mt-8 h-12 w-full rounded-xl text-base font-semibold"
            >
              {busy !== "microsoft" ? <OutlookIcon className="size-5" /> : <Spinner />}
              Continuar con Microsoft
            </Button>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Solo cuentas autorizadas de {brand}
              {internalDomain ? ` (@${internalDomain}, @hotmail o @outlook)` : ""}.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#0078D4" />
      <path d="M3.2 7.2 12 13l8.8-5.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
