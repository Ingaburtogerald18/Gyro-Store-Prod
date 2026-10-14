import { HugeIcon } from "~/components/ui/icon";
import { Store01Icon } from "@hugeicons/core-free-icons";
import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { useGetConfigQuery } from '~/state/api/config-api';
import { getBrandName } from '~/lib/brand';

/** Loader de marca entre módulos del panel; lo controla admin.tsx. */
export function BrandLoader({ text = 'Cargando…' }: { text?: string }) {
  const reduce = useReducedMotion();
  const { data: config } = useGetConfigQuery();
  
  // El primer render debe coincidir con SSR; leer el caché solo tras hidratar.
  const [cachedLogo, setCachedLogo] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      const logo = config.images?.logoAnimated || null;
      setCachedLogo(logo);
      try {
        if (logo) localStorage.setItem('gyro_logoAnimated', logo);
        else localStorage.removeItem('gyro_logoAnimated');
      } catch {
        // La configuración sigue funcionando aunque el storage esté bloqueado.
      }
    } else {
      try {
        setCachedLogo(localStorage.getItem('gyro_logoAnimated'));
      } catch {
        // Sin caché disponible, se mantiene el icono de carga predeterminado.
      }
    }
  }, [config]);

  const logoAnimated = config ? config.images?.logoAnimated : cachedLogo;
  // Si la URL no tiene extensión clara, asumimos que puede ser video si contiene "video", o usamos un chequeo más laxo
  const isVideo = logoAnimated?.match(/\.(webm|mp4|mov|m4v)($|\?)/i) || logoAnimated?.includes('video');

  return (
    <motion.div
      initial={{ scale: reduce ? 1 : 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: reduce ? 1 : 0.96, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="flex flex-col items-center gap-3"
    >
      <h2 className="text-base font-bold tracking-tight text-foreground">{config?.brandName || getBrandName()}</h2>
      <div className="relative grid size-24 place-items-center">
        {/* Anillo: pista tenue + arco cyan que gira. */}
        <motion.svg
          viewBox="0 0 50 50"
          className="absolute inset-0 size-24"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
        >
          <circle
            cx="25"
            cy="25"
            r="22"
            fill="none"
            strokeWidth="2.5"
            className="stroke-muted-foreground/20"
          />
          <circle
            cx="25"
            cy="25"
            r="22"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="80 200"
            className="stroke-primary"
          />
        </motion.svg>
        
        {/* Centro del anillo */}
        <div className="absolute inset-0 flex items-center justify-center p-5">
          {logoAnimated ? (
            isVideo ? (
              <video 
                src={logoAnimated} 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="size-full object-contain rounded-full"
              />
            ) : (
              <img 
                src={logoAnimated} 
                alt="Cargando..." 
                className="size-full object-contain rounded-full"
              />
            )
          ) : (
            <motion.span
              animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
              className="text-primary"
            >
              {/* Pantalla de carga: no hay nada que hoverear, y el trazo
                  dibujándose es justo el feedback que se busca. */}
              <HugeIcon icon={Store01Icon} size={32} strokeWidth={2} aria-hidden />
            </motion.span>
          )}
        </div>
      </div>
      {text && <p className="text-sm font-medium text-muted-foreground">{text}</p>}
    </motion.div>
  );
}
