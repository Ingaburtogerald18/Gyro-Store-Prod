import type { AdminTemplate } from '@shared/schemas';
import { templateNameKey } from '@shared/templateNames';

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = next;
  }
  return previous[b.length];
}

export function searchTemplates(templates: AdminTemplate[], query: string): AdminTemplate[] {
  const key = templateNameKey(query);
  const words = query
    .toLowerCase()
    .split(/[\s_–—-]+/)
    .filter(Boolean);
  function score(template: AdminTemplate): number {
    const name = templateNameKey(template.name);
    if (!key || name === key) return 0;
    if (name.startsWith(key)) return 1;
    if (name.includes(key)) return 2;
    if (name.length >= 3 && key.includes(name)) return 3;
    const tokens = template.name
      .toLowerCase()
      .split(/[\s_–—-]+/)
      .filter(Boolean);
    if (words.every((word) => tokens.some((token) => token.startsWith(word)))) return 3;
    if (
      key.length >= 4 &&
      Math.abs(name.length - key.length) <= 2 &&
      distance(name, key) <= (key.length < 7 ? 1 : 2)
    )
      return 4;
    return Infinity;
  }
  return templates
    .map((template) => ({ template, score: score(template) }))
    .filter((match) => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || a.template.name.localeCompare(b.template.name, 'es'))
    .map((match) => match.template);
}
