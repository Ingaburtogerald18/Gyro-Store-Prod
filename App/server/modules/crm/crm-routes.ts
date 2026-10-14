// CRM del panel: contactos, ficha 360 y seguimientos. Admin y vendedor: es herramienta de venta.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireSeller } from '../../middleware/auth';
import {
  adminContactInputSchema,
  adminContactUpdateSchema,
  contactActivityInputSchema,
  followUpInputSchema,
  followUpUpdateSchema,
} from '../../../shared/schemas';
import {
  addContactActivity,
  createContact,
  createFollowUp,
  getContact360,
  listContacts,
  listFollowUps,
  updateContact,
  updateFollowUp,
} from './crm';

const router = Router();

router.use(requireSeller);

const idSchema = z.uuid();

// ── Contactos ──

router.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
    res.json({ items: await listContacts({ search, stage }) });
  }),
);

router.post(
  '/contacts',
  asyncHandler(async (req, res) => {
    const data = adminContactInputSchema.parse(req.body);
    res.status(201).json(await createContact(data));
  }),
);

// Ficha 360: contacto + pedidos + ventas + actividad + seguimientos + LTV.
router.get(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Contacto no encontrado.' });
      return;
    }
    const ficha = await getContact360(id.data);
    if (!ficha) {
      res.status(404).json({ error: 'Contacto no encontrado.' });
      return;
    }
    res.json(ficha);
  }),
);

router.patch(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Contacto no encontrado.' });
      return;
    }
    const data = adminContactUpdateSchema.parse(req.body);
    const updated = await updateContact(id.data, data);
    if (!updated) {
      res.status(404).json({ error: 'Contacto no encontrado.' });
      return;
    }
    res.json(updated);
  }),
);

router.post(
  '/contacts/:id/activities',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Contacto no encontrado.' });
      return;
    }
    const { note } = contactActivityInputSchema.parse(req.body);
    res.status(201).json(await addContactActivity(id.data, note));
  }),
);

// ── Agenda de seguimientos ──

router.get(
  '/follow-ups',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const upto = typeof req.query.upto === 'string' ? req.query.upto : undefined;
    res.json({ items: await listFollowUps({ status, upto }) });
  }),
);

router.post(
  '/follow-ups',
  asyncHandler(async (req, res) => {
    const data = followUpInputSchema.parse(req.body);
    res.status(201).json(await createFollowUp(data, req.user?.uid ?? null));
  }),
);

router.patch(
  '/follow-ups/:id',
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Seguimiento no encontrado.' });
      return;
    }
    const data = followUpUpdateSchema.parse(req.body);
    const updated = await updateFollowUp(id.data, data);
    if (!updated) {
      res.status(404).json({ error: 'Seguimiento no encontrado.' });
      return;
    }
    res.json(updated);
  }),
);

export default router;
