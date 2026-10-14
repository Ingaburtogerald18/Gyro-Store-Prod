// Footer del catálogo público, compacto y con datos REALES de la configuración:
// contacto, dirección y mapa, pedidos y ayuda, y la información comercial
// de garantía, pago y entrega siempre visible. No se inventan
// horarios ni datos que la tienda no cargó en el panel.
//
//   - Claro: fondo blanco (bg-card) con una línea tinta arriba, el mismo trazo
//     de los botones. Oscuro: el gris de las tarjetas con un borde fino.
//   - Marca: el logo configurado en el panel (el mismo del header); sin logo, la
//     bolsa de Gyro con el nombre.
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import gyroBag from '~/assets/brand/gyro-bag.png';
import { categoryHref, inCategory } from '~/components/storefront/category-nav';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useStoreCatalog, useStoreConfig } from '~/hooks/use-store-config';
import { getBrandName } from '~/lib/brand';
import { buildWhatsappUrl } from '~/lib/formatters';
import { STORE_POLICIES } from '~/lib/store-policies';

const HEADING = 'mb-3 text-sm font-bold text-foreground';
const LINK =
  'inline-flex min-h-11 max-w-full items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8 md:justify-start';

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
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pt-8 pb-6 text-center md:grid-cols-[1.3fr_1fr_1fr_1.2fr] md:gap-8 md:pt-10 md:pb-8 md:text-left">
        {/* Marca y redes */}
        <div className="flex flex-col items-center gap-3 md:items-start">
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ir al inicio de ${brand}`}>
            {logo ? (
              <img src={logo} alt="" height={40} loading="lazy" decoding="async" className="h-10 w-auto max-w-[160px] object-contain object-center md:object-left" />
            ) : (
              <>
                <img src={gyroBag} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10" />
                <span className="font-heading text-xl font-extrabold tracking-tight">{brand}</span>
              </>
            )}
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Comprar con confianza nunca estuvo tan cerca de vos. Todo lo que necesitás, a un clic de distancia
          </p>
          {socialItems.length > 0 && (
            <ul className="flex items-center justify-center gap-2 md:justify-start" aria-label="Redes sociales">
              {socialItems.map(({ key, label, href, Icon }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} de ${brand}`}
                    className="grid size-11 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon className="size-6" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* En móvil, enlaces cortos en dos columnas y contacto a todo el ancho.
            En escritorio, Ayuda y contacto comparten su columna original. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:contents">
          <nav aria-label="Categorías de la tienda">
            <p className={HEADING}>Tienda</p>
            <ul className="md:space-y-1">
              <li><Link to="/#catalogo" className={LINK}>Todo el catálogo</Link></li>
              {categories.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link to={categoryHref(c.slug)} className={LINK}>{c.name}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="contents md:block">
            <nav aria-label="Ayuda">
              <p className={HEADING}>Ayuda</p>
              <ul className="md:space-y-1">
                <li><Link to="/mis-pedidos" className={LINK}>Mis pedidos</Link></li>
                <li><Link to="/contacto" className={LINK}>Contacto</Link></li>
              </ul>
            </nav>
            {(whatsappUrl || email || address || mapsUrl) && (
              <ul aria-label="Contacto de la tienda" className="col-span-2 border-t border-border pt-4 text-left md:mt-1 md:space-y-1 md:border-0 md:pt-0">
                {whatsappUrl && (
                  <li>
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                      <WhatsappIcon aria-hidden className="size-4 shrink-0" />
                      WhatsApp
                    </a>
                  </li>
                )}
                {email && (
                  <li>
                    <a href={`mailto:${email}`} className={LINK}>
                      <HugeIcon icon={Mail01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
                    </a>
                  </li>
                )}
                {(address || mapsUrl) && (
                  <li>
                    {mapsUrl ? (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${LINK} mx-auto max-w-xs py-2 max-md:items-start md:mx-0 md:max-w-full md:py-0`}>
                        <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 md:mt-0" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{address || 'Cómo llegar'}</span>
                      </a>
                    ) : (
                      <span className={`${LINK} mx-auto max-w-xs py-2 max-md:items-start md:mx-0 md:max-w-full md:py-0`}>
                        <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 md:mt-0" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{address}</span>
                      </span>
                    )}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Información comercial reunida en un bloque, siempre visible. */}
        <div className="text-left">
          <p className={HEADING}>Información adicional</p>
          <div className="max-w-sm space-y-3 pb-1 text-left text-sm leading-relaxed text-muted-foreground md:max-w-none md:space-y-2">
            <p><span className="font-medium text-foreground">{STORE_POLICIES.warranty.title}</span> {STORE_POLICIES.warranty.text.toLowerCase()}</p>
            <p><span className="font-medium text-foreground">Pago:</span> {STORE_POLICIES.payment.title.toLowerCase()}.</p>
            <p><span className="font-medium text-foreground">{STORE_POLICIES.managua.title}.</span> {STORE_POLICIES.managua.text}</p>
            <p><span className="font-medium text-foreground">{STORE_POLICIES.outside.title}.</span> {STORE_POLICIES.outside.text}</p>
            <p>{STORE_POLICIES.shippingNote}</p>
          </div>
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-4 text-left text-xs text-muted-foreground md:flex-row md:items-center md:gap-1 md:py-3 md:text-center">
          <p>Todos los derechos reservados · {brand} {year}</p>
          <p>
            Diseñado por <span className="font-medium text-foreground">Ing. Gerald Aburto</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
