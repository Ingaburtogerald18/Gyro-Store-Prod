// Encolado en el outbox de SharePoint. Vive aparte del worker a propósito:
// `modules/sales/sales-approval.ts` solo necesita ESTO (un insert de una fila), y no tiene por
// qué arrastrar pdf-lib ni el cliente de Graph en su árbol de imports.
import { db } from '../../core/supabase';
import { logger } from '../../utils/logger';

/**
 * Encola una venta aprobada para espejarla en SharePoint.
 *
 * BEST-EFFORT y por diseño: nunca lanza. Aprobar una venta consume stock y
 * congela comisiones; que el espejo de SharePoint no se pueda encolar no es
 * motivo para tumbar esa operación ni para mostrarle un error a quien aprobó.
 * Si esto falla, lo peor que pasa es que esa venta no aparezca en la Lista, y eso
 * queda en el log.
 *
 * Idempotente: `spo_outbox.order_id` es UNIQUE y acá se ignora el conflicto. Una
 * venta re-aprobada (editar una venta ya aprobada la vuelve a pasar por
 * `approveSale`) NO genera una segunda fila.
 */
export async function enqueueApprovedSale(orderId: string): Promise<void> {
  try {
    const { error } = await db
      .from('spo_outbox')
      .upsert({ order_id: orderId }, { onConflict: 'order_id', ignoreDuplicates: true });

    if (error) {
      // Incluye el caso "la migración 0010 todavía no se aplicó": la app tiene
      // que seguir vendiendo igual, con un aviso en el log y nada más.
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
