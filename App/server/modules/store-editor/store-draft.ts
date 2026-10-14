// Borrador compartido del modo edición y su bloqueo (migración 0029). Una sola
// fila: un admin a la vez edita, y lo que deja queda para el siguiente.
import { db } from '../../core/supabase';
import type { AuthUser } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import {
  landingConfigSchema,
  storeDraftProductsSchema,
  type EditorEntry,
  type EditorLockHolder,
  type EditorProduct,
  type LandingConfig,
  type StoreDraft,
  type StoreDraftInput,
  type StoreDraftProducts,
  type StorePublishInput,
} from '../../../shared/schemas';
import { getLandingConfig, saveLandingConfig } from './landing';
import { listCatalogForPricing } from '../catalog/catalog';
import { collectMappedCodes, includedOptions, normalizeAxes, normalizeImages, toCatalogProduct } from '../catalog/catalog-presenter';
import { getLotsByCodes } from '../inventory/inventory';
import { getActiveOffers } from '../catalog/offers';
import { cleanupLandingMedia, diffProducts, getVersionSnapshot, recordVersion, snapshotLive } from './store-versions';

const ROW = 'tienda';
// Sin latido por 2 minutos el navegador se cerró sin avisar (o se colgó).
const HEARTBEAT_STALE_MS = 2 * 60_000;
const IDLE_RELEASE_MS = 15 * 60_000;

const COLUMNS = 'landing, products, changed_at, changed_by, lock_holder, lock_session, lock_acquired_at';

interface DraftRow {
  landing: unknown;
  products: unknown;
  changed_at: string | null;
  changed_by: string | null;
  lock_holder: string | null;
  lock_session: string | null;
  lock_acquired_at: string | null;
}

export class EditorLockError extends Error {
  status = 409;
}

export class EditorBusyError extends EditorLockError {
  constructor(public holder: EditorLockHolder) {
    super(`Está editando ${holder.name}. Cuando cierre el editor vas a poder entrar.`);
  }
}

const MISSING_TABLE = ['42P01', 'PGRST205'];

function check(error: { code?: string } | null) {
  if (!error) return;
  if (MISSING_TABLE.includes(error.code ?? '')) {
    throw Object.assign(new Error('Falta correr la migración 0029 en Supabase para usar el modo edición.'), {
      status: 400,
    });
  }
  throw error;
}

const EMPTY_PRODUCTS: StoreDraftProducts = { items: {}, combos: {} };

const hasProductChanges = (p: StoreDraftProducts) =>
  Object.keys(p.items).length > 0 || Object.keys(p.combos).length > 0 || p.order !== undefined;

async function profileName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from('profiles').select('name, email').eq('id', id).maybeSingle();
  return (data?.name as string | null) || (data?.email as string | null) || null;
}

async function readRow(): Promise<DraftRow | null> {
  const { data, error } = await db.from('store_draft').select(COLUMNS).eq('id', ROW).maybeSingle();
  check(error);
  return data as DraftRow | null;
}

async function toDraft(row: DraftRow): Promise<StoreDraft | null> {
  let landing: LandingConfig | null = null;
  if (row.landing) {
    const parsed = landingConfigSchema.safeParse(row.landing);
    if (parsed.success) landing = parsed.data;
    else logger.error('store_draft.landing inválido; se ignora', { issues: parsed.error.issues });
  }
  const products = storeDraftProductsSchema.safeParse(row.products ?? {});
  const changes = products.success ? products.data : EMPTY_PRODUCTS;
  if (!landing && !hasProductChanges(changes)) return null;
  return { landing, products: changes, changedAt: row.changed_at, changedBy: await profileName(row.changed_by) };
}

/** Columnas del borrador; sin cambios, la fila queda como «sin borrador». */
function draftColumns(user: AuthUser, draft: Omit<StoreDraftInput, 'session'>, now: string) {
  const empty = !draft.landing && !hasProductChanges(draft.products);
  return {
    landing: draft.landing,
    products: draft.products,
    changed_at: empty ? null : now,
    changed_by: empty ? null : user.uid,
  };
}

/** Por qué una sesión ya no tiene el bloqueo, para decírselo a quien lo perdió. */
async function lockLost(user: AuthUser): Promise<EditorLockError> {
  const row = await readRow().catch(() => null);
  if (row?.lock_holder === user.uid) {
    return new EditorLockError('Abriste el editor en otra pestaña o ventana: esta se cerró. Tu borrador está guardado.');
  }
  const name = await profileName(row?.lock_holder ?? null);
  return new EditorLockError(
    name
      ? `${name} entró al editor después de que el tuyo quedó sin actividad. Tu borrador está guardado.`
      : 'El editor se cerró por inactividad. Tu borrador está guardado.',
  );
}

