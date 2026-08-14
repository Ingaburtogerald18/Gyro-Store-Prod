import { db } from '../supabase';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  financialConfigSchema,
  type FinancialConfig,
  imageResourcesSchema,
  type ImageResources,
  businessInfoSchema,
  type BusinessInfo,
  expenseCategoriesSchema,
  type ExpenseCategories,
} from '../../shared/schemas';

const FINANCIAL_CONFIG_KEY = 'financial_config';
const IMAGE_RESOURCES_KEY = 'image_resources';
const BUSINESS_INFO_KEY = 'business_info';
const EXPENSE_CATEGORIES_KEY = 'expense_categories';

// Semilla de categorías de gasto: los rubros típicos de la operación diaria.
// Manda la BD una vez editadas desde el panel.
const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategories = [
  'Compra de mercadería',
  'Delivery / Envíos',
  'Luz',
  'Agua',
  'Internet / Teléfono',
  'Publicidad',
  'Sueldos',
  'Alquiler',
  'Empaque',
  'Otros',
];

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

let cachedExpenseCategories: ExpenseCategories | null = null;
let expenseCategoriesCachedAt = 0;

export async function getExpenseCategories(): Promise<ExpenseCategories> {
  if (cachedExpenseCategories && Date.now() - expenseCategoriesCachedAt < 60_000) {
    return cachedExpenseCategories;
  }

  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', EXPENSE_CATEGORIES_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_EXPENSE_CATEGORIES;

  const parsed = expenseCategoriesSchema.safeParse(data.value);
  if (!parsed.success) {
    logger.error('Categorías de gasto inválidas en la BD', { issues: parsed.error.issues });
    return DEFAULT_EXPENSE_CATEGORIES;
  }

  cachedExpenseCategories = parsed.data;
  expenseCategoriesCachedAt = Date.now();
  return parsed.data;
}

export async function updateExpenseCategories(payload: unknown): Promise<ExpenseCategories> {
  expenseCategoriesCachedAt = 0;
  // Normaliza: recorta, quita vacíos y deduplica sin distinguir mayúsculas, para
  // que "Luz" y "luz" no convivan como dos rubros distintos.
  const raw = expenseCategoriesSchema.parse(payload);
  const seen = new Set<string>();
  const categories: ExpenseCategories = [];
  for (const c of raw) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push(c);
  }

  const { error } = await db
    .from('app_config')
    .upsert({
      key: EXPENSE_CATEGORIES_KEY,
      value: categories as any,
    });

  if (error) throw error;
  return categories;
}
