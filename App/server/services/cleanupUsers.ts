import { db } from '../supabase';
import { logger } from '../utils/logger';

/**
 * Busca perfiles que lleven más de 30 días dados de baja (Soft Delete)
 * y los elimina permanentemente (Hard Delete) tanto de Auth como de profiles.
 */
export async function cleanupDeletedUsers() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Obtener usuarios a borrar
    const { data: usersToDelete, error: fetchError } = await db
      .from('profiles')
      .select('id, email, name')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', thirtyDaysAgo.toISOString());
      
    if (fetchError) {
      logger.error('Error obteniendo usuarios para Hard Delete:', { error: fetchError });
      return;
    }
    
    if (!usersToDelete || usersToDelete.length === 0) {
      logger.info('[CRON] No hay usuarios pendientes de Hard Delete (más de 30 días).');
      return;
    }
    
    logger.info(`[CRON] Encontrados ${usersToDelete.length} usuarios para borrar definitivamente.`);
    
    for (const user of usersToDelete) {
      try {
        // Borrar de Auth (esto borra en cascada de profiles, o lo borramos después si no hay cascada)
        const { error: authError } = await db.auth.admin.deleteUser(user.id);
        
        // También intentamos borrar el profile por si Auth falló pero el perfil quedó
        const { error: profileError } = await db.from('profiles').delete().eq('id', user.id);
        
        if (!authError && !profileError) {
          logger.info(`[CRON] Hard Delete exitoso para: ${user.email}`);
        } else {
          logger.error(`[CRON] Error parcial borrando a ${user.email}`, { authError, profileError });
        }
      } catch (err) {
        logger.error(`[CRON] Excepción borrando a ${user.email}:`, { error: err });
      }
    }
  } catch (error) {
    logger.error('Error general en cleanupDeletedUsers:', { error });
  }
}

/**
 * Inicia el temporizador en segundo plano para limpiar usuarios.
 * Se ejecuta al iniciar el servidor y luego cada 24 horas.
 */
export function startUserCleanupCron() {
  // Ejecutar 30 segundos después de iniciar (no bloquear arranque)
  setTimeout(() => cleanupDeletedUsers(), 30_000);
  
  // Ejecutar cada 24 horas
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(cleanupDeletedUsers, ONE_DAY_MS);
}
