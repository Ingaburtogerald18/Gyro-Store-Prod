// Footer en cuatro grupos (DESIGN.md §10): Gyro Store, Comprar, Ayuda y Contacto, con datos de
// Configuración. Lo extenso vive en Ayuda; acá solo enlaces y datos de contacto.
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { Clock01Icon, Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import gyroBag from '~/assets/brand/gyro-bag.png';
import { categoryHref, inCategory } from '~/lib/catalog-query';
import { STORE_PAGES, storeMapsUrl } from '~/lib/store-pages';
import { INFO_LINK } from '~/components/storefront/store-details';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useStoreCatalog, useStoreConfig } from '~/hooks/use-store-config';
import { getBrandName } from '~/lib/brand';
import { buildWhatsappUrl } from '~/lib/formatters';
import { trackWhatsappOpen } from '~/lib/analytics.client';

const HEADING = 'mb-3 text-sm font-bold text-foreground';
const LINK =
  'inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8';

export function PublicFooter() {
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const year = new Date().getFullYear();
  const brand = config?.brandName || getBrandName();
  const logo = config?.images?.logoStatic;
  const email = config?.contactEmail?.trim();
  const address = config?.address?.trim();
  const hours = config?.businessHours ?? [];
  const mapsUrl = storeMapsUrl(config);
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
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 pt-8 pb-6 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-8 md:pt-10 md:pb-8">
        {/* Gyro Store: qué vende y dónde, con datos confirmados. */}
        <div className="col-span-2 flex flex-col items-start gap-3 md:col-span-1">
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
            Tienda en línea de accesorios tecnológicos en Managua, Nicaragua. Importación directa, asesoría y
            garantía por fallas de fábrica.
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
                    <Icon className="size-6" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav aria-label="Comprar">
          <p className={HEADING}>Comprar</p>
          <ul className="md:space-y-1">
            <li><Link to={categoryHref(null)} className={LINK}>Todo el catálogo</Link></li>
            {categories.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link to={categoryHref(c.slug)} className={LINK}>{c.name}</Link>
              </li>
            ))}
            <li><Link to={STORE_PAGES.wholesale} className={LINK}>Por mayor</Link></li>
          </ul>
        </nav>

        <nav aria-label="Ayuda">
          <p className={HEADING}>Ayuda</p>
          <ul className="md:space-y-1">
            <li><Link to={STORE_PAGES.howToBuy} className={LINK}>Cómo comprar</Link></li>
            <li><Link to={STORE_PAGES.paymentsDelivery} className={LINK}>Pagos y entregas</Link></li>
            {config?.policies?.warrantyPage && (
              <li><Link to={STORE_PAGES.warranty} className={LINK}>Garantía y cambios</Link></li>
            )}
            <li><Link to={STORE_PAGES.orders} className={LINK}>Mis pedidos</Link></li>
            <li><Link to={STORE_PAGES.contact} className={LINK}>Contacto</Link></li>
          </ul>
        </nav>

        <div className="col-span-2 md:col-span-1">
          <p className={HEADING}>Contacto</p>
          <ul aria-label="Contacto de la tienda" className="md:space-y-1">
            {whatsappUrl && (
              <li>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK} onClick={() => trackWhatsappOpen('consult')}>
                  <WhatsappIcon aria-hidden className="size-4 shrink-0" />
                  <span>WhatsApp {config?.whatsapp}</span>
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
            {address && (
              // Punto de retiro, no un local abierto al público.
              <li className="flex gap-2 py-2 text-sm text-muted-foreground md:py-1">
                <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">Punto de retiro: </span>
                  <span className="[overflow-wrap:anywhere]">{address}</span>
                  {mapsUrl && (
                    <>
                      {' · '}
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={INFO_LINK}>
                        Cómo llegar
                      </a>
                    </>
                  )}
                </span>
              </li>
            )}
            {hours.length > 0 && (
              <li className="flex gap-2 py-2 text-sm text-muted-foreground md:py-1">
                <HugeIcon icon={Clock01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
                <dl className="min-w-0">
                  <dt className="font-medium text-foreground">Horario de atención</dt>
                  {hours.map((row) => (
                    <dd key={row.days}>{row.days}: {row.hours}</dd>
                  ))}
                </dl>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:py-3">
          <p>© {year} {brand}. Todos los derechos reservados.</p>
          <div className="flex flex-wrap items-center gap-x-4">
            <p>Diseñado por Ing. Gerald Aburto</p>
            <Link to="/login" className="inline-flex min-h-11 items-center hover:text-foreground focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8">
              Acceso del personal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
