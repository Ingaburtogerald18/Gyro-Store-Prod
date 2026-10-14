import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// 8 a 15 dígitos con `+` opcional (máximo de E.164). Sin límite, `phone` aceptaba cualquier texto,
// incluso para inyectar en el mensaje de WhatsApp.
export const PHONE_RE = /^\+?\d{8,15}$/;

// ── Cuenta bancaria de pago ── El select del panel sale de esta lista: agregar un banco es tocar un lugar.
export const PAYOUT_BANKS = ['lafise', 'ficohsa', 'bac', 'banpro'] as const;
export const PAYOUT_CURRENCIES = ['NIO', 'USD'] as const;

export type PayoutBank = (typeof PAYOUT_BANKS)[number];
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

export const PAYOUT_BANK_LABELS: Record<PayoutBank, string> = {
  lafise: 'Lafise',
  ficohsa: 'Ficohsa',
  bac: 'BAC',
  banpro: 'Banpro',
};

export const PAYOUT_CURRENCY_LABELS: Record<PayoutCurrency, string> = {
  NIO: 'Córdobas (NIO)',
  USD: 'Dólares (USD)',
};

export const bankAccountSchema = z.object({
  bank: z.enum(PAYOUT_BANKS),
  currency: z.enum(PAYOUT_CURRENCIES),
  // Techo de 34: es el largo máximo de un IBAN. El mínimo de 4 descarta un
  // tecleo accidental sin rechazar formatos locales cortos.
  number: z
    .string()
    .trim()
    .min(4, 'El número de cuenta es demasiado corto.')
    .max(34, 'El número de cuenta es demasiado largo.'),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

// Perfil de un empleado: lo usan el admin (cualquier fila) y cada persona (la suya). Correo, roles
// y estado no están: zod descarta esas claves, así nadie escala privilegios. `''` significa borrar.
export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'El nombre no puede estar vacío.').max(80),
    phone: z
      .string()
      .max(20, 'El teléfono es demasiado largo.')
      .regex(PHONE_RE, 'Ingresá un teléfono válido: 8 a 15 dígitos, con + opcional.')
      .optional()
      .or(z.literal('')),
    personal_email: z
      .string()
      .email('Correo personal inválido.')
      .max(120)
      .optional()
      .or(z.literal('')),
    bank_account: z.preprocess(
      (val) => {
        if (val == null || typeof val !== 'object') return val;
        const o = val as Record<string, unknown>;
        if (!o.bank && !o.number) return null;
        return val;
      },
      bankAccountSchema.nullable().optional(),
      // `z.preprocess` deja el input como unknown en zod 4 y react-hook-form no puede tiparlo: se declara.
    ) as unknown as z.ZodType<
      BankAccount | null | undefined,
      z.input<typeof bankAccountSchema> | null | undefined
    >,
    // URL ya subida. `null` la quita y omitir la clave la deja: el admin guarda sin tocar la foto.
    avatar_url: z
      .string()
      .trim()
      .url('La foto de perfil debe ser una URL válida.')
      .max(500)
      .nullable()
      .optional(),
  })
  // Ficohsa solo opera cuentas en dólares. Acá para que el backend la rechace aunque no venga del panel.
  .superRefine((data, ctx) => {
    if (data.bank_account && data.bank_account.bank === 'ficohsa' && data.bank_account.currency !== 'USD') {
      ctx.addIssue({
        code: 'custom',
        path: ['bank_account', 'currency'],
        message: 'Ficohsa solo maneja cuentas en dólares (USD).',
      });
    }
  });
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
