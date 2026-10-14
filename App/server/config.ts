// Configuración central del backend. Lee variables de entorno desde .env.
// Fuente única de constantes de negocio expuestas al frontend vía GET /api/config.
// Portado de la v1 (server/config.js), adaptado a Supabase (sin Firebase).
import './loadEnv.js'; // Carga las variables de entorno (fuente única). Debe ir primero.

const isProd = process.env.NODE_ENV === 'production';

// ── SharePoint Online (archivo de comprobantes de ventas aprobadas) ──
// App-only (client credentials), NO el login delegado del staff: quien sube el
// comprobante es la aplicación, no la persona que aprobó la venta. El secreto
// vive solo en el backend.
//
// `enabled` es TODO-O-NADA a propósito: con la mitad de los ids, cada intento
// fallaría en Graph y llenaría el outbox de errores en vez de esperar callado.
// Su ausencia NO entra en la validación fail-fast de más abajo: "SPO todavía no
// configurado" es un estado VÁLIDO del sistema (ver la sección `spo_outbox` de
// database/01_schema.sql) — la app arranca igual, encola, y sincroniza el backlog
// cuando se carguen las credenciales.
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
  // y viven en `app_config` (ver services/appConfig.ts → getStoreCategories).

  // CORS: orígenes permitidos en producción.
  // CORS_ORIGIN manda sobre RENDER_EXTERNAL_URL: el dominio propio (o el del front,
  // si algún día se separa del backend) es el que hay que permitir; la URL que
  // inyecta Render es solo el fallback cuando no hay dominio configurado.
  corsOrigin: process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || '',

  // ── SharePoint Online ──
  // Ver el bloque de arriba. `enabled: false` = la app funciona igual, las ventas
  // aprobadas se encolan en `spo_outbox` y nadie llama a Graph.
  spo: {
    enabled: Boolean(spoTenantId && spoClientId && spoClientSecret && spoSiteId && spoDriveId),
    tenantId: spoTenantId,
    clientId: spoClientId,
    clientSecret: spoClientSecret,
    siteId: spoSiteId,
    driveId: spoDriveId,
  },
} as const;

// ── Validación de arranque (fail-fast) ──
// Preferimos morir acá, con un mensaje propio y accionable, antes de arrancar a
// medias. Sin esto, la falta de SUPABASE_URL explota más adelante como un
// "supabaseUrl is required" de supabase-js que no dice qué hacer.
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

// NOTA: las tablas financieras (pozos, tiers de Costo F/U, márgenes, comisión,
// mayoreo) NO viven acá: son editables desde el panel y viven en `app_config`
// (ver Docs/03-Finanzas.md). Este archivo solo tiene constantes de arranque e infraestructura.
