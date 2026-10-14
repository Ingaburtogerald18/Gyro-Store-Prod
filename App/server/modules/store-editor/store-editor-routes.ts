// Modo edición de la tienda: entrar (tomar el bloqueo), latido, guardar el
// borrador con cada cambio, publicar y salir. Solo admin.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAdmin } from '../../middleware/auth';
import {
  editorHeartbeatSchema,
  editorReleaseSchema,
  editorSessionSchema,
  restoreVersionSchema,
  storeDraftInputSchema,
  storePublishInputSchema,
} from '../../../shared/schemas';
import {
  discardDraft,
  EditorBusyError,
  enterEditor,
  heartbeat,
  listEditorProducts,
  publishDraft,
  releaseEditor,
  restoreVersion,
  saveDraft,
} from './store-draft';
import { listVersions } from './store-versions';

const router = Router();
router.use(requireAdmin);

router.post(
  '/enter',
  asyncHandler(async (req, res) => {
    const { session } = editorSessionSchema.parse(req.body);
    try {
      res.json(await enterEditor(req.user!, session));
    } catch (err) {
      // Quien no entra necesita saber quién está editando.
      if (err instanceof EditorBusyError) return void res.status(409).json({ error: err.message, holder: err.holder });
      throw err;
    }
  }),
);

router.get(
  '/products',
  asyncHandler(async (_req, res) => {
    res.json(await listEditorProducts());
  }),
);

router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const { session, active } = editorHeartbeatSchema.parse(req.body);
    await heartbeat(req.user!, session, active);
    res.status(204).end();
  }),
);

router.put(
  '/draft',
  asyncHandler(async (req, res) => {
    res.json(await saveDraft(req.user!, storeDraftInputSchema.parse(req.body)));
  }),
);

router.post(
  '/discard',
  asyncHandler(async (req, res) => {
    const { session } = editorSessionSchema.parse(req.body);
    await discardDraft(req.user!, session);
    res.status(204).end();
  }),
);

router.post(
  '/release',
  asyncHandler(async (req, res) => {
    const { session, draft } = editorReleaseSchema.parse(req.body);
    await releaseEditor(req.user!, session, draft);
    res.status(204).end();
  }),
);

router.post(
  '/publish',
  asyncHandler(async (req, res) => {
    res.json(await publishDraft(req.user!, storePublishInputSchema.parse(req.body)));
  }),
);

router.get(
  '/versions',
  asyncHandler(async (_req, res) => {
    res.json(await listVersions());
  }),
);

router.post(
  '/versions/:id/restore',
  asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json(await restoreVersion(req.user!, id, restoreVersionSchema.parse(req.body)));
  }),
);

export default router;
