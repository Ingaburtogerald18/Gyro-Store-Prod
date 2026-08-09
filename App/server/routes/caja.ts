import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireRole } from '../middleware/auth';
import {
  registerMovementInputSchema,
  registerTransferInputSchema,
  createAccountInputSchema,
  createCashClosureInputSchema,
  expenseCategoriesSchema,
} from '../../shared/schemas';
import {
  listAccounts,
  createAccount,
  toggleAccountStatus,
  listMovements,
  registerMovement,
  registerTransfer,
} from '../services/caja';
import { getExpenseCategories, updateExpenseCategories } from '../services/appConfig';
import { createClosure, listClosures } from '../services/closures';
import { getDailySummary } from '../services/dailySummary';

const router = Router();

router.use(requireRole('admin', 'cashier'));

// ── ACCOUNTS ──
router.get(
  '/accounts',
  asyncHandler(async (_req, res) => {
    const accounts = await listAccounts();
    res.json(accounts);
  })
);

router.post(
  '/accounts',
  asyncHandler(async (req, res) => {
    const { nombre, tipo, moneda, saldo_inicial } = createAccountInputSchema.parse(req.body);
    const account = await createAccount(nombre, tipo, moneda, saldo_inicial);
    res.status(201).json(account);
  })
);

router.patch(
  '/accounts/:id/toggle',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body;
    const account = await toggleAccountStatus(id as string, Boolean(activo));
    res.json(account);
  })
);

// ── MOVEMENTS ──
router.get(
  '/movimientos',
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const movements = await listMovements({ accountId, startDate, endDate });
    res.json(movements);
  })
);

router.post(
  '/movimientos',
  asyncHandler(async (req, res) => {
    const data = registerMovementInputSchema.parse(req.body);
    const userId = req.user!.uid;
    const movement = await registerMovement(data, userId);
    res.status(201).json(movement);
  })
);

// ── TRANSFERS ──
router.post(
  '/transferencias',
  asyncHandler(async (req, res) => {
    const data = registerTransferInputSchema.parse(req.body);
    const userId = req.user!.uid;
    const movements = await registerTransfer(data, userId);
    res.status(201).json(movements);
  })
);

// ── EXPENSE CATEGORIES ──
router.get(
  '/categorias-gasto',
  asyncHandler(async (_req, res) => {
    const categories = await getExpenseCategories();
    res.json(categories);
  })
);

router.put(
  '/categorias-gasto',
  asyncHandler(async (req, res) => {
    const parsed = expenseCategoriesSchema.parse(req.body);
    const categories = await updateExpenseCategories(parsed);
    res.json(categories);
  })
);

// ── DAILY SUMMARY (resumen del día) ──
router.get(
  '/resumen-dia',
  asyncHandler(async (_req, res) => {
    const summary = await getDailySummary();
    res.json(summary);
  })
);

// ── CLOSURES (arqueo) ──
router.get(
  '/cierres',
  asyncHandler(async (req, res) => {
    const accountId = req.query.accountId as string | undefined;
    const closures = await listClosures(accountId);
    res.json(closures);
  })
);

router.post(
  '/cierres',
  asyncHandler(async (req, res) => {
    const data = createCashClosureInputSchema.parse(req.body);
    const userId = req.user!.uid;
    const closure = await createClosure(data, userId);
    res.status(201).json(closure);
  })
);

export default router;