/**
 * Toma el bloqueo si está libre, vencido o es del mismo admin (otra pestaña:
 * la vieja se cierra sola). En un solo UPDATE para que dos admins no entren a la vez.
 */
export async function enterEditor(user: AuthUser, session: string, retried = false): Promise<EditorEntry> {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const staleBeat = new Date(now - HEARTBEAT_STALE_MS).toISOString();
  const idle = new Date(now - IDLE_RELEASE_MS).toISOString();

  const { data, error } = await db
    .from('store_draft')
    .update({
      lock_holder: user.uid,
      lock_session: session,
      lock_acquired_at: iso,
      lock_heartbeat_at: iso,
      lock_activity_at: iso,
    })
    .eq('id', ROW)
    .or(
      `lock_holder.is.null,lock_holder.eq.${user.uid},lock_heartbeat_at.lt."${staleBeat}",lock_activity_at.lt."${idle}"`,
    )
    .select(COLUMNS)
    .maybeSingle();
  check(error);

  if (!data) {
    const row = await readRow();
    if (!row && !retried) {
      // Base nueva sin la fila: se crea y se reintenta una vez.
      const { error: insertError } = await db.from('store_draft').upsert({ id: ROW }, { onConflict: 'id', ignoreDuplicates: true });
      check(insertError);
      return enterEditor(user, session, true);
    }
    if (!row) throw new Error('No se encontró la fila del borrador (store_draft).');
    throw new EditorBusyError({
      name: (await profileName(row.lock_holder)) ?? 'otro administrador',
      since: row.lock_acquired_at ?? iso,
    });
  }

  const [draft, published] = await Promise.all([toDraft(data as DraftRow), getLandingConfig()]);
  return { draft, published };
}

export async function heartbeat(user: AuthUser, session: string, active: boolean): Promise<void> {
  const iso = new Date().toISOString();
  const { data, error } = await db
    .from('store_draft')
    .update(active ? { lock_heartbeat_at: iso, lock_activity_at: iso } : { lock_heartbeat_at: iso })
    .eq('id', ROW)
    .eq('lock_session', session)
    .select('id')
    .maybeSingle();
  check(error);
  if (!data) throw await lockLost(user);
}

export async function saveDraft(user: AuthUser, input: StoreDraftInput): Promise<{ changedAt: string | null }> {
  const iso = new Date().toISOString();
  const columns = draftColumns(user, input, iso);
  const { data, error } = await db
    .from('store_draft')
    .update({ ...columns, lock_heartbeat_at: iso, lock_activity_at: iso })
    .eq('id', ROW)
    .eq('lock_session', input.session)
    .select('id')
    .maybeSingle();
  check(error);
  if (!data) throw await lockLost(user);
  return { changedAt: columns.changed_at };
}

export async function discardDraft(user: AuthUser, session: string): Promise<void> {
  await saveDraft(user, { session, landing: null, products: EMPTY_PRODUCTS });
}

/** Suelta el bloqueo (y guarda lo pendiente). Si ya no era suyo, no hace nada. */
export async function releaseEditor(
  user: AuthUser,
  session: string,
  draft?: Omit<StoreDraftInput, 'session'>,
): Promise<void> {
  const iso = new Date().toISOString();
  const { error } = await db
    .from('store_draft')
    .update({
      ...(draft ? draftColumns(user, draft, iso) : {}),
      lock_holder: null,
      lock_session: null,
      lock_acquired_at: null,
      lock_heartbeat_at: null,
      lock_activity_at: null,
    })
    .eq('id', ROW)
    .eq('lock_session', session);
  check(error);
}

/** Todos los productos, publicados o no, en el orden de la tienda. */
export async function listEditorProducts(): Promise<EditorProduct[]> {
  const items = await listCatalogForPricing();
  const [lots, offers] = await Promise.all([getLotsByCodes(items.flatMap(collectMappedCodes)), getActiveOffers()]);
  return items
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((item) => {
      const card = toCatalogProduct(item, lots, offers.get(item.id));
      const colorAxis = normalizeAxes(item.template?.axes).find((axis) => axis.isColor);
      const imagesByColor: Record<string, string[]> = {};
      for (const [color, images] of Object.entries((item.images_by_color as Record<string, unknown> | null) ?? {})) {
        const list = normalizeImages(images);
        if (list.length) imagesByColor[color] = list;
      }
      return {
        id: item.id,
        name: card.name,
        description: item.template?.description?.trim() ?? '',
        category: card.category,
        templateId: item.template_id,
        published: item.published,
        images: normalizeImages(item.images),
        imagesByColor,
        colors: colorAxis ? includedOptions(item, colorAxis) : [],
        card,
      };
    });
}

