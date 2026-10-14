import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  RedoIcon,
  UndoIcon,
  ViewIcon,
  WorkHistoryIcon,
} from '@hugeicons/core-free-icons';
import {
  categoryMode,
  landingConfigSchema,
  MAX_HERO_SLIDES,
  type CategoryMode,
  type EditorEntry,
  type HeroSlide,
  type LandingConfig,
  type StoreVersion,
} from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { serverErrorMessage } from '~/components/ui/form-feedback';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { toggleEditMode } from '~/state/slices/auth-slice';
import {
  clearBuilderSession,
  endBuilderChange,
  initBuilderSession,
  redoBuilderChange,
  selectCanRedoBuilder,
  selectCanUndoBuilder,
  initDraftProducts,
  selectDraftLandingConfig,
  selectDraftProducts,
  setCategoryMode,
  setDraftProductOrder,
  undoBuilderChange,
  updateDraftCombo,
  updateDraftProduct,
  updateHeroSlide,
  updateHeroSlides,
} from '~/state/slices/builder-slice';
import { useStoreCatalog, useStoreConfig } from '~/hooks/use-store-config';
import {
  isEditorLockLost,
  useDiscardStoreDraftMutation,
  useGetEditorProductsQuery,
  usePublishStoreDraftMutation,
  useRestoreStoreVersionMutation,
  useSaveStoreDraftMutation,
} from '~/state/api/store-editor-api';
import { useGetAdminCombosQuery } from '~/state/api/catalog-admin-api';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { InlineRailsEditor } from './inline-rails-editor';
import { HomeEditorPanel } from './home-editor-panel';
import { StoreChangeReview } from './store-change-review';
import { FormDialogContent, FormPanel, FormBody, FormActions } from '~/components/ui/form-layout';
import { FormErrorBanner } from '~/components/ui/form-feedback';
import {
  CART_EDITOR_SECTIONS,
  CartContentEditor,
  type CartEditorSection,
} from '~/components/editor/cart-content-editor';
import { hasLandingErrors, validateLanding, type LandingErrors } from '~/lib/landing-validation';
import {
  applyDraftCombos,
  applyDraftProducts,
  cardImages,
  EMPTY_DRAFT_PRODUCTS,
  hasDraftProductChanges,
  normalizeDraftProducts,
  previewCatalog,
} from '~/lib/store-draft-products';
import { errMsg, formatNicaraguaDateTime, getProductUrl } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import { ProductsPanel } from './products-panel';
import { EditorCombosPanel } from './editor-combos-panel';
import { VersionsDialog } from './versions-dialog';
import type { PendingDraftRef } from './store-editor-gate';

const SECTIONS = ['navigation', 'banners', 'products', 'items', 'combos', 'cart'] as const;
type SectionId = (typeof SECTIONS)[number];
const TASKS = [
  { id: 'home', label: 'Portada' },
  { id: 'items', label: 'Productos' },
  { id: 'combos', label: 'Combos' },
  { id: 'cart', label: 'Carrito' },
] as const;
type TaskId = (typeof TASKS)[number]['id'];
const VIEWPORTS = [
  { id: 'm360', width: 360, label: 'Móvil' },
  { id: 'd1280', width: 1280, label: 'Escritorio' },
  { id: 'd1440', width: 1440, label: 'Escritorio amplio' },
] as const;
type ViewportId = (typeof VIEWPORTS)[number]['id'];
const MODE_LABEL: Record<CategoryMode, string> = {
  auto: 'Automático',
  custom: 'Elegidas',
  hidden: 'Ocultar',
};
const selectionClass = 'border-2 border-primary-2 font-semibold';
const SAVE_DELAY_MS = 800;
const SAVE_RETRY_MS = 10_000;
const signature = (config: LandingConfig | null | undefined) =>
  config ? JSON.stringify(config) : '';

