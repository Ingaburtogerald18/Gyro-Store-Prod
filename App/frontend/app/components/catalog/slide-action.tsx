// Botón de un banner (presentación o novedad): enlace real al destino, o el menú de redes si la acción
// es «social». Enlaces y no navegación por script: así los sigue también un buscador.
import { Link } from '@remix-run/react';
import { ArrowDown01Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons';

import type { HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { useStoreConfig } from '~/hooks/use-store-config';
import { CATALOG_PATH } from '~/lib/catalog-query';
import { cn } from '~/lib/utils';

// Los banners guardados antes de /catalogo apuntan a `/#catalogo`: llevan al catálogo nuevo.
function slideTarget(slide: HeroSlide): string {
  return !slide.actionTarget || slide.actionTarget === '/#catalogo' ? CATALOG_PATH : slide.actionTarget;
}

export function SlideAction({
  slide,
  variant,
  className,
}: {
  slide: HeroSlide;
  variant: 'default' | 'outline';
  className?: string;
}) {
  const config = useStoreConfig();
  const social = config?.socialLinks;
  const socialItems = [
    { key: 'facebook', label: 'Facebook', href: social?.facebook?.trim(), Icon: FacebookIcon },
    { key: 'instagram', label: 'Instagram', href: social?.instagram?.trim(), Icon: InstagramIcon },
    { key: 'tiktok', label: 'TikTok', href: social?.tiktok?.trim(), Icon: TikTokIcon },
  ].filter((s): s is typeof s & { href: string } => Boolean(s.href));
  const classes = cn('group/cta h-12 justify-center px-5 text-sm sm:text-base', className);

  if (slide.actionType === 'social' && socialItems.length > 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-landing-element="button" variant={variant} className={classes}>
            {slide.buttonText || 'Seguinos'}
            <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-48">
          {socialItems.map(({ key, label, href, Icon }) => (
            <DropdownMenuItem key={key} asChild className="min-h-11 gap-3 text-sm font-medium">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon className="size-5 shrink-0" />
                {label}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const target = slideTarget(slide);
  const content = (
    <>
      {slide.buttonText || 'Ver catálogo'}
      <HugeIcon icon={ArrowRight02Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 transition-transform duration-200 group-hover/cta:translate-x-0.5 motion-reduce:transition-none" />
    </>
  );
  return (
    <Button data-landing-element="button" variant={variant} asChild className={classes}>
      {/^https?:\/\//.test(target) ? (
        <a href={target} target="_blank" rel="noopener noreferrer">{content}</a>
      ) : (
        <Link to={target} prefetch="intent">{content}</Link>
      )}
    </Button>
  );
}
