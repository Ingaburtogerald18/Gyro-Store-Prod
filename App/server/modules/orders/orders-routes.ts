import { Router } from 'express';
import { syncPublicOrderReservation } from '../inventory/inventory-web-reservations';
import { asyncHandler } from '../../utils/async-handler';
import { parseUuidParam } from '../../utils/params';
import { requireAdmin, requireSeller } from '../../middleware/auth';
import { convertPublicOrderToSale } from '../sales/sales-conversions';
import { trackOrderLimiter } from '../../middleware/rate-limiter';
import {
  OrderReviewError,
  OrderCheckoutUnavailable,
  createPublicOrder,
  recoverPublicOrder,
  findPublicOrderByCode,
  getPublicOrderTracking,
  listPublicOrders,
  updatePublicOrderOperation,
  updatePublicOrderStatus,
} from './orders';
import {
  publicOrderInputSchema,
  publicOrderOperationSchema,
  trackPublicOrderSchema,
  updatePublicOrderStatusSchema,
} from '../../../shared/schemas';
import { z } from 'zod';
import { OrderAttemptConflict } from './order-idempotency';

const router = Router();

// Endpoint público para crear un nuevo pedido desde el checkout.
// No requiere autenticación.
router.post(
  '/public',
  asyncHandler(async (req, res) => {
    // 1. Validar el body contra el contrato único de Zod.
    // Si falla, lanza un ZodError que será atrapado y formateado por el errorHandler.
    const input = publicOrderInputSchema.parse(req.body);

    // 2. Procesar la creación de la orden (recalcula los precios desde la BD).
    // Si el carrito necesita revisión, 409 con los problemas por línea.
    let order;
    try {
      order = await createPublicOrder(input);
    } catch (err) {
      if (err instanceof OrderAttemptConflict) {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof OrderCheckoutUnavailable) {
        res.status(503).json({ error: err.message });
        return;
      }
      if (err instanceof OrderReviewError) {
        res.status(409).json({ error: err.message, issues: err.issues });
        return;
      }
      throw err;
    }

    // 3. Responder con el recurso creado.
    res.status(201).json({ order });
  })
);

// La clave aleatoria es el secreto de recuperación, no un número de pedido.
router.post('/public/recover', trackOrderLimiter, asyncHandler(async (req, res) => {
  const { idempotencyKey } = z.object({ idempotencyKey: z.uuid() }).parse(req.body);
  try {
    res.json({ order: await recoverPublicOrder(idempotencyKey) });
  } catch (err) {
    if (err instanceof OrderCheckoutUnavailable) {
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

// Rastreo sin link: número corto + teléfono → id completo. Público, con límite
// propio de intentos. Va antes de `/public/:id` para que "track" no se lea como id.
router.post(
  '/public/track',
  trackOrderLimiter,
  asyncHandler(async (req, res) => {
    const input = trackPublicOrderSchema.parse(req.body);
    res.json(await findPublicOrderByCode(input));
  }),
);

// Seguimiento público por id completo (el link `/pedido/<id>`). El UUID es el
// secreto: la respuesta no lleva teléfono ni dirección.
router.get(
  '/public/:id',
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'No encontramos ese pedido.');
    res.json({ order: await getPublicOrderTracking(id) });
  }),
);

// ── Panel: pedidos web (admin + vendedor) ──

router.get(
  '/admin',
  requireSeller,
  asyncHandler(async (_req, res) => {
    res.json({ items: await listPublicOrders() });
  }),
);

router.patch(
  '/admin/:id/status',
  requireSeller,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'El pedido no existe.');
    const { status } = updatePublicOrderStatusSchema.parse(req.body);
    const updated = await updatePublicOrderStatus(id, status);
    // Confirmado (preparing/shipped) aparta stock; entregado, cancelado o de
    // vuelta a nuevo lo libera. `stock` dice qué no se pudo apartar.
    const stock = await syncPublicOrderReservation(id, status);
    res.json({ ...updated, stock });
  }),
);

// Pagos, transporte y recepción: datos del personal, nunca de la vista pública. Cambiarlos no toca el
// estado ni el stock.
router.patch(
  '/admin/:id/operation',
  requireSeller,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'El pedido no existe.');
    const input = publicOrderOperationSchema.parse(req.body);
    res.json({ operation: await updatePublicOrderOperation(id, input, req.user?.uid ?? null) });
  }),
);

// Convierte el pedido web en una venta pendiente de aprobación, pasándole el
// stock que el pedido ya tenía apartado. Solo admin: crea una venta con comisión.
router.post(
  '/admin/:id/convert-to-sale',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseUuidParam(req.params.id, 'El pedido no existe.');
    const { sellerId } = z.object({ sellerId: z.string().uuid().optional() }).parse(req.body ?? {});
    const result = await convertPublicOrderToSale(id, { uid: req.user!.uid, email: req.user!.email }, { sellerId });
    res.status(201).json(result);
  }),
);

export default router;
