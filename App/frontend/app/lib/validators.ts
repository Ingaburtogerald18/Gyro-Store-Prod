// Esquemas Zod del frontend (validación de formularios con React Hook Form).
// Comparten forma con server/utils/validators.js donde aplica.
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const contactSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(80),
  email: z.string().email("Correo inválido"),
  phone: z.string().max(20).optional().or(z.literal("")),
  message: z.string().min(5, "Mensaje muy corto").max(2000),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const checkoutSchema = z
  .object({
    customerName: z.string().min(2, "Ingresa tu nombre").max(80),
    customerPhone: z.string().min(7, "Teléfono inválido").max(20),
    deliveryMethod: z.enum(["retiro", "envio"]),
    address: z.string().max(200).optional().or(z.literal("")),
    // Link de Google Maps con el pin GPS del cliente (opcional, lo llena el botón).
    locationUrl: z.string().max(300).optional().or(z.literal("")),
    note: z.string().max(500).optional().or(z.literal("")),
  })
  // En envío pedimos dirección escrita O ubicación GPS (al menos una).
  .refine(
    (d) => d.deliveryMethod !== "envio" || (d.address && d.address.length > 4) || !!d.locationUrl,
    { message: "Agrega tu dirección o comparte tu ubicación", path: ["address"] },
  );
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// Convierte string a número; "" / null / undefined → NaN para que Zod lo rechace.
const requiredPositiveNumber = (msg = "Requerido") =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ message: msg }).positive(msg),
  );

// Registro de compra (China).
export const purchaseFormSchema = z.object({
  purchaseDate: z.string().min(1, "Fecha requerida"),
  lot: z
    .string()
    .min(1, "Lote requerido")
    .regex(/^LT\d+$/i, "Formato incorrecto (ej. LT1, LT4)"),
  productName: z.string().min(2, "Nombre requerido"),
  // El backend la exige al registrar la compra (newPurchaseInputSchema), así
  // que el formulario tiene que pedirla: sin esto el POST vuelve 400.
  category: z.string().min(1, "Categoría requerida"),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ message: "Requerido" }).int("Debe ser entero").positive("Debe ser mayor a 0"),
  ),
  costUnit: requiredPositiveNumber("Precio base requerido"),
  taxUnit: requiredPositiveNumber("Impuesto requerido"),
  suggestedPrice: z.coerce.number().nonnegative("No puede ser negativo").optional(),
});
export type PurchaseFormInput = z.infer<typeof purchaseFormSchema>;
// `quantity`/`costUnit`/`taxUnit` usan z.preprocess (un campo vacío debe
// rechazar, no convertirse en 0): el tipo de ENTRADA del formulario (lo que
// register()/Controller sostienen antes de validar) no es el mismo que el de
// SALIDA (PurchaseFormInput, ya coercionado) — react-hook-form necesita los
// dos por separado para que el resolver tipe bien.
export type PurchaseFormValues = z.input<typeof purchaseFormSchema>;

// Reportar llegada a Nicaragua.
export const arrivalFormSchema = z.object({
  arrivalDate: z.string().min(1, "Fecha de ingreso requerida"),
  shippingUnit: z.coerce.number().nonnegative("No puede ser negativo"),
  suggestedPrice: z.coerce.number().nonnegative("No puede ser negativo").optional(),
});
export type ArrivalFormInput = z.infer<typeof arrivalFormSchema>;
// Mismo motivo: shippingUnit/suggestedPrice usan z.coerce.number().
export type ArrivalFormValues = z.input<typeof arrivalFormSchema>;

// Venta en cuotas (solo admin).
export const installmentFormSchema = z.object({
  customerName: z.string().min(2, "Nombre del cliente requerido").max(80),
  customerPhone: z.string().min(7, "Teléfono inválido").max(20).optional().or(z.literal("")),
  sellerEmail: z.string().email("Correo inválido").optional().or(z.literal("")),
  sellerName: z.string().max(80).optional().or(z.literal("")),
  totalAmount: z.coerce.number().positive("Monto total requerido"),
  numInstallments: z.coerce.number().int().min(2, "Mínimo 2 cuotas").max(24, "Máximo 24 cuotas"),
  installmentAmount: z.coerce.number().positive("Monto por cuota requerido"),
  firstPaymentDate: z.string().min(1, "Fecha del primer pago requerida"),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type InstallmentFormInput = z.infer<typeof installmentFormSchema>;

// Registrar pago de una cuota.
export const installmentPaymentSchema = z.object({
  amount: z.coerce.number().positive("El monto del pago es requerido"),
  paymentDate: z.string().min(1, "Fecha del pago requerida"),
  nextPaymentDate: z.string().optional().or(z.literal("")),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta"]).optional(),
  notes: z.string().max(300).optional().or(z.literal("")),
});
export type InstallmentPaymentInput = z.infer<typeof installmentPaymentSchema>;
