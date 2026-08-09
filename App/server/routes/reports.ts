// Reportería (Hito 4) + reportería de ventas del Dashboard.
//
// ── Por qué este router ya no es "todo admin" ──
// Hasta acá `router.use(requireAdmin)` cerraba el módulo entero. Ahora el
// vendedor tiene su propio panel de desempeño en /admin/ventas, así que la
// puerta es `requireSeller` (= seller + admin + global_admin, ver auth.ts) y
// CADA ruta declara su propio recorte. El patrón es el mismo de routes/sales.ts:
//
//   · Reportes del negocio (pérdidas, gastos, export, ranking, delivery)
//     → `requireAdmin` explícito en la ruta.
//   · Reportes que existen "por vendedor" (kpis, tendencia, top, desgloses)
//     → abiertos, pero con `sellerUid` FORZADO al uid del token si quien
//       pregunta no es admin. Da igual lo que mande en el query: no puede
//       pedir los números de otro.
//
// La autorización real vive acá, no en el frontend: el panel solo esconde
// tarjetas.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin, requireSeller } from '../middleware/auth';
import {
  getFinancialKPIs,
  listLosses,
  exportSales,
  getExpensesByPozo,
  getSalesTrend,
  getSellerPerformance,
  getTopProducts,
  getSalesBreakdown,
  getDeliverySummary,
  getSalesLedger,
  getDeliveryInvoices,
} from '../services/reports';
import { parseCursor } from '../utils/pagination';
import { BadRequestError } from '../utils/httpError';

const router = Router();

// ============================================================================
// ── Schemas de validación (Query Params) ──
// ============================================================================

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sellerUid: z.string().uuid().optional(),
});

const trendQuerySchema = dateRangeSchema.extend({
  bucket: z.enum(['day', 'week', 'month']).optional(),
});

const topProductsQuerySchema = dateRangeSchema.extend({
  // `coerce` porque un query param siempre llega como string.
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// ============================================================================
// ── Rutas ──
// ============================================================================

router.use(requireSeller);

const isAdminLike = (roles: string[]) => roles.includes('admin') || roles.includes('global_admin');

/**
 * Devuelve el `sellerUid` que debe aplicarse a la consulta.
 * Al admin se le respeta lo que pida (incluido "todos", sin filtro); a
 * cualquier otro rol se le impone el suyo.
 */
function scopedSellerUid(req: { user?: { uid: string; roles: string[] } }, requested?: string) {
  return isAdminLike(req.user!.roles) ? requested : req.user!.uid;
}

const INVALID_RANGE = 'Parámetros inválidos. startDate y endDate deben ser ISO 8601.';

/**
 * GET /api/reports/kpis
 * KPIs financieros agregados (ventas, utilidad, pozos).
 */
router.get(
  '/kpis',
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate, sellerUid } = parsed.data;
    const kpis = await getFinancialKPIs(startDate, endDate, scopedSellerUid(req, sellerUid));

    if (!isAdminLike(req.user!.roles)) {
      // El vendedor ve SU volumen y SU comisión; no la estructura de costos de
      // la tienda. Mismo criterio que POST /api/sales/quote: con el coste y el
      // precio se despeja el margen, así que se recortan juntos.
      //
      // Los `_prev` de esos mismos campos se recortan también: con el valor del
      // mes pasado y el delta se reconstruye el actual, así que dejarlos sería
      // filtrar por la ventana de al lado lo que se cerró por la puerta.
      const {
        coste_total,
        ganancia_tienda_total,
        salary_acumulado,
        pozos_recogidos,
        coste_total_prev,
        ganancia_tienda_total_prev,
        ...rest
      } = kpis;
      res.json(rest);
      return;
    }

    res.json(kpis);
  })
);

/**
 * GET /api/reports/trend
 * Serie temporal de ventas (vendido / ganancia / comisión) por día, semana o mes.
 */
router.get(
  '/trend',
  asyncHandler(async (req, res) => {
    const parsed = trendQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate, sellerUid, bucket } = parsed.data;
    const admin = isAdminLike(req.user!.roles);
    const trend = await getSalesTrend(
      startDate,
      endDate,
      bucket ?? 'month',
      scopedSellerUid(req, sellerUid),
    );

    // `ganancia` es ganancia de la TIENDA, no del vendedor: se recorta igual
    // que en los KPIs, o el gráfico filtraría lo que las tarjetas esconden.
    res.json(admin ? trend : trend.map(({ ganancia, ...rest }) => rest));
  })
);

/**
 * GET /api/reports/sellers
 * Ranking de vendedores del periodo. Solo admin: compara a un empleado con sus
 * compañeros.
 */
router.get(
  '/sellers',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate } = parsed.data;
    res.json(await getSellerPerformance(startDate, endDate));
  })
);

/**
 * GET /api/reports/top-products
 * Productos más vendidos por ingreso.
 */
router.get(
  '/top-products',
  asyncHandler(async (req, res) => {
    const parsed = topProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate, sellerUid, limit } = parsed.data;
    res.json(
      await getTopProducts(startDate, endDate, scopedSellerUid(req, sellerUid), limit ?? 10),
    );
  })
);

/**
 * GET /api/reports/breakdown
 * Cortes del periodo: método de pago, origen, facturadas vs sin factura, con
 * código de descuento y a cuotas.
 */
router.get(
  '/breakdown',
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate, sellerUid } = parsed.data;
    res.json(await getSalesBreakdown(startDate, endDate, scopedSellerUid(req, sellerUid)));
  })
);

/**
 * GET /api/reports/delivery
 * Dinero movido en envíos y su reparto por repartidor. Solo admin.
 */
router.get(
  '/delivery',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate } = parsed.data;
    res.json(await getDeliverySummary(startDate, endDate));
  })
);

/**
 * GET /api/reports/sales-ledger
 * Las filas detrás de los KPIs: una por venta, con vendido, coste, comisión y
 * ganancia.
 *
 * `requireAdmin` y NO el recorte por vendedor que usan `/kpis` y `/trend`: acá
 * el coste y la ganancia de tienda son el contenido principal, no un campo que
 * se pueda podar. Un vendedor no tiene por qué ver el margen de la tienda ni
 * siquiera de sus propias ventas (mismo criterio que POST /api/sales/quote).
 */
router.get(
  '/sales-ledger',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate, sellerUid } = parsed.data;
    res.json(await getSalesLedger(startDate, endDate, sellerUid));
  })
);

/**
 * GET /api/reports/delivery-invoices
 * Facturas con envío del periodo, una por fila. Solo admin.
 */
router.get(
  '/delivery-invoices',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate } = parsed.data;
    res.json(await getDeliveryInvoices(startDate, endDate));
  })
);

/**
 * GET /api/reports/losses
 * Listado paginado de pérdidas.
 */
router.get(
  '/losses',
  requireAdmin,
  asyncHandler(async (req, res) => {
    // pagination.ts parsea y valida de forma segura `limit` y `cursor`
    const paginationParams = parseCursor(req.query);
    const result = await listLosses(paginationParams);

    res.json(result);
  })
);

/**
 * GET /api/reports/sales-export
 * Array plano de ventas para exportar a CSV.
 */
router.get(
  '/sales-export',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate } = parsed.data;
    const exportData = await exportSales(startDate, endDate);

    res.json(exportData);
  })
);

/**
 * GET /api/reports/expenses
 * Gastos operativos agregados por pozo.
 */
router.get(
  '/expenses',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError(INVALID_RANGE);
    }

    const { startDate, endDate } = parsed.data;
    const expenses = await getExpensesByPozo(startDate, endDate);

    res.json(expenses);
  })
);

export default router;
