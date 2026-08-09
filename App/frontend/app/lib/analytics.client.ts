// Cliente de telemetría del storefront. SOLO navegador (todo acceso a window /
// localStorage vive dentro de funciones; el módulo no tiene efectos al importarse,
// para no romper el SSR de Remix).
//
// Responsabilidades:
//   · Consentimiento: nada se emite hasta que el visitante acepta (banner).
//   · sessionId anónimo (sin PII): UUID en localStorage con ventana deslizante de
//     30 min. Permite deduplicar visitas y armar embudos por sesión.
//   · Cola + envío por lotes con sendBeacon (con fallback a fetch keepalive), para
//     no pegarle al server en cada evento y no bloquear la navegación.
//
// Reglas anti-data-falsa (objetivo #1 del encargo): el DEBOUNCE y el "commit" de
// las búsquedas NO viven acá sino en quien llama a `trackSearch` (la grilla, tras
// la pausa de tecleo). Acá se garantiza lo transversal: no emitir sin
// consentimiento, no emitir para staff, no emitir en rutas de admin/login.

import type { AnalyticsEventType } from './analytics-shared';

const CONSENT_KEY = 'gyro:analytics-consent';
const SID_KEY = 'gyro:sid';
const SID_EXP_KEY = 'gyro:sid:exp';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min deslizantes
const ENDPOINT = '/api/analytics';
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 10; // vaciar antes si se acumula

export type ConsentState = 'granted' | 'denied' | 'unset';

interface QueuedEvent {
  type: AnalyticsEventType;
  sessionId?: string;
  path?: string;
  payload?: Record<string, unknown>;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let listenersReady = false;

const isBrowser = () => typeof window !== 'undefined';

// ── Consentimiento ───────────────────────────────────────────────────────────

export function getConsent(): ConsentState {
  if (!isBrowser()) return 'unset';
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

export function setConsent(value: 'granted' | 'denied'): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* almacenamiento bloqueado: sin consentimiento persistido, no se trackea */
  }
  // Al rechazar, se descarta cualquier evento en cola y se borra la sesión: nada
  // pendiente debe salir tras un "no".
  if (value === 'denied') {
    queue = [];
    try {
      window.localStorage.removeItem(SID_KEY);
      window.localStorage.removeItem(SID_EXP_KEY);
    } catch {
      /* noop */
    }
  }
}

// ── Sesión anónima ───────────────────────────────────────────────────────────

function randomId(): string {
  try {
    if (isBrowser() && window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {
    /* cae al fallback */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Devuelve el sessionId vigente o crea uno nuevo. Cada llamada corre la ventana
// de expiración 30 min hacia adelante (sesión "deslizante"): mientras el
// visitante siga activo, sigue siendo la misma sesión; tras 30 min inactivo,
// la próxima interacción abre una sesión nueva.
function getSessionId(): string | undefined {
  if (!isBrowser()) return undefined;
  try {
    const now = Date.now();
    const exp = Number(window.localStorage.getItem(SID_EXP_KEY) ?? 0);
    let sid = window.localStorage.getItem(SID_KEY) ?? '';
    if (!sid || !Number.isFinite(exp) || now > exp) {
      sid = randomId();
      window.localStorage.setItem(SID_KEY, sid);
    }
    window.localStorage.setItem(SID_EXP_KEY, String(now + SESSION_TTL_MS));
    return sid;
  } catch {
    return undefined;
  }
}

// Lee el sessionId VIGENTE sin crear uno nuevo, y solo si hay consentimiento. Lo
// usa el checkout para mandar la sesión con el pedido y enlazar el embudo
// vista→pedido en el server. Si no hay consentimiento o sesión, devuelve
// undefined (el pedido igual se crea; solo no queda enlazado a una sesión).
export function getAnalyticsSessionId(): string | undefined {
  if (!isBrowser() || getConsent() !== 'granted') return undefined;
  try {
    return window.localStorage.getItem(SID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Exclusiones ──────────────────────────────────────────────────────────────

// El staff no se trackea: son ventas de humo cada vez que prueban la tienda. El
// único que inicia sesión con Supabase es el personal (el comprador es anónimo),
// así que la presencia de un token `sb-…-auth-token` en localStorage delata staff.
function hasStaffSession(): boolean {
  if (!isBrowser()) return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) return true;
    }
  } catch {
    /* noop */
  }
  return false;
}

function isPrivatePath(path: string): boolean {
  return path.startsWith('/admin') || path.startsWith('/login') || path.startsWith('/auth');
}

function canTrack(path: string): boolean {
  return (
    isBrowser() &&
    getConsent() === 'granted' &&
    !hasStaffSession() &&
    !isPrivatePath(path)
  );
}

// ── Cola y envío ─────────────────────────────────────────────────────────────

function ensureListeners(): void {
  if (listenersReady || !isBrowser()) return;
  listenersReady = true;
  // Al ocultar/cerrar la pestaña se vacía lo pendiente: es el momento en que
  // sendBeacon fue diseñado para funcionar aunque la página se vaya.
  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('visibilitychange', flushOnHide);
  window.addEventListener('pagehide', flush);
}

function startTimer(): void {
  if (flushTimer || !isBrowser()) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
}

export function flush(): void {
  if (!isBrowser() || queue.length === 0) return;
  const events = queue;
  queue = [];
  const body = JSON.stringify({ events });
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch {
    /* cae al fetch de abajo */
  }
  // Fallback: fetch con keepalive (sobrevive a la descarga de la página).
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    /* telemetría best-effort: un fallo de red no se reintenta ni se avisa */
  });
}

function enqueue(event: QueuedEvent): void {
  queue.push(event);
  ensureListeners();
  startTimer();
  if (queue.length >= MAX_QUEUE) flush();
}

// ── API pública de tracking ──────────────────────────────────────────────────

export function track(
  type: AnalyticsEventType,
  payload: Record<string, unknown> = {},
  pathOverride?: string,
): void {
  if (!isBrowser()) return;
  const path = pathOverride ?? window.location.pathname;
  if (!canTrack(path)) return;
  enqueue({ type, sessionId: getSessionId(), path, payload });
}

export const trackPageView = (path?: string) => track('page_view', {}, path);

export const trackProductView = (catalogItemId: string) =>
  track('product_view', { catalogItemId });

// El llamador ya normalizó la query (minúsculas/trim) y esperó la pausa de
// tecleo: acá solo se sella el conteo de resultados y la marca de "sin resultados".
export const trackSearch = (queryNormalized: string, resultsCount: number) =>
  track('search', { queryNormalized, resultsCount, zeroResults: resultsCount === 0 });

export const trackCheckoutStart = (itemCount: number, total: number) =>
  track('checkout_start', { itemCount, total });
