// Perfil PROPIO de quien está autenticado (self-service, cualquier rol).
//
// ── Por qué existe separado de /api/admin/users ──
// Personal es un módulo de administración: sus endpoints son `requireAdmin` y
// reciben el id de la fila a tocar por la URL. Un vendedor que quiere corregir su
// teléfono no necesita —ni debe tener— permiso para editar filas ajenas, así que
// acá el id NO se acepta del cliente: sale de `req.user.uid`, que lo puso el
// middleware al verificar el JWT. No hay parámetro que manipular.
//
// Lo que este router NO puede cambiar, por diseño: `roles`, `status`,
// `deleted_at`, `id` y el correo corporativo. Los tres primeros son
// administración (los sigue manejando un admin desde Personal) y el correo lo
// administra Entra ID. `updateProfileSchema` ni los declara, y al ser un objeto
// no-estricto zod los descarta en silencio si vienen en el body.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { asyncHandler } from '../../utils/async-handler';
import { invalidateProfileCache, requireAnyRole } from '../../middleware/auth';
import { db } from '../../core/supabase';
import { optimizeImageBuffer, uploadFile, deleteFileByUrl } from '../files/storage';
import { updateProfileSchema } from '../../../shared/schemas';
import { logger } from '../../utils/logger';

const router = Router();

// La cuenta bancaria SÍ va acá (a diferencia de /api/staff/directory): es la
// propia, y es justamente el dato que la persona viene a cargar. `roles` viaja
// para pintar su rol de solo lectura en la pantalla.
const SELF_COLUMNS =
  'id, email, name, avatar_url, roles, status, deleted_at, created_at, phone, personal_email, bank_account';

// Mismo límite y filtro que `/api/upload`, pero solo imágenes: un avatar no
// puede ser un video.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('La foto de perfil debe ser una imagen.'));
    }
    cb(null, true);
  },
});

/**
 * Traduce los rechazos de multer (archivo enorme, no es imagen) a un 400 con el
 * motivo. Sin esto caen en el `else` del errorHandler como 500 "error inesperado",
 * que para un límite de tamaño es mentira: el problema lo puede resolver quien
 * sube, y necesita saber cuál es.
 */
const acceptAvatarFile: import('express').RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen supera los 10 MB.'
        : err.message || 'No se pudo leer la imagen.';
    res.status(400).json({ error: message });
  });
};

/** Lee la foto actual del perfil propio, para poder borrarla de R2 al reemplazarla. */
async function currentAvatarUrl(uid: string): Promise<string | null> {
  // `maybeSingle` y no `single`: si el perfil todavía no existe (carrera con el
  // middleware que lo crea en el primer login) esto no debe lanzar.
  const { data } = await db.from('profiles').select('avatar_url').eq('id', uid).maybeSingle();
  return data?.avatar_url || null;
}

// GET /api/me/profile — los datos con los que se hidrata «Mi perfil».
router.get(
  '/profile',
  requireAnyRole,
  asyncHandler(async (req, res) => {
    const { data, error } = await db
      .from('profiles')
      .select(SELF_COLUMNS)
      .eq('id', req.user!.uid)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Todavía no existe tu perfil. Volvé a iniciar sesión.' });
      return;
    }
    res.json(data);
  })
);

// PATCH /api/me/profile
router.patch(
  '/profile',
  requireAnyRole,
  asyncHandler(async (req, res) => {
    const uid = req.user!.uid;
    const input = updateProfileSchema.parse(req.body);

    // El string vacío significa "borrar el dato", no "no tocar": se guarda como
    // NULL para que la columna quede realmente vacía y no con un '' que después
    // se muestra como si hubiera algo.
    const blankToNull = (v: string | undefined) => (v === undefined || v === '' ? null : v);

    const patch: Record<string, unknown> = {
      name: input.name,
      phone: blankToNull(input.phone),
      personal_email: blankToNull(input.personal_email),
      bank_account: input.bank_account ?? null,
    };
    // La foto se sube por su propio endpoint, así que este formulario casi nunca
    // la manda: solo se toca la columna si la clave vino de verdad.
    if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;

    const { data, error } = await db
      .from('profiles')
      .update(patch)
      .eq('id', uid)
      .select(SELF_COLUMNS)
      .maybeSingle();

    if (error) throw error;

    // Sin esto, `/auth/me` seguiría devolviendo el nombre y la foto viejos hasta
    // 30 s (ver la caché de middleware/auth.ts).
    invalidateProfileCache(uid);
    res.json({ message: 'Perfil actualizado', data });
  })
);

// POST /api/me/avatar — subida manual de la foto (multipart, campo `file`).
router.post(
  '/avatar',
  requireAnyRole,
  acceptAvatarFile,
  asyncHandler(async (req, res) => {
    const uid = req.user!.uid;
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ninguna imagen.' });
      return;
    }

    const optimized = await optimizeImageBuffer(req.file.buffer);

    // Nombre por hash del contenido, prefijado con el uid: re-subir la misma foto
    // devuelve la misma URL en vez de duplicar el objeto en R2, y el prefijo evita
    // que dos personas con la misma imagen compartan archivo (borrar la de una
    // dejaría a la otra sin foto).
    const hash = crypto.createHash('sha256').update(optimized.buffer).digest('hex').slice(0, 16);
    const ext =
      optimized.ext ||
      (req.file.originalname.includes('.')
        ? '.' + req.file.originalname.split('.').pop()!.toLowerCase()
        : '.jpg');

    const previous = await currentAvatarUrl(uid);

    let url: string;
    try {
      url = await uploadFile(
        optimized.buffer,
        'avatars',
        `${uid}-${hash}${ext}`,
        optimized.contentType || req.file.mimetype
      );
    } catch (err: any) {
      logger.error('[me/avatar] No se pudo subir la foto', { message: err?.message });
      res.status(500).json({
        error: err?.message?.includes('R2 no está configurado')
          ? 'El almacenamiento de imágenes no está configurado en el servidor.'
          : 'No se pudo subir la foto.',
      });
      return;
    }

    const { error } = await db.from('profiles').update({ avatar_url: url }).eq('id', uid);
    if (error) throw error;
    invalidateProfileCache(uid);

    // Se borra la anterior DESPUÉS de que la nueva quedó guardada, y solo si es
    // otra: subir dos veces la misma imagen produce la misma URL (hash), y borrar
    // "la vieja" ahí sería borrar la que se acaba de guardar. `deleteFileByUrl`
    // ignora las URLs que no son de nuestro bucket.
    if (previous && previous !== url) await deleteFileByUrl(previous);

    res.json({ avatar_url: url });
  })
);

// DELETE /api/me/avatar — volver a las iniciales.
router.delete(
  '/avatar',
  requireAnyRole,
  asyncHandler(async (req, res) => {
    const uid = req.user!.uid;
    const previous = await currentAvatarUrl(uid);

    const { error } = await db.from('profiles').update({ avatar_url: null }).eq('id', uid);
    if (error) throw error;
    invalidateProfileCache(uid);

    if (previous) await deleteFileByUrl(previous);
    res.json({ avatar_url: null });
  })
);

export default router;