export function LandingEditor({
  session,
  entry,
  pendingDraft,
  onLockLost,
}: {
  session: string;
  /** Borrador del servidor y portada publicada, al entrar. */
  entry: EditorEntry;
  pendingDraft: PendingDraftRef;
  onLockLost: (message: string) => void;
}) {
  const dispatch = useAppDispatch();
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const draft = useAppSelector(selectDraftLandingConfig);
  const draftProducts = useAppSelector(selectDraftProducts);
  const {
    data: editorProducts,
    isLoading: productsLoading,
    isError: productsFailed,
    refetch: refetchProducts,
  } = useGetEditorProductsQuery();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const {
    data: editorCombos,
    isLoading: combosLoading,
    isError: combosFailed,
    refetch: refetchCombos,
  } = useGetAdminCombosQuery();
  const [selectedComboId, setSelectedComboId] = useState<string | null>(null);
  const canUndo = useAppSelector(selectCanUndoBuilder);
  const canRedo = useAppSelector(selectCanRedoBuilder);
  const [publish, { isLoading: publishing }] = usePublishStoreDraftMutation();
  const [saveDraft] = useSaveStoreDraftMutation();
  const [discardDraft, { isLoading: discarding }] = useDiscardStoreDraftMutation();
  const [restoreVersion, { isLoading: restoring }] = useRestoreStoreVersionMutation();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveRetry, setSaveRetry] = useState(0);
  const [section, setSection] = useState<SectionId>('banners');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [homeOverview, setHomeOverview] = useState(true);
  const [viewport, setViewport] = useState<ViewportId>('d1280');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishFailure, setPublishFailure] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cartSection, setCartSection] = useState<CartEditorSection | null>(null);
  const [publishErrors, setPublishErrors] = useState<LandingErrors | null>(null);
  const original = useRef(signature(entry.published));
  const savedKey = useRef(
    JSON.stringify({
      landing: entry.draft?.landing ?? null,
      products: entry.draft?.products ?? EMPTY_DRAFT_PRODUCTS,
    }),
  );
  const saveQueue = useRef(Promise.resolve());
  const frame = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const serialized = signature(draft);
  const landingDirty = draft !== null && serialized !== original.current;
  // Hasta que llegan los productos se guarda el borrador tal cual vino.
  const productChanges = useMemo(
    () =>
      editorProducts
        ? normalizeDraftProducts(draftProducts, editorProducts, editorCombos)
        : draftProducts,
    [draftProducts, editorProducts, editorCombos],
  );
  const shownCombos = useMemo(
    () => (editorCombos ? applyDraftCombos(editorCombos, draftProducts) : []),
    [draftProducts, editorCombos],
  );
  const shownProducts = useMemo(
    () => (editorProducts ? applyDraftProducts(editorProducts, draftProducts) : []),
    [draftProducts, editorProducts],
  );
  const previewProducts = useMemo(
    () => (editorProducts ? previewCatalog(shownProducts) : undefined),
    [editorProducts, shownProducts],
  );
  const dirty = landingDirty || hasDraftProductChanges(productChanges);
  const busy = publishing || uploading || discarding || restoring;
  const slide = draft?.heroSlides.find((item) => item.id === selectedId) ?? draft?.heroSlides[0];
  const task: TaskId =
    section === 'items' || section === 'combos' || section === 'cart' ? section : 'home';
  const homeSection = section === 'navigation' || section === 'products' ? section : 'banners';
  const publishedLanding = original.current
    ? (JSON.parse(original.current) as LandingConfig)
    : null;
  const validationContext = useMemo(
    () => ({
      productUrls: products.map((p) => getProductUrl(p.id, p.name)),
      socialCount: [
        config?.socialLinks?.facebook,
        config?.socialLinks?.instagram,
        config?.socialLinks?.tiktok,
      ].filter((v) => v?.trim()).length,
    }),
    [products, config?.socialLinks],
  );

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.dataset.area;
    html.dataset.area = 'admin';
    setPreviewTheme(html.dataset.theme === 'dark' ? 'dark' : 'light');
    return () => {
      if (previous) html.dataset.area = previous;
      else delete html.dataset.area;
    };
  }, []);
  useEffect(() => {
    dispatch(initBuilderSession(entry.draft?.landing ?? entry.published));
    dispatch(initDraftProducts(entry.draft?.products ?? EMPTY_DRAFT_PRODUCTS));
    if (entry.draft)
      toast.info('Hay un borrador sin publicar', {
        description: `Último cambio${
          entry.draft.changedBy ? ` de ${entry.draft.changedBy}` : ''
        }: ${formatNicaraguaDateTime(entry.draft.changedAt)}.`,
      });
    // Solo al entrar: después manda el borrador del editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cada cambio va al borrador del servidor; lo que quede pendiente al cerrar
  // la pestaña sale con la liberación del bloqueo (store-editor-gate).
  useEffect(() => {
    if (!draft) return;
    const payload = { landing: landingDirty ? draft : null, products: productChanges };
    const key = JSON.stringify(payload);
    if (key === savedKey.current) {
      pendingDraft.current = null;
      return;
    }
    pendingDraft.current = payload;
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        // Publicar o descartar ya lo resolvió.
        if (pendingDraft.current !== payload) return;
        setSaveState('saving');
        try {
          await saveDraft({ session, ...payload }).unwrap();
          savedKey.current = key;
          if (pendingDraft.current === payload) pendingDraft.current = null;
          setSaveState('saved');
        } catch (error) {
          if (isEditorLockLost(error)) {
            onLockLost(serverErrorMessage(error, 'El editor se cerró. Tu borrador está guardado.'));
            return;
          }
          setSaveState('error');
          setTimeout(() => setSaveRetry((n) => n + 1), SAVE_RETRY_MS);
        }
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    draft,
    landingDirty,
    productChanges,
    saveRetry,
    session,
    saveDraft,
    pendingDraft,
    onLockLost,
  ]);
  // Plantillas y combos se corrigen en Inventario (otra pestaña).
  useEffect(() => {
    const refresh = () => {
      void refetchProducts();
      void refetchCombos();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refetchProducts, refetchCombos]);

  const syncPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      {
        type: 'gyro:landing-preview',
        config: draft,
        slideId: preview || homeOverview ? null : slide?.id,
        interactive: preview,
        theme: previewTheme,
        section,
        part: 'banner',
        products: previewProducts,
      },
      window.location.origin,
    );
  }, [draft, slide?.id, preview, previewTheme, section, homeOverview, previewProducts]);
  useEffect(() => {
    syncPreview();
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (event.data?.type === 'gyro:preview-ready') syncPreview();
      if (event.data?.type === 'gyro:preview-link')
        toast.info('Las compras y los enlaces externos no se ejecutan en la vista previa.', {
          id: 'preview-link',
        });
      if (event.data?.type !== 'gyro:select-section' || busy || preview) return;
      if (!SECTIONS.includes(event.data.section)) return;
      dispatch(endBuilderChange());
      setSection(event.data.section);
      setHomeOverview(false);
      if (draft?.heroSlides.some((item) => item.id === event.data.slideId))
        setSelectedId(event.data.slideId);
      if (event.data.section === 'items')
        setSelectedProductId(
          typeof event.data.productId === 'string' ? event.data.productId : null,
        );
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [syncPreview, busy, preview, dispatch, draft]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const logical = VIEWPORTS.find((v) => v.id === viewport)!;
  const scale =
    canvasSize.width > 0 ? Math.min(1, Math.max(1, canvasSize.width - 40) / logical.width) : 1;
  const frameHeight = canvasSize.height > 0 ? Math.max(1, canvasSize.height - 40) / scale : 800;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pendingDraft.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingDraft]);
  function exit() {
    dispatch(clearBuilderSession());
    dispatch(toggleEditMode());
  }
  async function exitDiscarding() {
    pendingDraft.current = null;
    try {
      await saveQueue.current;
      await discardDraft(session).unwrap();
      exit();
    } catch (error) {
      if (isEditorLockLost(error)) onLockLost(serverErrorMessage(error, 'El editor se cerró.'));
      else toast.error(serverErrorMessage(error, 'No se pudo descartar el borrador.'));
    }
  }
  async function restore(version: StoreVersion) {
    pendingDraft.current = null;
    try {
      await saveQueue.current;
      const result = await restoreVersion({ id: version.id, session, discardDraft: true }).unwrap();
      original.current = signature(result.published);
      const products = result.draft?.products ?? EMPTY_DRAFT_PRODUCTS;
      savedKey.current = JSON.stringify({ landing: result.draft?.landing ?? null, products });
      dispatch(initBuilderSession(result.draft?.landing ?? result.published));
      dispatch(initDraftProducts(products));
      void refetchProducts();
      void refetchCombos();
      setPublishErrors(null);
      setVersionsOpen(false);
      toast.success('Versión restaurada', {
        description: 'La tienda ya la muestra. Lo que estaba publicado quedó como borrador.',
      });
    } catch (error) {
      if (isEditorLockLost(error)) {
        setVersionsOpen(false);
        onLockLost(serverErrorMessage(error, 'El editor se cerró. Tu borrador está guardado.'));
      } else toast.error(serverErrorMessage(error, 'No se pudo restaurar la versión.'));
    }
  }
  function selectSection(next: SectionId, id?: string) {
    dispatch(endBuilderChange());
    setSection(next);
    setHomeOverview(false);
    setPreview(false);
    if (id) setSelectedId(id);
  }
  function openTask(next: TaskId) {
    dispatch(endBuilderChange());
    setPreview(false);
    if (next === 'home') {
      setSection('banners');
      setHomeOverview(true);
    } else setSection(next);
  }
  function editBanner(next: HeroSlide) {
    const key = Object.keys(next).find(
      (key) => next[key as keyof HeroSlide] !== slide?.[key as keyof HeroSlide],
    );
    dispatch(updateHeroSlide({ slide: next, key: `${next.id}:${key}` }));
    setPublishErrors(null);
  }
  function addSlide() {
    if (!draft || draft.heroSlides.length >= MAX_HERO_SLIDES) return;
    const next: HeroSlide = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      eyebrow: '',
      mediaUrl: '',
      mediaType: 'image',
      buttonText: 'Ver catálogo',
      actionType: 'link',
      actionTarget: '/#catalogo',
    };
    dispatch(updateHeroSlides([...draft.heroSlides, next]));
    selectSection('banners', next.id);
  }
  function moveSlide(direction: -1 | 1) {
    if (!draft || !slide) return;
    const index = draft.heroSlides.findIndex((item) => item.id === slide.id);
    const target = index + direction;
    if (!draft.heroSlides[target] || slide.locked || draft.heroSlides[target].locked) return;
    const next = [...draft.heroSlides];
    [next[index], next[target]] = [next[target], next[index]];
    dispatch(updateHeroSlides(next));
  }
  function preparePublish() {
    const parsed = landingConfigSchema.safeParse(draft);
    const errors = parsed.success
      ? validateLanding(parsed.data, validationContext)
      : { slides: {} };
    if (!parsed.success || hasLandingErrors(errors)) {
      setPublishErrors(errors);
      const firstSlide = Object.keys(errors.slides)[0];
      if (firstSlide) selectSection('banners', firstSlide);
      else if (errors.headerCategories) selectSection('navigation');
      else if (errors.homeCategories) selectSection('products');
      toast.error('Revisá los campos marcados antes de publicar.');
      return;
    }
    setPublishFailure(null);
    setPublishErrors(null);
    setPublishOpen(true);
  }
  async function save() {
    const parsed = landingConfigSchema.safeParse(draft);
    if (!parsed.success || hasLandingErrors(validateLanding(parsed.data, validationContext))) {
      setPublishOpen(false);
      preparePublish();
      return;
    }
    try {
      await saveQueue.current;
      await publish({ session, landing: parsed.data, products: productChanges }).unwrap();
      original.current = signature(parsed.data);
      savedKey.current = JSON.stringify({ landing: null, products: EMPTY_DRAFT_PRODUCTS });
      pendingDraft.current = null;
      setPublishOpen(false);
      exit();
      toast.success('Tienda publicada. Ya se muestran los cambios.');
    } catch (error) {
      if (isEditorLockLost(error)) {
        setPublishOpen(false);
        onLockLost(serverErrorMessage(error, 'El editor se cerró. Tu borrador está guardado.'));
        return;
      }
      setPublishFailure(errMsg(error, 'No se pudo publicar. Tu borrador sigue guardado.'));
    }
  }
  const headerMode = categoryMode(draft?.headerCategoriesMode, draft?.headerCategories);
  const homeMode = categoryMode(draft?.homeCategoriesMode, draft?.homeCategories);
  const themeLabel = previewTheme === 'light' ? 'Claro' : 'Oscuro';
  const pending = (items: { published: boolean; noPhotos: boolean }[]) => {
    const hidden = items.filter((item) => !item.published).length;
    const noPhotos = items.filter((item) => item.noPhotos).length;
    const parts = [hidden && `${hidden} ${hidden === 1 ? 'oculto' : 'ocultos'}`, noPhotos && `${noPhotos} sin fotos`];
    return parts.filter(Boolean).join(' · ') || 'Todo listo';
  };
  const bannerCount = draft?.heroSlides.length ?? 0;
  const taskStatus: Record<TaskId, { text: string; alert?: boolean }> = {
    home:
      publishErrors && hasLandingErrors(publishErrors)
        ? { text: 'Revisar campos', alert: true }
        : { text: `${bannerCount} ${bannerCount === 1 ? 'banner' : 'banners'}` },
    items: productsLoading
      ? { text: 'Cargando…' }
      : {
          text: pending(
            shownProducts.map((p) => ({
              published: p.published,
              noPhotos: !cardImages(p.images, p.imagesByColor).length,
            })),
          ),
        },
    combos: combosLoading
      ? { text: 'Cargando…' }
      : { text: pending(shownCombos.map((c) => ({ published: c.published, noPhotos: !c.images.length }))) },
    cart: {
      text: Object.values(draft?.cart ?? {}).some(Boolean) ? 'Personalizado' : 'Textos de siempre',
    },
  };
  const status = publishing
    ? 'Publicando…'
    : uploading
    ? 'Subiendo archivo…'
    : saveState === 'saving'
    ? 'Guardando borrador…'
    : saveState === 'error'
    ? 'No se pudo guardar el borrador'
    : savedKey.current !==
      JSON.stringify({ landing: landingDirty ? draft : null, products: productChanges })
    ? 'Guardando borrador…'
    : dirty
    ? 'Borrador guardado · Cambios sin publicar'
    : 'Sin cambios pendientes';

  return (
    <div
      data-skin="admin"
      data-area="admin"
      onBlurCapture={() => dispatch(endBuilderChange())}
      className="landing-studio fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <header className="shrink-0 space-y-4 border-b bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="cancel"
              size="icon"
              aria-label="Salir del editor"
              title="Salir del editor"
              disabled={busy}
              onClick={() => (dirty ? setExitOpen(true) : exit())}
            >
              <HugeIcon icon={ArrowLeft01Icon} size={16} aria-hidden />
            </Button>
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight">Editor de tienda</h1>
              <p role="status" className="mt-1 flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    saveState === 'error'
                      ? 'bg-destructive'
                      : busy || saveState === 'saving'
                      ? 'bg-info'
                      : dirty
                      ? 'bg-warning'
                      : 'bg-success',
                  )}
                />
                {status}
              </p>
            </div>
            {saveState === 'error' && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setSaveRetry((value) => value + 1)}
              >
                Reintentar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Deshacer"
              title="Deshacer"
              disabled={busy || !canUndo}
              onClick={() => dispatch(undoBuilderChange())}
            >
              <HugeIcon icon={UndoIcon} size={16} aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Rehacer"
              title="Rehacer"
              disabled={busy || !canRedo}
              onClick={() => dispatch(redoBuilderChange())}
            >
              <HugeIcon icon={RedoIcon} size={16} aria-hidden />
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setVersionsOpen(true)}>
              <HugeIcon icon={WorkHistoryIcon} size={16} aria-hidden /> Versiones
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setPreview(!preview)}>
              <HugeIcon icon={ViewIcon} size={16} aria-hidden />
              {preview ? 'Volver a editar' : 'Vista previa'}
            </Button>
            <Button disabled={busy || !dirty || !draft} onClick={preparePublish}>
              {publishing ? 'Publicando…' : 'Revisar cambios'}
            </Button>
          </div>
        </div>
        <nav aria-label="Qué querés editar" className="flex flex-wrap items-center gap-2">
          {TASKS.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={task === item.id}
              className={cn(
                'h-auto min-h-11 min-w-36 flex-col items-start gap-0.5 py-2 text-left',
                task === item.id && selectionClass,
              )}
              disabled={busy}
              onClick={() => openTask(item.id)}
            >
              {item.label}
              <span
                className={cn(
                  'text-xs font-normal',
                  taskStatus[item.id].alert ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {taskStatus[item.id].text}
              </span>
            </Button>
          ))}
        </nav>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {!preview && task === 'home' && (
          <HomeEditorPanel
            draft={draft}
            slide={slide}
            section={homeSection}
            overview={homeOverview}
            disabled={busy}
            errors={publishErrors}
            canAdd={Boolean(draft && draft.heroSlides.length < MAX_HERO_SLIDES)}
            onSelect={selectSection}
            onBack={() => {
              dispatch(endBuilderChange());
              setHomeOverview(true);
            }}
            onAdd={addSlide}
            onMove={moveSlide}
            onRemove={() => slide && setDeleteId(slide.id)}
            onChange={editBanner}
            onBusy={setUploading}
          >
            {section === 'navigation' && (
              <>
                <CategoryModeField
                  label="Categorías del encabezado"
                  mode={headerMode}
                  onChange={(mode) => dispatch(setCategoryMode({ zone: 'header', mode }))}
                  descriptions={{
                    auto: 'Todas las categorías con productos, en su orden.',
                    custom: 'Solo las que elijas, en el orden que definas.',
                    hidden: 'El encabezado no muestra categorías.',
                  }}
                  error={publishErrors?.headerCategories}
                />
                {headerMode === 'custom' && (
                  <InlineCategoryNavEditor
                    allCategories={config?.categories ?? []}
                    disabled={busy}
                  />
                )}
              </>
            )}
            {section === 'products' && (
              <>
                <CategoryModeField
                  label="Secciones del inicio"
                  mode={homeMode}
                  onChange={(mode) => dispatch(setCategoryMode({ zone: 'home', mode }))}
                  descriptions={{
                    auto: 'Una sección por categoría con productos.',
                    custom: 'Solo las secciones que elijas, en ese orden.',
                    hidden: 'Se muestra el catálogo completo en una grilla.',
                  }}
                  error={publishErrors?.homeCategories}
                />
                {homeMode === 'custom' && (
                  <InlineRailsEditor allCategories={config?.categories ?? []} disabled={busy} />
                )}
              </>
            )}
          </HomeEditorPanel>
        )}

        <main
          aria-label="Vista previa de la tienda"
          className={cn(
            'studio-canvas min-h-0 min-w-0 flex-1 flex-col',
            preview || task === 'home' ? 'flex' : 'hidden',
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-3">
            <p className="text-sm text-muted-foreground">
              {preview
                ? 'Así quedará la tienda al publicar.'
                : 'Tocá un banner o un producto para editarlo.'}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  aria-label={`Tamaño y tema de la vista previa: ${logical.label}, ${themeLabel.toLowerCase()}`}
                >
                  {logical.label} · {themeLabel}
                  <HugeIcon icon={ArrowDown01Icon} size={16} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Tamaño</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={viewport}
                  onValueChange={(value) => setViewport(value as ViewportId)}
                >
                  {VIEWPORTS.map((item) => (
                    <DropdownMenuRadioItem key={item.id} value={item.id}>
                      {item.label} · {item.width} px
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Tema</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={previewTheme}
                  onValueChange={(value) => setPreviewTheme(value === 'dark' ? 'dark' : 'light')}
                >
                  <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Oscuro</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="absolute left-1/2 top-5 overflow-hidden rounded-2xl border bg-background"
              style={{
                width: logical.width * scale,
                height: Math.max(0, canvasSize.height - 40),
                transform: 'translateX(-50%)',
              }}
            >
              <iframe
                ref={frame}
                onLoad={syncPreview}
                title="Vista previa de la tienda"
                src="/?landing-preview=1"
                style={{
                  width: logical.width,
                  height: frameHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
                className="bg-background"
              />
            </div>
          </div>
        </main>

        <section
          aria-label="Preparar productos"
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto p-5',
            (preview || task !== 'items') && 'hidden',
          )}
        >
          <div className="mx-auto max-w-7xl space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Productos de la tienda</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Prepará las fotos, elegí qué mostrar y organizá el orden.
              </p>
            </div>
            <ProductsPanel
              products={shownProducts}
              loading={productsLoading}
              failed={productsFailed}
              onRetry={() => void refetchProducts()}
              selectedId={selectedProductId}
              onSelect={setSelectedProductId}
              onChange={(id, change) => dispatch(updateDraftProduct({ id, change }))}
              onReorder={(ids) => dispatch(setDraftProductOrder(ids))}
              onBusy={setUploading}
              disabled={busy}
              currency={config?.currency}
              changedIds={Object.keys(productChanges.items)}
              groupByCategory={homeMode !== 'hidden'}
            />
          </div>
        </section>
        <section
          aria-label="Preparar combos"
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto p-5',
            (preview || task !== 'combos') && 'hidden',
          )}
        >
          <div className="mx-auto max-w-7xl space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Combos de la tienda</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Prepará las fotos y elegí cuáles mostrar.
              </p>
            </div>
            <EditorCombosPanel
              combos={shownCombos}
              loading={combosLoading}
              failed={combosFailed}
              onRetry={() => void refetchCombos()}
              selectedId={selectedComboId}
              onSelect={setSelectedComboId}
              onChange={(id, change) => dispatch(updateDraftCombo({ id, change }))}
              onBusy={setUploading}
              disabled={busy}
              currency={config?.currency}
              changedIds={Object.keys(productChanges.combos)}
            />
          </div>
        </section>
        {!preview && task === 'cart' && (
          <section
            aria-label="Editar carrito"
            className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5"
          >
            <div className="mx-auto max-w-5xl space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Carrito y pedido recibido</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Elegí la pantalla que querés personalizar.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {(Object.keys(CART_EDITOR_SECTIONS) as CartEditorSection[]).map((key, index) => (
                  <Button
                    key={key}
                    variant="outline"
                    disabled={busy}
                    onClick={() => setCartSection(key)}
                    className="h-auto min-h-40 flex-col items-start gap-3 whitespace-normal p-5 text-left"
                  >
                    <span className="text-xs text-muted-foreground">Pantalla {index + 1}</span>
                    <span className="text-lg font-semibold">{CART_EDITOR_SECTIONS[key].label}</span>
                    <span className="text-sm text-muted-foreground">
                      {CART_EDITOR_SECTIONS[key].hint}
                    </span>
                    <span className="font-semibold text-primary-2">Editar pantalla</span>
                  </Button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!publishing) setPublishOpen(open);
        }}
      >
        <FormDialogContent size="long" showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle>Revisar cambios de la tienda</DialogTitle>
            <DialogDescription>
              Este borrador reemplazará lo publicado cuando confirmés. Revisá cada sección antes de
              continuar.
            </DialogDescription>
          </DialogHeader>
          <FormPanel>
            <FormErrorBanner message={publishFailure} />
            <FormBody>
              <StoreChangeReview
                draft={draft}
                published={publishedLanding}
                changes={productChanges}
                products={editorProducts ?? []}
                combos={editorCombos}
                onEdit={(next, id) => {
                  setPublishOpen(false);
                  selectSection(next, next === 'banners' ? id : undefined);
                  if (next === 'items') setSelectedProductId(id ?? null);
                  if (next === 'combos') setSelectedComboId(id ?? null);
                }}
              />
            </FormBody>
            <FormActions>
              <Button variant="cancel" disabled={publishing} onClick={() => setPublishOpen(false)}>
                Seguir editando
              </Button>
              <Button disabled={publishing} onClick={() => void save()}>
                {publishing ? 'Publicando…' : 'Publicar cambios'}
              </Button>
            </FormActions>
          </FormPanel>
        </FormDialogContent>
      </Dialog>
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir del editor?</DialogTitle>
            <DialogDescription>
              El borrador queda guardado y cualquier administrador puede seguirlo. También podés
              descartarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button disabled={discarding} onClick={exit}>
              Salir y dejar el borrador
            </Button>
            <Button variant="cancel" disabled={discarding} onClick={() => setExitOpen(false)}>
              Seguir editando
            </Button>
            <Button
              variant="destructive"
              disabled={discarding}
              onClick={() => void exitDiscarding()}
            >
              {discarding ? 'Descartando…' : 'Descartar borrador y salir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Quitar banner"
        description="Se quita del borrador. Podés deshacerlo antes de publicar."
        confirmText="Quitar del borrador"
        onConfirm={() => {
          if (draft)
            dispatch(updateHeroSlides(draft.heroSlides.filter((item) => item.id !== deleteId)));
          setSelectedId(null);
        }}
      />
      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        dirty={dirty}
        restoring={restoring}
        onRestore={(version) => void restore(version)}
      />
      <CartContentEditor section={cartSection} onClose={() => setCartSection(null)} />
    </div>
  );
}

function CategoryModeField({
  label,
  mode,
  onChange,
  descriptions,
  error,
}: {
  label: string;
  mode: CategoryMode;
  onChange: (mode: CategoryMode) => void;
  descriptions: Record<CategoryMode, string>;
  error?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {(['auto', 'custom', 'hidden'] as const).map((item) => (
          <Button
            key={item}
            variant="outline"
            aria-pressed={mode === item}
            onClick={() => onChange(item)}
            className={cn('text-xs', mode === item && selectionClass)}
          >
            {MODE_LABEL[item]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{descriptions[mode]}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
