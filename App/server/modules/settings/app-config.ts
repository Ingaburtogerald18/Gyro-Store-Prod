import { db } from '../../core/supabase';
import { config } from '../../core/config';
import { logger } from '../../utils/logger';
import {
  financialConfigSchema,
  type FinancialConfig,
  imageResourcesSchema,
  type ImageResources,
  businessInfoSchema,
  type BusinessInfo,
  storePoliciesSchema,
  type StorePolicies,
} from '../../../shared/schemas';

const FINANCIAL_CONFIG_KEY = 'financial_config';
const IMAGE_RESOURCES_KEY = 'image_resources';
const BUSINESS_INFO_KEY = 'business_info';
const STORE_POLICIES_KEY = 'store_policies';

// Valor inicial de la info del negocio: se siembra desde las env vars mientras
// nadie la edite desde el panel. Una vez guardada, mandan los valores de la BD.
function defaultBusinessInfo(): BusinessInfo {
  return {
    brandName: config.brandName,
    ruc: '',
    whatsapp: config.whatsapp,
    contactEmail: config.contactEmail,
    address: '',
    locationUrl: '',
    currency: config.currency,
    socialLinks: { instagram: '', facebook: '', tiktok: '' },
    bankAccounts: [],
    // Horario confirmado por el dueño el 14 oct 2026; desde que se guarde en el panel manda la BD.
    businessHours: [
      { days: 'Lunes a viernes', hours: '8:00 a. m. a 5:00 p. m.' },
      { days: 'Sábados y domingos', hours: '9:00 a. m. a 4:00 p. m.' },
    ],
  };
}

// Valores por defecto extraídos del documento 11-Logica-Financiera.md
const DEFAULT_FINANCIAL_CONFIG: FinancialConfig = {
  exchangeRate: 37,
  salaryPercentage: 0.20,
  minMarginMultiplier: 1.15,
  costoFUScale: [
    { maxCost: 100, amount: 15 },
    { maxCost: 200, amount: 25 },
    { maxCost: 300, amount: 35 },
    { maxCost: 500, amount: 55 },
    { maxCost: 800, amount: 75 },
    { maxCost: 1300, amount: 95 },
    { maxCost: 2000, amount: 120 },
    { maxCost: null, amount: 150 },
  ],
  pozos: {
    publicidad: 0.25,
    mantenimiento: 0.07,
    utiles: 0.05,
    garantias: 0.08,
    prestamos: 0.40,
    suscripciones: 0.05,
    servicios: 0.10,
  },
  marginScale: [
    // El tramo < 50 genera un error lógico, pero lo mapeamos con 0 margen como salvaguarda
    { maxCost: 50, margin: 0.00 },
    { maxCost: 300, margin: 0.43 },
    { maxCost: 500, margin: 0.41 },
    { maxCost: 900, margin: 0.37 },
    { maxCost: 1500, margin: 0.33 },
    { maxCost: 2500, margin: 0.30 },
    { maxCost: null, margin: 0.25 },
  ],
  commissionScale: [
    { maxProfit: 100, margin: 0.45 },
    { maxProfit: 200, margin: 0.40 },
    { maxProfit: 400, margin: 0.37 },
    { maxProfit: 500, margin: 0.35 },
    { maxProfit: 600, margin: 0.31 },
    { maxProfit: 900, margin: 0.27 },
    { maxProfit: null, margin: 0.27 }, // El último tramo se extiende como catch-all
  ],
  wholesaleDiscounts: [
    { minQty: 12, discount: 0.15 },
    { minQty: 6, discount: 0.10 },
    { minQty: 3, discount: 0.05 },
    { minQty: 2, discount: 0.025 },
  ]
};

let cachedFinancialConfig: FinancialConfig | null = null;
let financialConfigCachedAt = 0;

export async function getFinancialConfig(): Promise<FinancialConfig> {
  if (cachedFinancialConfig && Date.now() - financialConfigCachedAt < 60_000) {
    return cachedFinancialConfig;
  }

  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', FINANCIAL_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return DEFAULT_FINANCIAL_CONFIG;
  }

  const parsed = financialConfigSchema.safeParse(data.value);
  if (!parsed.success) {
    logger.error('Configuración financiera inválida en la BD', { issues: parsed.error.issues });
    return DEFAULT_FINANCIAL_CONFIG;
  }

  cachedFinancialConfig = parsed.data;
  financialConfigCachedAt = Date.now();
  return parsed.data;
}

export async function updateFinancialConfig(config: FinancialConfig): Promise<FinancialConfig> {
  financialConfigCachedAt = 0;
  const { error } = await db
    .from('app_config')
    .upsert({
      key: FINANCIAL_CONFIG_KEY,
      value: config as any,
    });

  if (error) {
    throw error;
  }

  return getFinancialConfig();
}

let cachedImageResources: ImageResources | null = null;
let imageResourcesCachedAt = 0;

export async function getImageResources(): Promise<ImageResources> {
  if (cachedImageResources && Date.now() - imageResourcesCachedAt < 60_000) {
    return cachedImageResources;
  }

  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', IMAGE_RESOURCES_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return {};

  const result = imageResourcesSchema.safeParse(data.value);
  if (!result.success) return {};

  cachedImageResources = result.data;
  imageResourcesCachedAt = Date.now();
  return result.data;
}

