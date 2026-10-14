// Espacios y guiones no cambian el modelo; los sufijos como Pro sí lo cambian.
export const templateNameKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_–—-]+/g, '');
