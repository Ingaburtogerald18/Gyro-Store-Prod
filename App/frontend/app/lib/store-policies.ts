// Información comercial vigente, leída por ficha, carrito, checkout y footer. Lo no definido no se escribe.
export const STORE_POLICIES = {
  warranty: {
    title: 'Garantía de 1 mes',
    text: 'Por defectos de fábrica.',
  },
  payment: {
    title: 'Efectivo o transferencia',
    text: 'El pago se coordina por WhatsApp al confirmar el pedido.',
  },
  managua: {
    title: 'Delivery en Managua',
    text: 'Entrega el mismo día según coordinación y disponibilidad. Tiene costo adicional.',
  },
  outside: {
    title: 'Envíos al resto del país',
    text: 'Por Cargo Trans. Plazo informado de 24 a 48 horas, sujeto a la coordinación del transporte.',
  },
  shippingCost: 'Envío: por confirmar',
  shippingNote: 'El costo del envío se confirma por WhatsApp. No hay tarifa fija.',
} as const;
