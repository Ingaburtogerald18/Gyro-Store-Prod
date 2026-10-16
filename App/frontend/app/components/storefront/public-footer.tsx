// Footer (DESIGN.md §10). En escritorio, cuatro grupos: Gyro Store, Comprar, Ayuda y Contacto. En el
// celular, resumido: logo y redes, cuatro destinos, WhatsApp y correo, y la ubicación en Contacto.
// Los datos salen de Configuración; lo extenso vive en Ayuda y en Contacto.
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight01Icon, Clock01Icon, Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import gyroBag from '~/assets/brand/gyro-bag.png';
import { categoriesWithProducts, categoryHref } from '~/lib/catalog-query';
import { CONTACT_LOCATION, STORE_PAGES, hasLocationInfo, storeMapsUrl } from '~/lib/store-pages';
import { INFO_LINK } from '~/components/storefront/store-details';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useCategoryCounts, useStoreConfig } from '~/hooks/use-store-config';
import { getBrandName } from '~/lib/brand';
import { buildWhatsappUrl } from '~/lib/formatters';
import { trackWhatsappOpen } from '~/lib/analytics.client';
import { cn } from '~/lib/utils';

const HEADING = 'mb-3 text-sm font-bold text-foreground';
const LINK =
  'inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8';
// WhatsApp y correo: botones en el celular, enlaces con el dato completo desde tableta.
const CONTACT =
  'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-card px-3 text-sm font-medium text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex md:h-auto md:min-h-8 md:w-auto md:max-w-full md:justify-start md:border-0 md:bg-transparent md:px-0 md:font-normal md:text-muted-foreground md:hover:text-foreground';

// En el celular, los destinos de la tienda en una sola línea; las categorías ya están en el menú.
const MOBILE_LINKS = [
  { label: 'Catálogo', to: categoryHref(null) },
  { label: 'Por mayor', to: STORE_PAGES.wholesale },
  { label: 'Ayuda', to: STORE_PAGES.help },
  { label: 'Mis pedidos', to: STORE_PAGES.orders },
];

export function PublicFooter() {
  const config = useStoreConfig();
  const counts = useCategoryCounts();
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

  // Solo categorías con productos (sin conteos, todas).
  const categories = categoriesWithProducts(config?.categories ?? [], counts);

  return (
    <footer
      id="public-footer"
      // En el celular la línea de arriba es la de los separadores: el pie no compite con el contenido.
      className="relative mt-10 border-t border-t-border bg-card text-foreground md:mt-12 md:border-t-2 md:border-t-foreground md:dark:border-t md:dark:border-t-border"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-y-3 px-4 pt-5 pb-4 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-8 md:pt-10 md:pb-8">
        {/* Gyro Store. En el celular, logo y redes en una fila; desde tableta, también qué vende y dónde. */}
        <div className="flex items-center justify-between gap-3 md:flex-col md:items-start md:justify-start">
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
          <p className="hidden max-w-xs text-sm leading-relaxed text-muted-foreground md:block">
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

        <nav aria-label="Tienda" className="md:hidden">
          <ul className="flex flex-wrap gap-x-5">
            {MOBILE_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={cn(LINK, 'font-medium text-foreground')}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Comprar" className="hidden md:block">
          <p className={HEADING}>Comprar</p>
          <ul className="space-y-1">
            <li><Link to={categoryHref(null)} className={LINK}>Todo el catálogo</Link></li>
            {categories.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link to={categoryHref(c.slug)} className={LINK}>{c.name}</Link>
              </li>
            ))}
            <li><Link to={STORE_PAGES.wholesale} className={LINK}>Por mayor</Link></li>
          </ul>
        </nav>

        <nav aria-label="Ayuda" className="hidden md:block">
          <p className={HEADING}>Ayuda</p>
          <ul className="space-y-1">
            <li><Link to={STORE_PAGES.howToBuy} className={LINK}>Cómo comprar</Link></li>
            <li><Link to={STORE_PAGES.paymentsDelivery} className={LINK}>Pagos y entregas</Link></li>
            {config?.policies?.warrantyPage && (
              <li><Link to={STORE_PAGES.warranty} className={LINK}>Garantía y cambios</Link></li>
            )}
            <li><Link to={STORE_PAGES.orders} className={LINK}>Mis pedidos</Link></li>
            <li><Link to={STORE_PAGES.contact} className={LINK}>Contacto</Link></li>
          </ul>
        </nav>

        <div className="space-y-1 md:space-y-0">
          <p className={cn(HEADING, 'hidden md:block')}>Contacto</p>
          {(whatsappUrl || email) && (
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
            </ul>
          )}

          {/* Celular: la dirección y el horario completos se consultan en Contacto. */}
          {hasLocationInfo(config) && (
            <Link to={CONTACT_LOCATION} className={cn(LINK, 'font-medium text-foreground md:hidden')}>
              <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-primary-2" />
              Ubicación y horarios
              <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
            </Link>
          )}

          {/* Escritorio: punto de retiro (no un local abierto al público) y horario, como siempre. */}
          {address && (
            <p className="hidden gap-2 py-1 text-sm text-muted-foreground md:flex">
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
            </p>
          )}
          {hours.length > 0 && (
            <div className="hidden gap-2 py-1 text-sm text-muted-foreground md:flex">
              <HugeIcon icon={Clock01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              <dl className="min-w-0">
                <dt className="font-medium text-foreground">Horario de atención</dt>
                {hours.map((row) => (
                  <dd key={row.days}>{row.days}: {row.hours}</dd>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-0.5 px-4 py-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {year} {brand}. Todos los derechos reservados.</p>
          <p>Diseñado por Ing. Gerald Aburto</p>
        </div>
      </div>
    </footer>
  );
}
