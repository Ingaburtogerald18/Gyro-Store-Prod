// Footer del catálogo público. Sobrio y siguiendo el tema, como el resto:
//   - Claro: fondo blanco (bg-card) con una línea tinta arriba, el mismo trazo
//     de los botones. Oscuro: el gris de las tarjetas con un borde fino.
//   - Sin tarjetas ni botones de colores: todo son links de texto con el mismo
//     peso; "Cómo llegar" es un link más (abre la ubicación del panel).
//   - Redes como los botones redondos del header (carrito, ajustes).
//   - Un solo detalle de marca: la bolsa de la mascota asomada sobre el borde.
import { Link } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { Location01Icon, Mail01Icon } from '@hugeicons/core-free-icons';

import gyroBag from '~/assets/brand/gyro-bag.png';
import { categoryHref, inCategory } from '~/components/store/category-nav';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { useStoreCatalog, useStoreConfig } from '~/hooks/useStoreConfig';
import { getBrandName } from '~/lib/brand';
import { buildWhatsappUrl } from '~/lib/formatters';

const HEADING = 'mb-3 text-sm font-bold text-foreground';
const LINK =
  'inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground';

export function PublicFooter() {
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const year = new Date().getFullYear();
  const brand = config?.brandName || getBrandName();
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
    { key: 'instagram', label: 'Instagram', href: social?.instagram?.trim(), Icon: InstagramIcon },
    { key: 'facebook', label: 'Facebook', href: social?.facebook?.trim(), Icon: FacebookIcon },
    { key: 'tiktok', label: 'TikTok', href: social?.tiktok?.trim(), Icon: TikTokIcon },
  ].filter((s) => Boolean(s.href));

  // Solo categorías con productos (si el catálogo todavía no cargó, todas).
  const categories = (config?.categories ?? []).filter(
    (c) => products.length === 0 || products.some((p) => inCategory(p, c)),
  );

  return (
    <footer
      id="public-footer"
      className="relative mt-16 border-t-2 border-t-foreground bg-card text-foreground dark:border-t dark:border-t-border"
    >
      {/* La mascota "sentada" sobre la línea de arriba. */}
      <img
        src={gyroBag}
        alt=""
        aria-hidden
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute -top-[46px] left-[max(1rem,calc((100%-80rem)/2+1rem))] size-14"
      />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-8">
        {/* Marca */}
        <div>
          <p className="font-heading text-xl font-extrabold tracking-tight">{brand}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Audio, gaming y accesorios seleccionados en Managua.
          </p>
          {socialItems.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              {socialItems.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label} de ${brand}`}
                  className="grid size-10 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tienda y Ayuda: lado a lado en el celular, dos columnas en escritorio. */}
        <div className="grid grid-cols-2 gap-8 md:contents">
          <nav aria-label="Categorías de la tienda">
            <p className={HEADING}>Tienda</p>
            <ul className="space-y-2.5">
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
            <ul className="space-y-2.5">
              <li><Link to="/contacto" className={LINK}>Contacto</Link></li>
              {whatsappUrl && (
                <li>
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    WhatsApp
                  </a>
                </li>
              )}
              <li><Link to="/login" className={LINK}>Acceso del personal</Link></li>
            </ul>
          </nav>
        </div>

        {/* Visitanos */}
        <div>
          <p className={HEADING}>Visitanos</p>
          <ul className="space-y-2.5">
            {mapsUrl && (
              <li>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                  <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden />
                  Cómo llegar
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className={LINK}>
                  <HugeIcon icon={Mail01Icon} size={16} strokeWidth={2} aria-hidden />
                  {email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────────────── */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row">
          <p>© {year} {brand}. Todos los derechos reservados.</p>
          <p>
            Diseñado por <span className="font-medium text-foreground">Ing. Gerald Aburto</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
