// Helpers compartidos del frontend. `cn` es el estándar de shadcn/ui (combina
// clases condicionales y resuelve conflictos de utilidades Tailwind); el resto
// viene portado de la v1 para que los componentes del storefront se reciclen.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

