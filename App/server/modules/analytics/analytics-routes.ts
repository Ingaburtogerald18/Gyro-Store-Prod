// Ingesta pública (POST /api/analytics, con telemetryLimiter y filtro de bots) y tablero (admin).
// El cliente solo emite con consentimiento y sin sesión de personal.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAdmin } from '../../middleware/auth';
import {
  ANALYTICS_EVENT_TYPES,
  ingestEvents,
  isBot,
  getDashboard,
} from './analytics';

const router = Router();

// Un evento del cliente. `payload` es libre (jsonb) pero acotado en tamaño por el
// límite global de body de Express (5mb) y por el techo de eventos por lote.
const eventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  sessionId: z.string().max(64).optional(),
  path: z.string().max(300).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(30),
});

// Rango de fechas para los reportes. Ambos opcionales: el service cae a los
// últimos 30 días. Se validan como ISO para no confiar en la query string.
const rangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function parseRange(query: unknown) {
  const parsed = rangeSchema.safeParse(query);
  if (!parsed.success) return { range: {}, limit: undefined as number | undefined };
  const { start, end, limit } = parsed.data;
  return { range: { start, end }, limit };
}

// POST /api/analytics — ingesta pública. Responde rápido y best-effort: la
// telemetría nunca debe frenar ni romper la navegación del visitante.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Filtro de bots por user-agent: su ruido no entra a la base.
    const ua = String(req.headers['user-agent'] ?? '');
    if (isBot(ua)) {
      res.status(204).end();
      return;
    }

    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Formato de eventos inválido.' });
      return;
    }

    await ingestEvents(parsed.data.events);
    res.status(202).json({ ok: true });
  }),
);

// ── Lecturas del dashboard (admin) ──

router.get(
  '/admin/dashboard',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { range, limit } = parseRange(req.query);
    res.json(await getDashboard(range, limit));
  }),
);

export default router;
