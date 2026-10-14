import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Teléfono nicaragüense o internacional: 8 a 15 dígitos, con `+` opcional.
// El límite de 15 es el máximo de E.164. Sin esta regex, `phone` aceptaba
// cualquier string (incluido un payload de 5 MB o texto para inyectar en el
// mensaje de WhatsApp que se arma después).
//
// Vive acá arriba y no en la sección de checkout porque la usan las dos: los
// schemas se evalúan en orden al cargar el módulo, así que declararla más abajo
// haría que este archivo reventara por TDZ al importarse.
export const PHONE_RE = /^\+?\d{8,15}$/;

// ── Cuenta bancaria de pago ──
//
// FUENTE ÚNICA de bancos y monedas: el dropdown del panel se arma desde estas
// listas, así que agregar un banco es tocar UN lugar. Duplicar la lista en el
// componente es cómo se llega a un select que ofrece una opción que el backend
// rechaza.
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

// Edición del perfil de un empleado. Lo comparten DOS endpoints con alcances
// distintos: el del admin sobre cualquier fila (PATCH /api/admin/users/:id/
// profile, requireAdmin) y el self-service de cada persona sobre la suya
// (PATCH /api/me/profile, requireAnyRole). Mismo contrato porque son los mismos
// campos; lo que cambia es SOBRE QUIÉN se aplica, y eso lo decide la ruta.
//
// Lo que no está acá está afuera a propósito: el correo CORPORATIVO lo administra
// Entra ID, no nosotros — cambiarlo desde el panel dejaría el perfil desalineado
// con la identidad que realmente autentica —, y `roles`/`status`/`deleted_at` son
// administración, no perfil. Al ser un objeto no-estricto, zod DESCARTA esas
// claves si alguien las manda igual: el endpoint self-scoped no puede escalar
// privilegios ni por accidente.
//
// `phone` y `personal_email` admiten `''` además de `undefined`: el formulario
// manda el input vacío cuando el admin borra el dato, y eso significa "limpiar",
// no "no tocar". `.optional()` a secas rechazaría el string vacío. La cuenta
// bancaria usa `null` para lo mismo, porque es un objeto y no un string.
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
      // `z.preprocess` deja el INPUT como `unknown` en zod 4, y con eso
      // react-hook-form no puede tipar `watch('bank_account.bank')` ni sus
      // errores. El formulario siempre manda la forma del objeto (o null), así
      // que se declara ese input; la validación en runtime no cambia.
    ) as unknown as z.ZodType<
      BankAccount | null | undefined,
      z.input<typeof bankAccountSchema> | null | undefined
    >,
    // Foto de perfil ya subida (a R2, vía `/api/upload` o `/api/me/avatar`): acá
    // solo viaja la URL resultante, nunca el archivo. `null` la quita; omitir la
    // clave deja la que estuviera — necesario porque el admin guarda el resto del
    // formulario sin tocar la foto, y un `undefined` interpretado como "borrar"
    // se la comería en cada guardado.
    avatar_url: z
      .string()
      .trim()
      .url('La foto de perfil debe ser una URL válida.')
      .max(500)
      .nullable()
      .optional(),
  })
  // Regla de negocio, no de formulario: Ficohsa solo opera cuentas en dólares.
  // Vive acá y no en el componente para que el backend la rechace igual aunque
  // el request no venga del panel.
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
