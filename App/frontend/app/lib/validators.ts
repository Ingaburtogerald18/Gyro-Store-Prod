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

// Convierte string a número; "" / null / undefined → NaN para que Zod lo rechace.
const requiredPositiveNumber = (msg = "Requerido") =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ message: msg }).positive(msg),
  );

// Editar una compra (EditPurchaseModal).
export const purchaseFormSchema = z.object({
  purchaseDate: z.string().min(1, "Fecha requerida"),
  // Lote viejo (LT1) o número de la orden de compra.
  lot: z.string().trim().min(1, "Lote requerido").max(60),
  productName: z.string().min(2, "Nombre requerido"),
  category: z.string().min(1, "Categoría requerida"),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ message: "Requerido" }).int("Debe ser entero").positive("Debe ser mayor a 0"),
  ),
  costUnit: requiredPositiveNumber("Precio base requerido"),
  // 0 es válido: hay compras sin impuesto (el servidor ya lo aceptaba).
  taxUnit: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z.number({ message: "Impuesto requerido" }).nonnegative("No puede ser negativo"),
  ),
  suggestedPrice: z.coerce.number().nonnegative("No puede ser negativo").optional(),
});
export type PurchaseFormInput = z.infer<typeof purchaseFormSchema>;
// z.preprocess hace que la entrada del formulario y la salida validada difieran: react-hook-form
// necesita los dos tipos.
export type PurchaseFormValues = z.input<typeof purchaseFormSchema>;

// Reportar llegada a Nicaragua.
export const arrivalFormSchema = z.object({
  arrivalDate: z.string().min(1, "Fecha de ingreso requerida"),
  shippingUnit: z.coerce.number().nonnegative("No puede ser negativo"),
  // Es el único precio que usa la tienda.
  suggestedPrice: z.coerce.number({ error: "Escribí el precio de venta." }).positive("Escribí el precio de venta."),
  // Vacío = la tasa de Configuración.
  exchangeRate: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("Debe ser mayor a 0").max(1000, "Revisá la tasa").optional(),
  ),
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