// De a pocos: un borrador con el orden nuevo toca todos los productos.
async function updateInBatches(table: 'catalog_items' | 'combos', patches: Map<string, Record<string, unknown>>) {
  const entries = [...patches];
  for (let i = 0; i < entries.length; i += 10) {
    const results = await Promise.all(
      entries.slice(i, i + 10).map(([id, patch]) => db.from(table).update(patch).eq('id', id)),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
}

/**
 * Aplica fotos, «Mostrar en la tienda» y orden. Si algo falla, el borrador
 * queda intacto y volver a publicar termina de aplicarlo.
 */
async function applyProductChanges(changes: StoreDraftProducts) {
  const { data, error } = await db.from('catalog_items').select('id, sort_order');
  if (error) throw error;
  const current = new Map((data ?? []).map((row) => [row.id as string, row.sort_order as number]));

  const patches = new Map<string, Record<string, unknown>>();
  const patch = (id: string) => patches.get(id) ?? patches.set(id, {}).get(id)!;
  for (const [id, change] of Object.entries(changes.items)) {
    if (!current.has(id)) continue;
    if (change.images) patch(id).images = change.images;
    if (change.imagesByColor) patch(id).images_by_color = change.imagesByColor;
    if (change.published !== undefined) patch(id).published = change.published;
  }
  // Los que no están en el orden (creados después) quedan al final, como estaban.
  const order = changes.order?.filter((id) => current.has(id)) ?? [];
  const rest = [...current.keys()].filter((id) => !order.includes(id));
  if (order.length) {
    [...order, ...rest.sort((a, b) => current.get(a)! - current.get(b)!)].forEach((id, index) => {
      if (current.get(id) !== index) patch(id).sort_order = index;
    });
  }
  await updateInBatches('catalog_items', patches);

  const combos = new Map<string, Record<string, unknown>>();
  for (const [id, change] of Object.entries(changes.combos)) {
    const comboPatch: Record<string, unknown> = {};
    if (change.images) comboPatch.images = change.images;
    if (change.published !== undefined) comboPatch.published = change.published;
    if (Object.keys(comboPatch).length) combos.set(id, comboPatch);
  }
  await updateInBatches('combos', combos);
}

/**
 * Publica todo el borrador junto, guarda la versión y deja el borrador vacío.
 * El bloqueo sigue hasta salir.
 */
export async function publishDraft(user: AuthUser, input: StorePublishInput): Promise<LandingConfig> {
  const row = await readRow();
  if (row?.lock_session !== input.session) throw await lockLost(user);

  const before = await snapshotLive();
  await applyProductChanges(input.products);
  const landing = await saveLandingConfig(input.landing);
  await recordVersion(before, await snapshotLive(), user.uid);
  await saveDraft(user, { session: input.session, landing: null, products: EMPTY_PRODUCTS });
  void cleanupLandingMedia(before.landing, landing).catch(() => {});
  return landing;
}

const nicaraguaDate = (iso: string) =>
  new Date(iso).toLocaleString('es-NI', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Managua',
  });

/**
 * Pone una versión en la tienda (portada y presentación de productos; precio,
 * stock y plantillas no) y deja lo que estaba publicado como borrador.
 */
export async function restoreVersion(
  user: AuthUser,
  versionId: string,
  input: { session: string; discardDraft: boolean },
): Promise<EditorEntry> {
  const row = await readRow();
  if (row?.lock_session !== input.session) throw await lockLost(user);
  if (!input.discardDraft && (await toDraft(row))) {
    throw Object.assign(new Error('Tenés cambios sin publicar: descartalos para restaurar.'), { status: 400 });
  }

  const { snapshot: target, publishedAt } = await getVersionSnapshot(versionId);
  const before = await snapshotLive();
  await applyProductChanges(diffProducts(before.products, target.products));
  const landing = await saveLandingConfig(target.landing);

  // Lo que estaba publicado queda como borrador, para corregirlo o volver.
  const back = diffProducts(target.products, before.products);
  await saveDraft(user, {
    session: input.session,
    landing: JSON.stringify(before.landing) === JSON.stringify(landing) ? null : before.landing,
    products: back,
  });
  await recordVersion(before, await snapshotLive(), user.uid, [`Restauró la versión del ${nicaraguaDate(publishedAt)}`]);
  void cleanupLandingMedia(before.landing, landing).catch(() => {});

  const updated = await readRow();
  return { draft: updated ? await toDraft(updated) : null, published: landing };
}