export async function updateImageResources(payload: unknown): Promise<ImageResources> {
  imageResourcesCachedAt = 0;
  const parsed = imageResourcesSchema.parse(payload);

  const { error } = await db
    .from('app_config')
    .upsert({
      key: IMAGE_RESOURCES_KEY,
      value: parsed as any,
    });

  if (error) throw error;
  return parsed;
}



let cachedBusinessInfo: BusinessInfo | null = null;
let businessInfoCachedAt = 0;

export async function getBusinessInfo(): Promise<BusinessInfo> {
  if (cachedBusinessInfo && Date.now() - businessInfoCachedAt < 60_000) {
    return cachedBusinessInfo;
  }

  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', BUSINESS_INFO_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return defaultBusinessInfo();

  // merge sobre el default: si en la BD falta un campo (versión vieja), se
  // completa desde env en vez de romper la validación.
  const parsed = businessInfoSchema.safeParse({ ...defaultBusinessInfo(), ...(data.value as object) });
  if (!parsed.success) {
    logger.error('Info del negocio inválida en la BD', { issues: parsed.error.issues });
    return defaultBusinessInfo();
  }

  cachedBusinessInfo = parsed.data;
  businessInfoCachedAt = Date.now();
  return parsed.data;
}

export async function updateBusinessInfo(payload: unknown): Promise<BusinessInfo> {
  businessInfoCachedAt = 0;
  const info = businessInfoSchema.parse(payload);

  const { error } = await db
    .from('app_config')
    .upsert({
      key: BUSINESS_INFO_KEY,
      value: info as any,
    });

  if (error) throw error;
  return info;
}

// Textos iniciales con lo que el dueño confirmó el 14 oct 2026. La página de garantía nace en borrador:
// sus condiciones completas esperan revisión antes de publicarse.
function defaultStorePolicies(): StorePolicies {
  return {
    payment: {
      title: 'Efectivo o transferencia',
      text: 'En Managua pagás al recibir. Fuera de Managua, el producto se paga antes del despacho.',
    },
    managua: {
      title: 'Delivery en Managua',
      text: 'Entrega el mismo día. El delivery tiene un costo adicional que se cotiza con el repartidor. Pagás al recibir, en efectivo o por transferencia.',
    },
    outside: {
      title: 'Envíos al resto del país',
      text: 'Por Cargo Trans, con un plazo informado de 24 a 48 horas. El producto se paga antes del despacho y el transporte se paga aparte, cuando te enviamos el comprobante de Cargo Trans.',
    },
    pickup: {
      title: 'Retiro',
      text: 'Coordiná por WhatsApp el día y la hora para retirar en el punto de retiro.',
    },
    warranty: {
      title: 'Garantía de 1 mes',
      text: 'Por fallas de fábrica, desde que recibís el producto.',
    },
    shippingNote: 'El costo del envío se cotiza por WhatsApp: no hay tarifa fija ni está incluido en el precio.',
    warrantyPage: {
      status: 'draft',
      text: [
        'Garantía: un mes por fallas de fábrica, contado desde que recibís el producto. Si se confirma la falla, te lo cambiamos por el mismo modelo nuevo en caja; si ese modelo se agotó, te ofrecemos alternativas.',
        'Cambios: el mismo día de la compra, con el artículo sin usar, podés cambiarlo por otro de mayor valor pagando la diferencia.',
        'Para una garantía o un cambio, escribinos por WhatsApp con tu número de pedido.',
      ].join('\n\n'),
      updatedAt: null,
    },
  };
}

let cachedStorePolicies: StorePolicies | null = null;
let storePoliciesCachedAt = 0;

export async function getStorePolicies(): Promise<StorePolicies> {
  if (cachedStorePolicies && Date.now() - storePoliciesCachedAt < 60_000) {
    return cachedStorePolicies;
  }

  const { data, error } = await db.from('app_config').select('value').eq('key', STORE_POLICIES_KEY).maybeSingle();
  if (error) throw error;
  if (!data) return defaultStorePolicies();

  const parsed = storePoliciesSchema.safeParse({ ...defaultStorePolicies(), ...(data.value as object) });
  if (!parsed.success) {
    logger.error('Políticas de la tienda inválidas en la BD', { issues: parsed.error.issues });
    return defaultStorePolicies();
  }

  cachedStorePolicies = parsed.data;
  storePoliciesCachedAt = Date.now();
  return parsed.data;
}

export async function updateStorePolicies(policies: StorePolicies): Promise<StorePolicies> {
  const current = await getStorePolicies();
  const page = policies.warrantyPage;
  // La fecha la pone el servidor y solo cuando cambia algo de la página: guardar los resúmenes no la mueve.
  const changed = page.text !== current.warrantyPage.text || page.status !== current.warrantyPage.status;
  const next: StorePolicies = {
    ...policies,
    warrantyPage: { ...page, updatedAt: changed ? new Date().toISOString() : current.warrantyPage.updatedAt },
  };

  storePoliciesCachedAt = 0;
  const { error } = await db.from('app_config').upsert({ key: STORE_POLICIES_KEY, value: next as any });
  if (error) throw error;
  return next;
}

