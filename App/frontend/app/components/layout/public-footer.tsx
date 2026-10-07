// Footer del catálogo público, compacto y con datos REALES de la configuración:
// contacto, dirección y mapa, pedidos y ayuda, y la información comercial
// breve (garantía, pago y entrega) con el detalle plegado. No se inventan
// horarios ni datos que la tienda no cargó en el panel.
//
//   - Claro: fondo blanco (bg-card) con una línea tinta arriba, el mismo trazo
//     de los botones. Oscuro: el gris de las tarjetas con un borde fino.
//   - Marca: el logo configurado en el panel (el mismo del header); sin logo, la
//     bolsa de Gyro con el nombre.
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowDown01Icon, Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import gyroBag from '~/assets/brand/gyro-bag.png';
import { categoryHref, inCategory } from '~/components/store/category-nav';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useStoreCatalog, useStoreConfig } from '~/hooks/useStoreConfig';
import { getBrandName } from '~/lib/brand';
import { buildWhatsappUrl } from '~/lib/formatters';
import { STORE_POLICIES } from '~/lib/storePolicies';

const HEADING = 'mb-3 text-sm font-bold text-foreground';
const LINK =
  'inline-flex min-h-8 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function PublicFooter() {
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const year = new Date().getFullYear();
  const brand = config?.brandName || getBrandName();
  const logo = config?.images?.logoStatic;
  const email = config?.contactEmail?.trim();
  const address = config?.address?.trim();
  // La ubicación del panel manda; si no hay, se busca la dirección en Maps.
  const mapsUrl =
    config?.locationUrl?.trim() ||
    (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '');
  const whatsappUrl = config?.whatsapp
    ? buildWhatsappUrl(config.whatsapp, `Hola ${brand}, tengo una consulta`)
    : '';

  const social = config?.socialLinks;
  const socialItems = [
    { key: 'facebook', label: 'Facebook', href: social?.facebook?.trim(), Icon: FacebookIcon },
    { key: 'instagram', label: 'Instagram', href: social?.instagram?.trim(), Icon: InstagramIcon },
    { key: 'tiktok', label: 'TikTok', href: social?.tiktok?.trim(), Icon: TikTokIcon },
  ].filter((s) => Boolean(s.href));

  // Solo categorías con productos (si el catálogo todavía no cargó, todas).
  const categories = (config?.categories ?? []).filter(
    (c) => products.length === 0 || products.some((p) => inCategory(p, c)),
  );

  return (
    <footer
      id="public-footer"
      className="relative mt-12 border-t-2 border-t-foreground bg-card text-foreground dark:border-t dark:border-t-border"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-10 pb-8 md:grid-cols-[1.3fr_1fr_1fr_1.2fr] md:gap-8">
        {/* Marca y redes */}
        <div className="space-y-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ir al inicio de ${brand}`}>
            {logo ? (
              <img src={logo} alt="" height={40} loading="lazy" decoding="async" className="h-10 w-auto max-w-[160px] object-contain object-left" />
            ) : (
              <>
                <img src={gyroBag} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10" />
                <span className="font-heading text-xl font-extrabold tracking-tight">{brand}</span>
              </>
            )}
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Audífonos KZ y accesorios en Managua. Pedí por la web y coordinamos por WhatsApp.
          </p>
          {socialItems.length > 0 && (
            <ul className="flex items-center gap-2" aria-label="Redes sociales">
              {socialItems.map(({ key, label, href, Icon }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} de ${brand}`}
                    className="grid size-11 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon className="size-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tienda y Ayuda: lado a lado en el celular, dos columnas en escritorio. */}
        <div className="grid grid-cols-2 gap-8 md:contents">
          <nav aria-label="Categorías de la tienda">
            <p className={HEADING}>Tienda</p>
            <ul className="space-y-1">
              <li><Link to="/#catalogo" className={LINK}>Todo el catálogo</Link></li>
              {categories.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link to={categoryHref(c.slug)} className={LINK}>{c.name}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Ayuda">
            <p className={HEADING}>Ayuda</p>
            <ul className="space-y-1">
              <li><Link to="/mis-pedidos" className={LINK}>Mis pedidos</Link></li>
              <li><Link to="/contacto" className={LINK}>Contacto</Link></li>
              {whatsappUrl && (
                <li>
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    <WhatsappIcon aria-hidden className="size-4" />
                    WhatsApp
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a href={`mailto:${email}`} className={LINK}>
                    <HugeIcon icon={Mail01Icon} size={16} strokeWidth={2} aria-hidden />
                    <span className="break-all">{email}</span>
                  </a>
                </li>
              )}
              {(address || mapsUrl) && (
                <li>
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                      <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                      {address || 'Cómo llegar'}
                    </a>
                  ) : (
                    <span className={LINK}>
                      <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                      {address}
                    </span>
                  )}
                </li>
              )}
            </ul>
          </nav>
        </div>

        {/* Compra: breve, con el detalle de entregas plegado. */}
        <div>
          <p className={HEADING}>Comprar con confianza</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li><span className="font-medium text-foreground">{STORE_POLICIES.warranty.title}</span> {STORE_POLICIES.warranty.text.toLowerCase()}</li>
            <li><span className="font-medium text-foreground">Pago:</span> {STORE_POLICIES.payment.title.toLowerCase()}.</li>
          </ul>
          <details className="group mt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary-2 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              Entregas y envíos
              <HugeIcon icon={ArrowDown01Icon} size={16} aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="space-y-2 pb-1 text-sm leading-relaxed text-muted-foreground">
              <p><span className="font-medium text-foreground">{STORE_POLICIES.managua.title}.</span> {STORE_POLICIES.managua.text}</p>
              <p><span className="font-medium text-foreground">{STORE_POLICIES.outside.title}.</span> {STORE_POLICIES.outside.text}</p>
              <p>{STORE_POLICIES.shippingNote}</p>
            </div>
          </details>
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-4 py-3 text-center text-xs text-muted-foreground sm:flex-row">
          <p>© {year} {brand}.</p>
          <p className="flex flex-wrap items-center justify-center gap-x-3">
            <Link to="/login" className="underline-offset-4 hover:underline">Acceso del personal</Link>
            <span>
              Diseñado por <span className="font-medium text-foreground">Ing. Gerald Aburto</span>
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
