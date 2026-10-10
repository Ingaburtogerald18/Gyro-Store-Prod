// La categoría se reconoce por su nombre; el punto usa el mismo acento de marca.
export function toneDotClass(key: string | null | undefined): string {
  return key ? 'bg-primary-2' : 'bg-muted-foreground/40';
}
