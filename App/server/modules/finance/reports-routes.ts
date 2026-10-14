// Reportería. Admin y vendedor: los reportes del negocio llevan requireAdmin; los que existen por
// vendedor fuerzan `sellerUid` al del token si quien pregunta no es admin.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAdmin, requireSeller } from '../../middleware/auth';
import { getFinancialKPIs, listLosses } from './reports-kpis';
import { exportSales, getSalesTrend, getSellerPerformance, getTopProducts, getSalesBreakdown, getDeliverySummary, getSalesLedger, getDeliveryInvoices } from './reports-sales';
import { getExpensesByPozo, createExpense, updateExpense, previewExpense, deleteExpense, listExpenses, getExpensesOverflow } from './expenses';
import { listLoanPayments, getLoanPaymentsSummary } from './loan-payments';
import { parseCursor } from '../../utils/pagination';
import { BadRequestError } from '../../utils/http-error';
import { parseUuidParam } from '../../utils/params';
import { createExpenseInputSchema } from '../../../shared/schemas';

const router = Router();

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

router.use(requireSeller);

const isAdminLike = (roles: string[]) => roles.includes('admin') || roles.includes('global_admin');

/** Al admin se le respeta lo que pida (incluido «todos»); a cualquier otro rol se le impone el suyo. */
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
      // El vendedor ve su volumen y su comisión, no la estructura de costos: con coste y precio se despeja
      // el margen. Los `_prev` también se recortan, porque con el delta se reconstruiría el actual.
      const {
        coste_total,
        ganancia_tienda_total,
        salary_acumulado,
        pozos_recogidos,
        coste_total_prev,
        ganancia_tienda_total_prev,
        total_prestamos,
        total_prestamos_prev,
        budget_prestamos_disponible,
        prestamos_cubierto_por_budget,
        prestamos_de_ganancia,
        gastos_de_ganancia,
        ganancia_real,
        ganancia_real_prev,
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

/** GET /api/reports/sellers — ranking del periodo. Solo admin: compara a un empleado con sus compañeros. */
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
    const topProducts = await getTopProducts(
      startDate,
      endDate,
      scopedSellerUid(req, sellerUid),
      limit ?? 10,
    );

    if (!isAdminLike(req.user!.roles)) {
      res.json(topProducts.map(({ margen, ...rest }) => rest));
      return;
    }

    res.json(topProducts);
  })
);

/** GET /api/reports/breakdown — por método de pago, origen, factura, código de descuento y cuotas. */
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
 * GET /api/reports/sales-ledger — una fila por venta con coste y ganancia. Solo admin: el margen
 * es el contenido, no un campo que se pueda recortar.
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
 * GET /api/reports/expenses/overflow
 * Calcula el estado de desbordamiento acumulativo y la ganancia real del negocio.
 */
router.get(
  '/expenses/overflow',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : (typeof req.query.desde === 'string' ? req.query.desde : undefined);
    const overflow = await getExpensesOverflow(startDate);
    res.json(overflow);
  })
);

/**
 * POST /api/reports/expenses
 * Registra un nuevo gasto operativo en un pozo o salario.
 */
router.post(
  '/expenses',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = createExpenseInputSchema.parse(req.body);
    const expense = await createExpense(data, req.user!.uid);
    res.status(201).json(expense);
  })
);

/** POST /api/reports/expenses/preview — de dónde saldría un gasto, sin escribir. `excludeId`: el que se edita. */
const expensePreviewSchema = createExpenseInputSchema.extend({ excludeId: z.string().uuid().optional() });

router.post(
  '/expenses/preview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { excludeId, ...data } = expensePreviewSchema.parse(req.body);
    res.json(await previewExpense(data, excludeId));
  })
);

/**
 * PATCH /api/reports/expenses/:id
 * Edita un gasto operativo (mismos campos que al registrarlo).
 */
router.patch(
  '/expenses/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Gasto no encontrado');
    const data = createExpenseInputSchema.parse(req.body);
    res.json(await updateExpense(id, data));
  })
);

/**
 * DELETE /api/reports/expenses/:id
 * Elimina un gasto operativo existente.
 */
router.delete(
  '/expenses/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'Gasto no encontrado');
    const result = await deleteExpense(id);
    res.json(result);
  })
);

/**
 * GET /api/reports/expenses
 * Gastos operativos agregados por pozo o listado detallado (?detail=true).
 */
router.get(
  '/expenses',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const isDetail = req.query.detail === 'true' || req.query.detail === '1';
    const startDate = typeof req.query.desde === 'string' ? req.query.desde : (typeof req.query.startDate === 'string' ? req.query.startDate : undefined);
    const endDate = typeof req.query.hasta === 'string' ? req.query.hasta : (typeof req.query.endDate === 'string' ? req.query.endDate : undefined);
    const pozo = typeof req.query.pozo === 'string' ? req.query.pozo : undefined;
    const page = req.query.page ? Math.max(1, Number(req.query.page)) : 1;
    const pageSize = req.query.pageSize ? Math.min(100, Math.max(1, Number(req.query.pageSize))) : 50;

    if (isDetail) {
      const list = await listExpenses({ pozo, startDate, endDate, page, pageSize });
      res.json(list);
      return;
    }

    const expenses = await getExpensesByPozo(startDate, endDate);
    res.json(expenses);
  })
);

/**
 * GET /api/reports/loan-payments/summary
 * Total de pagos de préstamos en el periodo.
 */
router.get(
  '/loan-payments/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : (typeof req.query.desde === 'string' ? req.query.desde : undefined);
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : (typeof req.query.hasta === 'string' ? req.query.hasta : undefined);
    const total = await getLoanPaymentsSummary(startDate, endDate);
    res.json({ total });
  })
);

/**
 * GET /api/reports/loan-payments
 * Listado de pagos de préstamos en el periodo con total acumulado.
 */
router.get(
  '/loan-payments',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : (typeof req.query.desde === 'string' ? req.query.desde : undefined);
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : (typeof req.query.hasta === 'string' ? req.query.hasta : undefined);
    const result = await listLoanPayments(startDate, endDate);
    res.json(result);
  })
);

export default router;

