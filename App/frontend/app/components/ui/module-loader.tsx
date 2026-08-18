import { HugeIcon } from "~/components/ui/icon";
import { Store01Icon } from "@hugeicons/core-free-icons";
import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { useAppSelector } from '~/store/hooks';
import { useGetConfigQuery } from '~/store/api/configApi';
import { getBrandName } from '~/lib/brand';

/**
 * ¿Hay alguna query de RTK en vuelo? Se lee del estado del baseApi
 * (reducerPath 'api'). Es lo que permite que el overlay de transición se quede
 * hasta que el backend responda, en vez de adivinar con un timer fijo.
 */
export function useAnyQueryPending(): boolean {
  return useAppSelector((s) => {
    const queries = s.api?.queries ?? {};
    return Object.values(queries).some((q) => q?.status === 'pending');
  });
}

/**
 * Overlay de carga entre módulos del admin. Cubre el contenido con un blur y
 * un loader de marca (el mark de Gyro dentro de un anillo cyan girando) mientras
 * el módulo nuevo trae su información. Lo controla `admin.tsx`.
 */
export function BrandLoader({ text = 'Cargando…' }: { text?: string }) {
  const reduce = useReducedMotion();
  const { data: config } = useGetConfigQuery();
  
  // Cache the logo in localStorage so it appears instantly on first render / page refresh
  // before the RTK query completes.
  const [cachedLogo, setCachedLogo] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gyro_logoAnimated');
    }
    return null;
  });

  useEffect(() => {
    if (config?.images?.logoAnimated) {
      localStorage.setItem('gyro_logoAnimated', config.images.logoAnimated);
      setCachedLogo(config.images.logoAnimated);
    } else if (config && !config.images?.logoAnimated) {
      // If config loaded and there is explicitly NO logo, clear the cache
      localStorage.removeItem('gyro_logoAnimated');
      setCachedLogo(null);
    }
  }, [config]);

  const logoAnimated = config?.images?.logoAnimated || cachedLogo;
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

// Acá vivía `ModuleLoader`, el overlay que tapaba el contenido en cada cambio de
// ruta del admin. Se retiró de `admin.tsx` (tenía un mínimo anti-parpadeo de
// 450 ms que se pagaba siempre, y con el backend en 80 ms cada navegación
// costaba medio segundo de pantalla tapada) y quedó exportado sin consumidores.
// Lo reemplazan la barra `GlobalProgress` —que aparece recién a los 150 ms— y
// los esqueletos por bloque. Ver Docs/08 §9.
