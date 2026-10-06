import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { parseUuidParam } from '../utils/params';
import { requireSeller } from '../middleware/auth';
import { trackOrderLimiter } from '../middleware/rateLimiter';
import {
  createPublicOrder,
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
    const order = await createPublicOrder(input);

    // 3. Responder con el recurso creado.
    res.status(201).json({ order });
  })
);

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
