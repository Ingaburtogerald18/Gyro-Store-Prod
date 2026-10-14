// Aparte del worker para que aprobar una venta no cargue pdf-lib ni el cliente de Graph.
import { db } from '../../core/supabase';
import { logger } from '../../utils/logger';

/**
 * Nunca lanza: aprobar no se cae porque falle el encolado (queda en el log). `order_id` es único,
 * así que una venta re-aprobada no genera otra fila.
 */
export async function enqueueApprovedSale(orderId: string): Promise<void> {
  try {
    const { error } = await db
      .from('spo_outbox')
      .upsert({ order_id: orderId }, { onConflict: 'order_id', ignoreDuplicates: true });

    if (error) {
      // Incluye que falte la tabla: la app sigue vendiendo con un aviso en el log.
      logger.warn('[spo] No se pudo encolar la venta para SharePoint', {
        orderId,
        message: error.message,
      });
    }
  } catch (err) {
    logger.warn('[spo] Excepción al encolar la venta para SharePoint', {
      orderId,
      message: (err as Error)?.message,
    });
  }
}
