// Configuración de la portada (banners y categorías del header) en `app_config.landing_config`.
import { db } from '../../core/supabase';
import { landingConfigSchema, type LandingConfig } from '../../../shared/schemas';
import { logger } from '../../utils/logger';

const CONFIG_KEY = 'landing_config';

// Fallback cuando todavía no hay nada configurado: un solo slide de marca,
// bloqueado, que apunta al catálogo. Así la home nunca se ve rota ni vacía.
const DEFAULT_LANDING: LandingConfig = {
  headerCategories: [],
  heroSlides: [
    {
      id: 'slide-marca',
      eyebrow: 'GYRO STORE',
      title: 'Tecnología que suena por encima de su precio',
      description:
        'Audífonos, adaptadores y accesorios seleccionados. Pedí por WhatsApp y coordinamos la entrega en Managua.',
      mediaUrl: '',
      mediaType: 'image',
      buttonText: 'Ver catálogo',
      actionType: 'link',
      actionTarget: '/catalogo',
      locked: true,
    },
  ],
};

let cachedLandingConfig: LandingConfig | null = null;
let landingConfigCachedAt = 0;

export async function getLandingConfig(): Promise<LandingConfig> {
  if (cachedLandingConfig && Date.now() - landingConfigCachedAt < 60_000) {
    return cachedLandingConfig;
  }

  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_LANDING;

  // La fila es contenido editable: si quedó malformada por una edición vieja o
  // una migración, no se tumba la home — se cae al default y se deja rastro.
  const parsed = landingConfigSchema.safeParse(data.value);
  if (!parsed.success) {
    logger.error('landing_config inválido en app_config; se usa el default', {
      issues: parsed.error.issues,
    });
    return DEFAULT_LANDING;
  }

  cachedLandingConfig = parsed.data;
  landingConfigCachedAt = Date.now();
  return parsed.data;
}

// Siempre la configuración entera, sin merge: así el orden de los banners es explícito. Las fotos
// que dejan de usarse las limpia el modo edición, que sabe cuáles siguen en una versión.
export async function saveLandingConfig(config: LandingConfig): Promise<LandingConfig> {
  landingConfigCachedAt = 0;
  const { error } = await db
    .from('app_config')
    .upsert({ key: CONFIG_KEY, value: config }, { onConflict: 'key' });

  if (error) throw error;
  return config;
}
