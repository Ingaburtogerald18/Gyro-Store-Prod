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

// En el celular cada grupo es una fila con su título a la izquierda y los enlaces uno al lado del otro
// (siguen midiendo 44 px de alto); desde tableta, columnas como siempre.
const GROUP = 'flex items-start gap-3 md:block';
const HEADING =
  'flex min-h-11 w-20 shrink-0 items-center text-sm font-bold text-foreground md:mb-3 md:min-h-0 md:w-auto';
const LINKS = 'flex min-w-0 flex-wrap gap-x-5 md:block md:space-y-1';
const LINK =
  'inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8';
// WhatsApp y correo: botones en el celular, enlaces con el dato completo desde tableta.
const CONTACT =
  'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-card px-3 text-sm font-medium text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex md:h-auto md:min-h-8 md:w-auto md:max-w-full md:justify-start md:border-0 md:bg-transparent md:px-0 md:font-normal md:text-muted-foreground md:hover:text-foreground';

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
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-y-4 px-4 pt-6 pb-5 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-8 md:pt-10 md:pb-8">
        {/* Gyro Store: qué vende y dónde, con datos confirmados. En el celular, logo y redes en una fila. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 md:flex md:flex-col md:items-start">
          <Link to="/" className="inline-flex items-center gap-2 justify-self-start rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ir al inicio de ${brand}`}>
            {logo ? (
              <img src={logo} alt="" height={40} loading="lazy" decoding="async" className="h-10 w-auto max-w-[160px] object-contain object-left" />
            ) : (
              <>
                <img src={gyroBag} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10" />
                <span className="font-heading text-xl font-extrabold tracking-tight">{brand}</span>
              </>
            )}
          </Link>
          <p className="col-span-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Tienda en línea de accesorios tecnológicos en Managua, Nicaragua.
            <span className="hidden md:inline"> Importación directa, asesoría y garantía por fallas de fábrica.</span>
          </p>
          {socialItems.length > 0 && (
            <ul className="col-start-2 row-start-1 flex items-center gap-2" aria-label="Redes sociales">
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

        <nav aria-label="Comprar" className={GROUP}>
          <p className={HEADING}>Comprar</p>
          <ul className={LINKS}>
            <li><Link to={categoryHref(null)} className={LINK}>Todo el catálogo</Link></li>
            {/* En el celular las categorías ya están en el menú: el footer no las repite. */}
            {categories.slice(0, 5).map((c) => (
              <li key={c.id} className="hidden md:block">
                <Link to={categoryHref(c.slug)} className={LINK}>{c.name}</Link>
              </li>
            ))}
            <li><Link to={STORE_PAGES.wholesale} className={LINK}>Por mayor</Link></li>
          </ul>
        </nav>

        <nav aria-label="Ayuda" className={GROUP}>
          <p className={HEADING}>Ayuda</p>
          <ul className={LINKS}>
            <li><Link to={STORE_PAGES.howToBuy} className={LINK}>Cómo comprar</Link></li>
            <li><Link to={STORE_PAGES.paymentsDelivery} className={LINK}>Pagos y entregas</Link></li>
            {config?.policies?.warrantyPage && (
              <li><Link to={STORE_PAGES.warranty} className={LINK}>Garantía y cambios</Link></li>
            )}
            <li><Link to={STORE_PAGES.orders} className={LINK}>Mis pedidos</Link></li>
            <li><Link to={STORE_PAGES.contact} className={LINK}>Contacto</Link></li>
          </ul>
        </nav>

        <div>
          <p className="mb-3 hidden text-sm font-bold text-foreground md:block">Contacto</p>
          <ul aria-label="Contacto de la tienda" className="flex flex-wrap gap-x-3 gap-y-2 md:block md:space-y-1">
            {whatsappUrl && (
              <li className="min-w-0 flex-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${CONTACT} border-2 border-whatsapp`}
                  onClick={() => trackWhatsappOpen('consult')}
                >
                  <WhatsappIcon aria-hidden className="size-4 shrink-0 text-whatsapp md:text-current" />
                  <span>WhatsApp<span className="hidden md:inline"> {config?.whatsapp}</span></span>
                </a>
              </li>
            )}
            {email && (
              <li className="min-w-0 flex-1">
                <a href={`mailto:${email}`} className={`${CONTACT} border border-input hover:border-primary-2`}>
                  <HugeIcon icon={Mail01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                  <span className="md:hidden">Correo</span>
                  <span className="hidden min-w-0 [overflow-wrap:anywhere] md:inline">{email}</span>
                </a>
              </li>
            )}
            {address && (
              // Punto de retiro, no un local abierto al público.
              <li className="flex basis-full gap-2 pt-1 text-sm text-muted-foreground md:py-1">
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
              <li className="flex basis-full gap-2 text-sm text-muted-foreground md:py-1">
                <HugeIcon icon={Clock01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
                <dl className="min-w-0">
                  <dt className="sr-only font-medium text-foreground md:not-sr-only">Horario de atención</dt>
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
        <div className="mx-auto flex max-w-7xl flex-col px-4 pt-3 pb-1 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:py-3">
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
