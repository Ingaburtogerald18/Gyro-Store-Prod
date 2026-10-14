// Configuración central del backend: variables de entorno y constantes de
// negocio que se exponen al frontend vía GET /api/config.
import './load-env'; // Carga las variables de entorno (fuente única). Debe ir primero.

const isProd = process.env.NODE_ENV === 'production';

// SharePoint: credenciales app-only. `enabled` es todo-o-nada; sin él la app arranca igual
// y las ventas aprobadas esperan en `spo_outbox` (Docs/04-Comprobantes-SharePoint.md).
const spoTenantId = (process.env.AZURE_TENANT_ID || '').trim();
const spoClientId = (process.env.AZURE_CLIENT_ID || '').trim();
const spoClientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();
const spoSiteId = (process.env.SPO_SITE_ID || '').trim();
const spoDriveId = (process.env.SPO_DRIVE_ID || '').trim();

// Roles válidos del sistema. global_admin tiene acceso total a todos los portales.
// El orden define la prioridad para elegir el "rol primario" de un usuario multi-rol.
export const VALID_ROLES = [
  'global_admin',
  'admin',
  'seller',
  'cashier',
  'logistics_admin',
  'logistics_customer',
] as const;

export type AppRole = (typeof VALID_ROLES)[number];

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 3000,

  // URL pública de la app (links de correos). En prod nunca debe caer a localhost.
  appUrl:
    process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL ||
    (isProd ? 'https://gyro-store.onrender.com' : `http://localhost:${Number(process.env.PORT) || 3000}`),

  // ── Supabase ──
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',

  // Roles y prioridad (multi-rol → rol primario por prioridad).
  validRoles: VALID_ROLES,
  rolePriority: VALID_ROLES,

  // El correo admin protegido que arranca el sistema.
  protectedEmail: (process.env.PROTECTED_ADMIN_EMAIL || '').trim().toLowerCase(),

  // Dominio interno del tenant: los correos @gyrostorenic.com son staff local.
  internalDomain: (process.env.INTERNAL_DOMAIN || 'gyrostorenic.com').toLowerCase(),

  // ── Marca / datos de negocio (se exponen vía GET /api/config) ──
  brandName: 'Gyro Store',
  contactEmail: 'info@gyrostorenic.com',
  whatsapp: '+505 85944758',
  currency: 'C$',
  exchangeRate: 37,

  // Las categorías del storefront ya NO viven acá: son editables desde el panel
  // y viven en `app_config` (ver modules/settings/app-config.ts → getStoreCategories).

  // CORS_ORIGIN (el dominio propio) manda; la URL que pone Render es el respaldo.
  corsOrigin: process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || '',

  spo: {
    enabled: Boolean(spoTenantId && spoClientId && spoClientSecret && spoSiteId && spoDriveId),
    tenantId: spoTenantId,
    clientId: spoClientId,
    clientSecret: spoClientSecret,
    siteId: spoSiteId,
    driveId: spoDriveId,
  },
} as const;

// Fail-fast: sin estas variables supabase-js falla más tarde con un error que no dice qué hacer.
const missingVars = [
  !config.supabaseUrl && 'SUPABASE_URL',
  !config.supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);

if (missingVars.length) {
  throw new Error(
    `Faltan variables de entorno: ${missingVars.join(', ')}. ` +
      'Revisá tu archivo de secretos (el que apunta GYRO_ENV_FILE, p. ej. en OneDrive) ' +
      'o copiá App/.env.example como base.',
  );
}

// En producción debe existir un correo protegido para poder administrar el sistema
if (isProd && !config.protectedEmail) {
  throw new Error(
    'Falta PROTECTED_ADMIN_EMAIL en producción: sin este correo nadie puede entrar al panel como administrador global.',
  );
}

// Las tablas financieras se editan en el panel y viven en `app_config` (Docs/03-Finanzas.md).
