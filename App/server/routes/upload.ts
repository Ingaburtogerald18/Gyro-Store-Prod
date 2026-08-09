import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { uploadFile, optimizeImageBuffer, sanitizePathSegment, deleteFileByUrl } from '../services/storage.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Configure multer to store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Solo se permiten imágenes y videos.'));
    }
    cb(null, true);
  },
});

// POST /api/upload
// Expects multipart/form-data with a file field named "file" and optional "folder"
router.post('/', requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo.' });
      return;
    }

    const file = req.file;
    const folder = sanitizePathSegment(req.body.folder || 'misc');
    
    // Default values if no optimization
    let bufferToUpload = file.buffer;
    let contentType = file.mimetype;
    let ext = file.originalname.includes('.') 
      ? '.' + file.originalname.split('.').pop()?.toLowerCase()
      : '';

    // Optimize image if it's an image
    if (file.mimetype.startsWith('image/')) {
      const optimized = await optimizeImageBuffer(file.buffer);
      bufferToUpload = optimized.buffer;
      contentType = optimized.contentType || contentType;
      ext = optimized.ext || ext;
    }

    // Generate unique filename using a hash to prevent duplicates in R2
    const hash = crypto.createHash('sha256').update(bufferToUpload).digest('hex').substring(0, 16);
    const uniqueFilename = `${hash}${ext}`;

    const url = await uploadFile(bufferToUpload, folder, uniqueFilename, contentType);

    res.json({ url });
  } catch (error: any) {
    if (error.message.includes('Cloudflare R2 no está configurado')) {
      res.status(500).json({ error: 'R2 no está configurado en el backend.' });
      return;
    }
    logger.error('Error in /api/upload', { message: error?.message });
    res.status(500).json({ error: 'Error al subir el archivo.' });
  }
});

// DELETE /api/upload
// Deletes a file from R2 (used to clean up orphaned files before saving)
router.delete('/', requireAdmin, async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Falta la URL.' });
      return;
    }
    
    await deleteFileByUrl(url);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error in DELETE /api/upload', { message: (error as any)?.message });
    res.status(500).json({ error: 'Error al eliminar el archivo.' });
  }
});

export default router;
