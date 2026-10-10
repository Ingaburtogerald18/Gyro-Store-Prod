import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@remix-run/react';
import { toast } from 'sonner';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ComputerIcon,
  Image01Icon,
  RedoIcon,
  SidebarLeftIcon,
  SmartPhone01Icon,
  UndoIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import {
  categoryMode,
  landingConfigSchema,
  MAX_HERO_SLIDES,
  type CategoryMode,
  type HeroSlide,
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
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectUser, toggleEditMode } from '~/store/slices/authSlice';
import {
  clearBuilderSession,
  endBuilderChange,
  initBuilderSession,
  redoBuilderChange,
  selectCanRedoBuilder,
  selectCanUndoBuilder,
  selectDraftLandingConfig,
  setCategoryMode,
  undoBuilderChange,
  updateHeroSlide,
  updateHeroSlides,
} from '~/store/slices/builderSlice';
import { useStoreCatalog, useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import {
  useGetLandingConfigQuery,
  useUpdateLandingConfigMutation,
} from '~/store/api/storefrontApi';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { InlineRailsEditor } from './inline-rails-editor';
import { BANNER_PARTS, BannerEditor, type BannerPart } from './banner-editor';
import {
  CART_EDITOR_SECTIONS,
  CartContentEditor,
  type CartEditorSection,
} from '~/components/cart/cart-content-editor';
import {
  clearLandingDraft,
  loadLandingDraft,
  saveLandingDraft,
  signature,
  type StoredLandingDraft,
} from '~/lib/landingDraft';
import { hasLandingErrors, validateLanding, type LandingErrors } from '~/lib/landingValidation';
import { errMsg, formatLongDate, getProductUrl } from '~/lib/formatters';
import { cn } from '~/lib/utils';

const SECTIONS = [
  { id: 'navigation', label: 'Encabezado', hint: 'Categorías de la navegación' },
  { id: 'banners', label: 'Banners', hint: 'Contenido y composición' },
  { id: 'products', label: 'Secciones del catálogo', hint: 'Categorías y orden de productos' },
  { id: 'cart', label: 'Carrito', hint: 'Textos e imágenes de compra' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const VIEWPORTS = [
  { id: 'm360', width: 360, label: 'Móvil', icon: SmartPhone01Icon },
  { id: 'd1280', width: 1280, label: 'Escritorio', icon: ComputerIcon },
  { id: 'd1440', width: 1440, label: 'Escritorio amplio', icon: ComputerIcon },
] as const;
type ViewportId = (typeof VIEWPORTS)[number]['id'];
const MODE_LABEL: Record<CategoryMode, string> = {
  auto: 'Automático',
  custom: 'Elegidas',
  hidden: 'Ocultar',
};
const selectionClass = 'border-2 border-primary-2 font-semibold';

export function LandingEditor() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const fallbackLanding = useStoreLanding();
  const { data: publishedLanding } = useGetLandingConfigQuery();
  const landing = publishedLanding ?? fallbackLanding;
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const draft = useAppSelector(selectDraftLandingConfig);
  const canUndo = useAppSelector(selectCanUndoBuilder);
  const canRedo = useAppSelector(selectCanRedoBuilder);
  const [publish, { isLoading: publishing }] = useUpdateLandingConfigMutation();
  const [section, setSection] = useState<SectionId>('banners');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [part, setPart] = useState<BannerPart>('banner');
  const [group, setGroup] = useState<'content' | 'design'>('content');
  const [viewport, setViewport] = useState<ViewportId>('d1280');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState(false);
  const [structureOpen, setStructureOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<'structure' | 'inspector' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishFailure, setPublishFailure] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cartSection, setCartSection] = useState<CartEditorSection | null>(null);
  const [cartDirty, setCartDirty] = useState(false);
  const [recovery, setRecovery] = useState<StoredLandingDraft | null>(null);
  const [publishErrors, setPublishErrors] = useState<LandingErrors | null>(null);
  const original = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const userId = user?.id ?? '';
  const serialized = signature(draft);
  const dirty = original.current !== null && serialized !== original.current;
  const busy = publishing || uploading;
  const slide = draft?.heroSlides.find((item) => item.id === selectedId) ?? draft?.heroSlides[0];
  const sectionInfo = SECTIONS.find((item) => item.id === section)!;
  const partLabel =
    part === 'banner'
      ? 'Banner'
      : (BANNER_PARTS.find((item) => item.id === part)?.label ?? 'Banner');
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
    if (!draft && landing) dispatch(initBuilderSession(landing));
    if (original.current === null && landing) original.current = signature(landing);
  }, [draft, landing, dispatch]);
  useEffect(() => {
    if (!landing || !userId) return;
    const stored = loadLandingDraft(userId, host);
    if (stored && signature(stored.draft) !== signature(landing)) setRecovery(stored);
    // Se ofrece recuperación solo al abrir la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(landing), userId]);
  useEffect(() => {
    if (!userId || original.current === null || !draft || recovery) return;
    const timer = setTimeout(() => {
      if (dirty) saveLandingDraft({ userId, host, base: original.current ?? '', draft });
      else clearLandingDraft(userId, host);
    }, 500);
    return () => clearTimeout(timer);
  }, [serialized, dirty, draft, userId, host, recovery]);

  const syncPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      {
        type: 'gyro:landing-preview',
        config: draft,
        slideId: preview ? null : slide?.id,
        interactive: preview,
        theme: previewTheme,
        section,
        part,
      },
      window.location.origin,
    );
  }, [draft, slide?.id, preview, previewTheme, section, part]);
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
      if (!SECTIONS.some((item) => item.id === event.data.section)) return;
      dispatch(endBuilderChange());
      setSection(event.data.section);
      const nextPart = BANNER_PARTS.some((item) => item.id === event.data.part)
        ? (event.data.part as BannerPart)
        : 'banner';
      setPart(nextPart);
      setGroup('content');
      if (draft?.heroSlides.some((item) => item.id === event.data.slideId))
        setSelectedId(event.data.slideId);
      setMobilePanel('inspector');
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
    if (!dirty && !cartDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, cartDirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || cartDirty) && currentLocation.pathname !== nextLocation.pathname,
  );
  function exit() {
    dispatch(clearBuilderSession());
    dispatch(toggleEditMode());
  }
  function exitKeepingDraft() {
    if (userId && draft && dirty)
      saveLandingDraft({ userId, host, base: original.current ?? '', draft });
    exit();
  }
  function exitDiscarding() {
    if (userId) clearLandingDraft(userId, host);
    exit();
  }
  function selectSection(next: SectionId, id?: string, nextPart: BannerPart = 'banner') {
    dispatch(endBuilderChange());
    setSection(next);
    setPart(nextPart);
    setGroup('content');
    if (id) setSelectedId(id);
    setMobilePanel('inspector');
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
      toast.error('No se publicó: revisá los campos marcados.');
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
      await publish(parsed.data).unwrap();
      original.current = signature(parsed.data);
      if (userId) clearLandingDraft(userId, host);
      setPublishOpen(false);
      exit();
      toast.success('Portada publicada. La tienda ya muestra los cambios.');
    } catch (error) {
      setPublishFailure(errMsg(error, 'No se pudo publicar. Tu borrador sigue guardado.'));
    }
  }
  const headerMode = categoryMode(draft?.headerCategoriesMode, draft?.headerCategories);
  const homeMode = categoryMode(draft?.homeCategoriesMode, draft?.homeCategories);
  const status = publishing
    ? 'Publicando…'
    : uploading
      ? 'Subiendo archivo…'
      : dirty
        ? 'Borrador sin publicar'
        : 'Igual a lo publicado';

  return (
    <div
      data-skin="admin"
      data-area="admin"
      className="landing-studio fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <header className="flex flex-wrap items-center justify-between gap-5 border-b bg-card p-5">
        <div className="flex items-center gap-5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Salir del editor"
            disabled={busy}
            onClick={() => (dirty || cartDirty ? setExitOpen(true) : exit())}
          >
            <HugeIcon icon={ArrowLeft01Icon} size={16} />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Editor de portada</h1>
            <p role="status" className="mt-1 flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'size-2 rounded-full',
                  busy ? 'bg-info' : dirty ? 'bg-warning' : 'bg-success',
                )}
              />
              {status}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Deshacer"
            disabled={busy || !canUndo}
            onClick={() => dispatch(undoBuilderChange())}
          >
            <HugeIcon icon={UndoIcon} size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Rehacer"
            disabled={busy || !canRedo}
            onClick={() => dispatch(redoBuilderChange())}
          >
            <HugeIcon icon={RedoIcon} size={16} />
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPreview(!preview);
              setMobilePanel(null);
            }}
          >
            {!preview && <HugeIcon icon={ViewIcon} size={16} />}
            {preview ? 'Volver a editar' : 'Vista previa'}
          </Button>
          <Button
            disabled={busy || cartDirty || !dirty || !draft || Boolean(recovery)}
            onClick={preparePublish}
          >
            {publishing ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </header>
      {recovery && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b bg-warning/10 px-5 py-3 text-sm"
        >
          <p>
            Tenés un borrador del {formatLongDate(new Date(recovery.savedAt).toISOString())}.
            {landing &&
              recovery.base !== signature(landing) &&
              ' La portada publicada cambió: revisalo antes de publicar.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearLandingDraft(userId, host);
                setRecovery(null);
              }}
            >
              Descartar borrador
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                dispatch(initBuilderSession(recovery.draft));
                setRecovery(null);
                toast.success('Borrador recuperado. Todavía no está publicado.');
              }}
            >
              Recuperar borrador
            </Button>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {!preview && (
          <aside
            aria-label="Estructura de la portada"
            className={cn(
              'min-h-0 w-60 shrink-0 flex-col border-r bg-card',
              structureOpen ? 'xl:flex' : '',
              mobilePanel === 'structure'
                ? 'absolute inset-0 z-20 flex w-full xl:static xl:w-60'
                : 'hidden',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b p-5">
              <h2 className="text-lg font-semibold">Portada</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Plegar estructura"
                onClick={() => {
                  setStructureOpen(false);
                  setMobilePanel(null);
                }}
              >
                <HugeIcon icon={SidebarLeftIcon} size={16} />
              </Button>
            </div>
            <nav
              aria-label="Elementos de la portada"
              className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
            >
              {SECTIONS.map((item) => (
                <div key={item.id} className="space-y-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    aria-pressed={
                      section === item.id && (item.id !== 'banners' || part === 'banner')
                    }
                    className={cn(
                      'w-full justify-start whitespace-normal text-left',
                      section === item.id &&
                        (item.id !== 'banners' || part === 'banner') &&
                        selectionClass,
                    )}
                    onClick={() => selectSection(item.id)}
                  >
                    {item.label}
                  </Button>
                  {item.id === 'banners' && (
                    <>
                      <ul className="space-y-2 border-l pl-3" aria-label="Banners del borrador">
                        {draft?.heroSlides.map((item, index) => (
                          <li key={item.id} className="space-y-2">
                            <Button
                              variant="outline"
                              disabled={busy}
                              aria-pressed={
                                section === 'banners' && slide?.id === item.id && part === 'banner'
                              }
                              onClick={() => selectSection('banners', item.id)}
                              className={cn(
                                'h-auto min-h-11 w-full justify-start whitespace-normal text-left text-xs',
                                section === 'banners' &&
                                  slide?.id === item.id &&
                                  part === 'banner' &&
                                  selectionClass,
                              )}
                            >
                              <HugeIcon icon={Image01Icon} size={16} />
                              <span className="min-w-0">
                                {item.title || `Banner ${index + 1}`}
                                {item.visible === false && (
                                  <span className="block text-xs text-muted-foreground">
                                    Oculto
                                  </span>
                                )}
                                {publishErrors?.slides[item.id] && (
                                  <span className="block text-xs text-destructive">
                                    Revisar campos
                                  </span>
                                )}
                              </span>
                            </Button>
                            {section === 'banners' && slide?.id === item.id && (
                              <ul className="space-y-2 border-l pl-3">
                                {BANNER_PARTS.map((element) => (
                                  <li key={element.id}>
                                    <Button
                                      variant="outline"
                                      disabled={busy}
                                      aria-pressed={part === element.id}
                                      className={cn(
                                        'w-full justify-start text-xs',
                                        part === element.id && selectionClass,
                                      )}
                                      onClick={() => selectSection('banners', item.id, element.id)}
                                    >
                                      {element.label}
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy || !draft || draft.heroSlides.length >= MAX_HERO_SLIDES}
                        onClick={addSlide}
                      >
                        Agregar banner
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </nav>
            <p className="border-t p-5 text-xs text-muted-foreground">
              Seleccioná un elemento en la tienda o en esta lista.
            </p>
          </aside>
        )}

        <main
          aria-label="Vista de la tienda"
          className="studio-canvas flex min-w-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              {!preview && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Mostrar u ocultar estructura"
                  onClick={() => {
                    setStructureOpen(!structureOpen);
                    setMobilePanel(
                      window.matchMedia('(min-width: 1280px)').matches
                        ? null
                        : mobilePanel === 'structure'
                          ? null
                          : 'structure',
                    );
                  }}
                >
                  <HugeIcon icon={SidebarLeftIcon} size={16} />
                </Button>
              )}
              <div
                role="group"
                aria-label="Ancho de la vista previa"
                className="flex flex-wrap gap-2"
              >
                {VIEWPORTS.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    aria-pressed={viewport === item.id}
                    onClick={() => setViewport(item.id)}
                    className={cn('text-xs', viewport === item.id && selectionClass)}
                  >
                    <HugeIcon icon={item.icon} size={16} />
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <div role="group" aria-label="Tema de la vista previa" className="flex gap-2">
              {(['light', 'dark'] as const).map((theme) => (
                <Button
                  key={theme}
                  variant="outline"
                  aria-pressed={previewTheme === theme}
                  onClick={() => setPreviewTheme(theme)}
                  className={cn('text-xs', previewTheme === theme && selectionClass)}
                >
                  {theme === 'light' ? 'Claro' : 'Oscuro'}
                </Button>
              ))}
            </div>
            {!preview && (
              <Button
                variant="outline"
                className="xl:hidden"
                onClick={() => setMobilePanel(mobilePanel === 'inspector' ? null : 'inspector')}
              >
                Ajustes
              </Button>
            )}
          </div>
          <p className="px-5 pt-3 text-xs text-muted-foreground">
            {logical.label} · {logical.width} px{scale < 1 && ` · ${Math.round(scale * 100)}%`}
            {preview && ' · Compras y enlaces externos desactivados'}
          </p>
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
                title="Vista previa de la portada"
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

        {!preview && (
          <aside
            aria-label="Ajustes del elemento seleccionado"
            className={cn(
              'min-h-0 w-80 shrink-0 flex-col border-l bg-card xl:static xl:flex',
              mobilePanel === 'inspector' ? 'absolute inset-0 z-20 flex w-full xl:w-80' : 'hidden',
            )}
          >
            <div className="border-b p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Portada / {sectionInfo.label}</p>
                <Button
                  variant="outline"
                  className="xl:hidden"
                  onClick={() => setMobilePanel(null)}
                >
                  Ver página
                </Button>
              </div>
              <h2 className="mt-2 text-lg font-semibold">
                {section === 'banners' ? partLabel : sectionInfo.label}
              </h2>
              {section === 'banners' && (
                <div role="group" aria-label="Tipo de ajustes" className="mt-5 flex gap-2">
                  {(['content', 'design'] as const).map((item) => (
                    <Button
                      key={item}
                      variant="outline"
                      disabled={busy}
                      aria-pressed={group === item}
                      className={cn('flex-1', group === item && selectionClass)}
                      onClick={() => {
                        dispatch(endBuilderChange());
                        setGroup(item);
                      }}
                    >
                      {item === 'content' ? 'Contenido' : 'Diseño'}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-5"
              onBlurCapture={() => dispatch(endBuilderChange())}
            >
              {section === 'banners' &&
                (slide ? (
                  <div className="space-y-5">
                    <BannerEditor
                      key={slide.id}
                      slide={slide}
                      part={part}
                      group={group}
                      onChange={editBanner}
                      onBusy={setUploading}
                      errors={publishErrors?.slides[slide.id]}
                    />
                    {part === 'banner' && group === 'content' && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => selectSection('banners', slide.id, 'image')}
                      >
                        <HugeIcon icon={Image01Icon} size={16} />
                        Cambiar imagen
                      </Button>
                    )}
                    {part === 'banner' && (
                      <div className="space-y-3 border-t pt-5">
                        <p className="text-xs text-muted-foreground">
                          {slide.locked
                            ? 'Banner principal: se puede editar, pero conserva su posición.'
                            : 'Orden del banner'}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Mover banner antes"
                            disabled={
                              busy ||
                              slide.locked ||
                              draft?.heroSlides[0]?.id === slide.id ||
                              draft?.heroSlides[
                                (draft?.heroSlides.findIndex((item) => item.id === slide.id) ?? 0) -
                                  1
                              ]?.locked
                            }
                            onClick={() => moveSlide(-1)}
                          >
                            <HugeIcon icon={ArrowLeft01Icon} size={16} />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Mover banner después"
                            disabled={
                              busy || slide.locked || draft?.heroSlides.at(-1)?.id === slide.id
                            }
                            onClick={() => moveSlide(1)}
                          >
                            <HugeIcon icon={ArrowRight01Icon} size={16} />
                          </Button>
                        </div>
                        {!slide.locked && (
                          <Button
                            variant="outline"
                            className="w-full text-destructive"
                            disabled={busy || (draft?.heroSlides.length ?? 0) <= 1}
                            onClick={() => setDeleteId(slide.id)}
                          >
                            Quitar banner
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <HugeIcon icon={Image01Icon} size={24} />
                    <p className="text-sm">No hay banners en la portada.</p>
                    <Button variant="outline" disabled={busy || !draft} onClick={addSlide}>
                      Agregar banner
                    </Button>
                  </div>
                ))}
              <fieldset disabled={busy} className="min-w-0 space-y-5">
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
                      <InlineCategoryNavEditor allCategories={config?.categories ?? []} />
                    )}
                  </>
                )}
                {section === 'products' && (
                  <>
                    <CategoryModeField
                      label="Secciones de la portada"
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
                      <InlineRailsEditor allCategories={config?.categories ?? []} />
                    )}
                  </>
                )}
                {section === 'cart' && (
                  <div className="space-y-3">
                    {(Object.keys(CART_EDITOR_SECTIONS) as CartEditorSection[]).map((key) => (
                      <Button
                        key={key}
                        variant="outline"
                        className="h-auto min-h-11 w-full flex-col items-start whitespace-normal p-4 text-left"
                        onClick={() => setCartSection(key)}
                      >
                        <span className="text-sm font-semibold">
                          {CART_EDITOR_SECTIONS[key].label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {CART_EDITOR_SECTIONS[key].hint}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>
            <p className="border-t p-5 text-xs text-muted-foreground">
              Los cambios quedan en el borrador de este navegador. La tienda cambia al publicar.
            </p>
          </aside>
        )}
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t bg-card px-5 py-3 text-xs text-muted-foreground">
        <span>
          Portada / {sectionInfo.label}
          {section === 'banners' && ` / ${slide?.title || 'Sin título'}`}
        </span>
        <span>
          {preview ? 'Vista previa' : 'Seleccioná el título, la imagen o el botón para editar.'}
        </span>
      </footer>

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!publishing) setPublishOpen(open);
        }}
      >
        <DialogContent showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle>Publicar portada</DialogTitle>
            <DialogDescription>
              La tienda mostrará este borrador y reemplazará la portada publicada. Revisá los
              cambios antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {draft?.heroSlides.map((item, index) => (
              <li key={item.id}>
                {item.title || `Banner ${index + 1}`} ·{' '}
                {item.visible === false ? 'Oculto' : 'Visible'}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            También se aplicarán los cambios de navegación, catálogo y carrito.
          </p>
          {publishFailure && (
            <p role="alert" className="text-sm text-destructive">
              {publishFailure}
            </p>
          )}
          <DialogFooter>
            <Button variant="cancel" disabled={publishing} onClick={() => setPublishOpen(false)}>
              Seguir editando
            </Button>
            <Button disabled={publishing} onClick={() => void save()}>
              {publishing ? 'Publicando…' : 'Confirmar publicación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir del editor?</DialogTitle>
            <DialogDescription>
              {cartDirty && 'Los cambios sin aplicar del carrito se pierden. '}Podés guardar el
              borrador en este navegador para seguir después, o descartarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={exitKeepingDraft}>Salir y guardar borrador</Button>
            <Button variant="outline" onClick={() => setExitOpen(false)}>
              Seguir editando
            </Button>
            <Button variant="outline" className="text-destructive" onClick={exitDiscarding}>
              Descartar borrador y salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        variant="default"
        title="¿Salir del editor?"
        description="El borrador queda guardado en este navegador. Los cambios sin aplicar del carrito se pierden."
        confirmText="Salir"
        cancelText="Seguir editando"
        onConfirm={() => {
          if (userId && draft && dirty)
            saveLandingDraft({ userId, host, base: original.current ?? '', draft });
          blocker.proceed?.();
        }}
      />
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
      <CartContentEditor
        section={cartSection}
        onClose={() => setCartSection(null)}
        onDirtyChange={setCartDirty}
      />
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
