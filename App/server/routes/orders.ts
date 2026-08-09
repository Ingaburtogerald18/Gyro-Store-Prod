import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { createPublicOrder } from '../services/orders';
import { publicOrderInputSchema } from '../../shared/schemas';

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

export default router;