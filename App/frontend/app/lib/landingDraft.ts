// Borrador LOCAL del editor de portada: sobrevive a una recarga, a cerrar la
// pestaña o a una navegación accidental. Nunca se publica solo: recuperarlo lo
// vuelve a cargar en el editor, y publicar sigue siendo una acción explícita.
//
// Aislado por versión, usuario y sitio: un borrador de otra persona, de otro
// entorno (host) o con un formato viejo se ignora en vez de mezclarse.
import { landingConfigSchema, type LandingConfig } from '@shared/schemas';

export const LANDING_DRAFT_VERSION = 1;
const PREFIX = 'gyro:landing-draft';

export interface StoredLandingDraft {
  v: number;
  userId: string;
  host: string;
  /** Firma de la portada PUBLICADA cuando se empezó el borrador. */
  base: string;
  savedAt: string;
  draft: LandingConfig;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const keyFor = (userId: string, host: string) => `${PREFIX}:v${LANDING_DRAFT_VERSION}:${host}:${userId}`;

function storage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Firma estable de una configuración (para comparar borrador y publicada). */
export const signature = (config: LandingConfig | null | undefined) => (config ? JSON.stringify(config) : '');

export function saveLandingDraft(
  input: { userId: string; host: string; base: string; draft: LandingConfig },
  store: StorageLike | null = storage(),
): boolean {
  if (!store || !input.userId) return false;
  const value: StoredLandingDraft = { v: LANDING_DRAFT_VERSION, savedAt: new Date().toISOString(), ...input };
  try {
    store.setItem(keyFor(input.userId, input.host), JSON.stringify(value));
    return true;
  } catch {
    // Cuota llena o storage bloqueado: el borrador sigue en memoria.
    return false;
  }
}

export function loadLandingDraft(
  userId: string,
  host: string,
  store: StorageLike | null = storage(),
): StoredLandingDraft | null {
  if (!store || !userId) return null;
  try {
    const raw = store.getItem(keyFor(userId, host));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLandingDraft>;
    if (parsed.v !== LANDING_DRAFT_VERSION || parsed.userId !== userId || parsed.host !== host) return null;
    const draft = landingConfigSchema.safeParse(parsed.draft);
    if (!draft.success || typeof parsed.base !== 'string' || typeof parsed.savedAt !== 'string') return null;
    return { v: parsed.v, userId, host, base: parsed.base, savedAt: parsed.savedAt, draft: draft.data };
  } catch {
    return null;
  }
}

export function clearLandingDraft(userId: string, host: string, store: StorageLike | null = storage()) {
  try {
    store?.removeItem(keyFor(userId, host));
  } catch {
    // Nada que limpiar si el storage está bloqueado.
  }
}
