// Arranque del backend: middleware, montaje de la API bajo /api y, en
// producción, el build del frontend. Cada grupo de rutas vive en modules/<tema>/.
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './core/config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import authRouter from './modules/users/auth-routes';
import configRouter from './modules/settings/config-routes';
import adminConfigRouter from './modules/settings/admin-config-routes';
import landingRouter from './modules/store-editor/landing-routes';
import storeEditorRouter from './modules/store-editor/store-editor-routes';
import catalogRouter from './modules/catalog/catalog-routes';
import adminCatalogRouter from './modules/catalog/admin-catalog-routes';
import adminCombosRouter from './modules/combos/admin-combos-routes';
import adminUsersRouter from './modules/users/admin-users-routes';
import meRouter from './modules/users/me-routes';
import staffRouter from './modules/users/staff-routes';
import inventoryRouter from './modules/inventory/inventory-routes';
import salesRouter from './modules/sales/sales-routes';
import invoicesRouter from './modules/invoices/invoices-routes';
import discountCodesRouter from './modules/discount-codes/discount-codes-routes';
import installmentsRouter from './modules/installments/installments-routes';
import uploadRouter from './modules/files/upload-routes';
import combosRouter from './modules/combos/combos-routes';
import ordersRouter from './modules/orders/orders-routes';
import reportsRouter from './modules/finance/reports-routes';
import contactRouter from './modules/crm/contact-routes';
import stockNoticesRouter from './modules/crm/stock-notices-routes';
import crmRouter from './modules/crm/crm-routes';
import analyticsRouter from './modules/analytics/analytics-routes';
import { apiLimiter, publicOrderLimiter, contactLimiter, stockNoticeLimiter, telemetryLimiter } from './middleware/rate-limiter';
import { sanitizeBody } from './utils/sanitize';
import { logger } from './utils/logger';
import { startUserCleanupCron } from './modules/users/cleanup-users';
import { logSpoStatusOnce } from './modules/sharepoint/graph-token';
import { startSpoWorker } from './modules/sharepoint/spo-worker';
import { serveFrontend } from './core/serve-frontend';

const app: Express = express();

// Render corre detrás de un proxy: necesario para IPs correctas y rate-limit.
app.set('trust proxy', 1);

// Nonce por petición: habilita solo los <script> inline de Remix sin abrir 'unsafe-inline'.
// Va antes de helmet porque script-src lo lee de res.locals.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
});

// Orígenes de Supabase permitidos para fetch/websocket desde el navegador:
// el login y la sesión hablan directo con supabase-js (auth + realtime + rest).
const supabaseOrigin = new URL(config.supabaseUrl).origin; // https://xxxx.supabase.co
const supabaseWss = supabaseOrigin.replace(/^https:/, 'wss:');

// Sin el origen de R2 en la CSP, producción bloquea todas las imágenes subidas.
// `mediaSrc` aparte porque el logo animado es un <video>.
const r2Origin = (() => {
  const raw = (process.env.R2_PUBLIC_URL || '').trim();
  if (!raw) return [];
  try {
    return [new URL(raw).origin];
  } catch {
    logger.warn('[csp] R2_PUBLIC_URL no es una URL válida; las imágenes de R2 quedarán bloqueadas');
    return [];
  }
})();

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // 'self' para los bundles con hash; nonce para los inline de Remix.
        scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
        // Radix y demás primitivas inyectan style="" inline; no se pueden firmar
        // con nonce, así que se permite inline SOLO para estilos (no scripts).
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", supabaseOrigin, supabaseWss],
        imgSrc: ["'self'", 'data:', 'blob:', supabaseOrigin, ...r2Origin],
        mediaSrc: ["'self'", 'data:', 'blob:', ...r2Origin],
        // La factura se ve dentro del panel desde un blob: (la ruta pide sesión);
        // el visor de PDF del navegador cuenta como objeto, por eso también object-src.
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ['blob:'],
      },
    },
  }),
);
app.use(
  cors({
    origin: config.isProd ? config.corsOrigin || false : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Defensa en profundidad: recorta strings del body antes de que lo vean las rutas.
app.use(sanitizeBody);

app.use('/api', apiLimiter);

// ── Rutas ──

// Health check (Render). Público.
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/landing-config', landingRouter);
app.use('/api/admin/store-editor', storeEditorRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/admin/catalog', adminCatalogRouter);
app.use('/api/admin/combos', adminCombosRouter);
app.use('/api/admin/users', adminUsersRouter);
// Perfil propio y directorio sin datos bancarios: ver me-routes.ts y staff-routes.ts.
app.use('/api/me', meRouter);
app.use('/api/staff', staffRouter);
app.use('/api/admin/config', adminConfigRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/sales', salesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/discount-codes', discountCodesRouter);
app.use('/api/installments', installmentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/combos', combosRouter);

// Límite propio para el único POST anónimo que escribe pedidos; la petición sigue a ordersRouter.
app.post('/api/orders/public', publicOrderLimiter);
app.use('/api/orders', ordersRouter);

// Mismo patrón: el límite propio intercepta el POST antes del router.
app.post('/api/contact', contactLimiter);
app.use('/api/contact', contactRouter);
app.post('/api/stock-notices', stockNoticeLimiter);
app.use('/api/stock-notices', stockNoticesRouter);
app.use('/api/crm', crmRouter);
app.use('/api/reports', reportsRouter);

// Límite estricto solo para la ingesta pública; las lecturas del panel usan el general.
app.post('/api/analytics', telemetryLimiter);
app.use('/api/analytics', analyticsRouter);

// ── Cierre de la cadena ──
app.use('/api', notFoundHandler);

// En producción, Express sirve además el frontend (Remix) en el mismo origen.
// En dev el frontend corre aparte (:5173) y proxya /api, así que no montamos nada.
if (config.isProd) {
  await serveFrontend(app);
}

app.use(errorHandler);

// Sin esto, un error fuera de Express (cron, worker de SPO) tumbaría el proceso sin dejar rastro.
process.on('unhandledRejection', (reason) => {
  logger.error('[process] unhandledRejection', {
    reason: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
});

process.on('uncaughtException', (err) => {
  // Tras una excepción no atrapada el estado del proceso es incierto: se loguea y
  // se sale con código de error para que la plataforma (Render) reinicie limpio.
  logger.error('[process] uncaughtException — saliendo', { error: err.stack ?? err.message });
  process.exit(1);
});

app.listen(Number(config.port), '0.0.0.0', () => {
  logger.info(`${config.brandName} API arriba en puerto ${config.port}`, { env: config.env });
  
  // Iniciar tareas en segundo plano
  startUserCleanupCron();

  // Arranca siempre: sin credenciales cada ciclo no hace nada y las ventas esperan en `spo_outbox`.
  logSpoStatusOnce();
  startSpoWorker();
});
