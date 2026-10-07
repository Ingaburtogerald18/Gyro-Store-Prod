import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { parseUuidParam } from '../utils/params';
import { requireSeller } from '../middleware/auth';
import { trackOrderLimiter } from '../middleware/rateLimiter';
import {
  OrderReviewError,
  OrderCheckoutUnavailable,
  createPublicOrder,
  recoverPublicOrder,
  findPublicOrderByCode,
  getPublicOrderTracking,
  listPublicOrders,
  updatePublicOrderStatus,
} from '../services/orders';
import {
  publicOrderInputSchema,
  trackPublicOrderSchema,
  updatePublicOrderStatusSchema,
} from '../../shared/schemas';
import { z } from 'zod';

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
    res.json(await updatePublicOrderStatus(id, status));
  }),
);

export default router;
