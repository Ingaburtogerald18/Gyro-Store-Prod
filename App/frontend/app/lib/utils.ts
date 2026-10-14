// `cn` combina clases y resuelve conflictos de Tailwind (estándar de shadcn).
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

