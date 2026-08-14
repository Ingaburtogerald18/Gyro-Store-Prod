// Footer del catálogo público. Sigue el sistema de diseño del preset
// shadcn "b2DcSjE3s" (Rhea · Neutral · Emerald · Geist):
//   - Fondo: bg-background (el más oscuro del sistema en dark)
//   - Separador superior: border-border (oklch(1 0 0 / 10%) en dark)
//   - Tarjeta de contenido: bg-card con rounded-xl y border-border
//   - Primario: --primary (emerald oklch ~0.508)
//   - Tipografía: Geist Variable, tamaños xs/sm con tracking ajustado
//   - Radios: radius-xl (var(--radius) + 4px = ~0.875rem) para chips
//   - Chips de redes: shape pill, sin borde extra, colores de marca
//   - Trust signals: icono primary + texto muted-foreground
//   - Bottom bar: border-t border-border, texto muted-foreground xs
import { HugeIcon } from '~/components/ui/icon';
import { Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import { useGetConfigQuery } from '~/store/api/sessionApi';
import { TRUST_SIGNALS } from '~/lib/trustSignals';
import { getBrandName } from '~/lib/brand';

// ─── Íconos SVG inline de redes sociales ────────────────────────────────────
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.34 2.88 2.88 0 0 1 2.31-4.53 2.66 2.66 0 0 1 1.04.2v-3.2A5.99 5.99 0 0 0 3.32 15a5.95 5.95 0 0 0 11.23 2.14v-6.32a8.04 8.04 0 0 0 5.04 1.76v-3.15a4.7 4.7 0 0 1-2.19-.51Z" />
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PublicFooter() {
  const { data: config } = useGetConfigQuery();
  const year = new Date().getFullYear();
  const brand = config?.brandName || getBrandName();
  const address = config?.address?.trim();
  const email = config?.contactEmail?.trim();

  const locationUrl = config?.locationUrl?.trim();
  const social = config?.socialLinks;

  const logoSrc = config?.images?.logoStatic || config?.images?.logoAnimated;
  const isVideo = logoSrc && /\.(webm|mp4|mov|m4v)($|\?)/i.test(logoSrc);

  return (
    <footer
      id="public-footer"
      className="border-t border-border bg-card"
    >
      {/* ── Cuerpo principal ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
        {/* Contenedor tipo card: alineado al preset (bg-card, border, rounded-xl) */}
        <div className="rounded-xl border border-border bg-card px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col items-center text-center gap-6">

            {/* ── Logo ────────────────────────────────────────────────────── */}
            {logoSrc ? (
              isVideo ? (
                <video
                  src={logoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden
                  className="h-10 md:h-14 w-auto max-w-[160px] object-contain transition-opacity duration-300 hover:opacity-90"
                />
              ) : (
                <img
                  src={logoSrc}
                  alt={brand}
                  loading="lazy"
                  decoding="async"
                  className="h-10 md:h-14 w-auto max-w-[160px] object-contain transition-opacity duration-300 hover:opacity-90"
                />
              )
            ) : (
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                Gyro<span className="text-primary">Store</span>
              </p>
            )}

            {/* ── Tagline ─────────────────────────────────────────────────── */}
            <p className="max-w-xs md:max-w-sm text-sm leading-relaxed text-muted-foreground text-balance">
              La tienda de tecnología con el mejor servicio al cliente de Nicaragua.
              Calidad, garantía y envíos seguros a todo el país.
            </p>

            {/* ── Trust signals ───────────────────────────────────────────── */}
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {TRUST_SIGNALS.map(({ icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <HugeIcon
                    icon={icon}
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="shrink-0 text-primary"
                  />
                  {label}
                </li>
              ))}
            </ul>

            {/* ── Redes sociales ──────────────────────────────────────────── */}
            {(social?.instagram || social?.facebook || social?.tiktok) && (
              <div className="flex items-center gap-2">
                {social.instagram && (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Instagram de ${brand}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F56040] text-white transition-all duration-200 hover:scale-110 hover:opacity-90 active:scale-95"
                  >
                    <InstagramIcon className="h-4 w-4" />
                  </a>
                )}
                {social.facebook && (
                  <a
                    href={social.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Facebook de ${brand}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2] text-white transition-all duration-200 hover:scale-110 hover:opacity-90 active:scale-95"
                  >
                    <FacebookIcon className="h-4 w-4" />
                  </a>
                )}
                {social.tiktok && (
                  <a
                    href={social.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`TikTok de ${brand}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-[#000] text-white transition-all duration-200 hover:scale-110 hover:opacity-90 active:scale-95"
                  >
                    <TikTokIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}

            {/* ── Contacto y ubicación ─────────────────────────────────────── */}
            {(address || email) && (
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {address && (
                  <a
                    href={locationUrl || `https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HugeIcon icon={Location01Icon} size={14} strokeWidth={2} aria-hidden />
                    {address}
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HugeIcon icon={Mail01Icon} size={14} strokeWidth={2} aria-hidden />
                    {email}
                  </a>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row">
          <p>© {year} {brand}. Todos los derechos reservados.</p>
          <p>
            Diseñado por{' '}
            <span className="font-medium text-foreground">Ing. Gerald Aburto</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
