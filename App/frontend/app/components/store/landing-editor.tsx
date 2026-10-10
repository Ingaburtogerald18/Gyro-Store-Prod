// Editor de portada y carrito.
//
// Tres niveles de cambios, siempre separados:
//   1. Formulario abierto (un banner, una parte del carrito): copia local.
//   2. Borrador: lo que se aplicó desde los formularios. Se guarda también en
//      este navegador (lib/landingDraft) para sobrevivir a una recarga.
//   3. Publicado: lo que ve la tienda. Solo cambia con «Publicar».
//
// La vista previa es la tienda real en un iframe aislado: no crea pedidos, no
// abre WhatsApp ni publica, y no toca el carrito ni el tema guardados.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  categoryMode,
  landingConfigSchema,
  MAX_HERO_SLIDES,
  type CategoryMode,
  type HeroSlide,
} from '@shared/schemas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectUser, toggleEditMode } from '~/store/slices/authSlice';
import {
  clearBuilderSession,
  initBuilderSession,
  selectDraftLandingConfig,
  setCategoryMode,
  updateHeroSlides,
} from '~/store/slices/builderSlice';
import { useStoreCatalog, useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import { useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { InlineRailsEditor } from './inline-rails-editor';
import { BannerEditor } from './banner-editor';
import { CART_EDITOR_SECTIONS, CartContentEditor, type CartEditorSection } from '~/components/cart/cart-content-editor';
import { clearLandingDraft, loadLandingDraft, saveLandingDraft, signature, type StoredLandingDraft } from '~/lib/landingDraft';
import { hasLandingErrors, validateLanding, validateSlide, type LandingErrors, type SlideErrors } from '~/lib/landingValidation';
import { getProductUrl, errMsg } from '~/lib/formatters';
import { cn } from '~/lib/utils';

const SECTIONS = [
  { id: 'banners', label: 'Banners', hint: 'Imagen, texto y botón principal' },
  { id: 'navigation', label: 'Navegación', hint: 'Categorías del encabezado' },
  { id: 'products', label: 'Secciones', hint: 'Grupos de productos de la portada' },
  { id: 'cart', label: 'Carrito', hint: 'Textos e imágenes de compra' },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

// Anchos LÓGICOS reales de la vista previa. «Escritorio» se ve como escritorio
// aunque el panel lateral achique el espacio: se escala para que entre.
const VIEWPORTS = [
  { id: 'm320', width: 320, label: '320', group: 'Móvil' },
  { id: 'm390', width: 390, label: '390', group: 'Móvil' },
  { id: 't768', width: 768, label: '768', group: 'Tablet' },
  { id: 'd1280', width: 1280, label: '1280', group: 'Escritorio' },
  { id: 'd1440', width: 1440, label: '1440', group: 'Escritorio' },
] as const;
type ViewportId = typeof VIEWPORTS[number]['id'];

const MODE_LABEL: Record<CategoryMode, string> = {
  auto: 'Automático',
  custom: 'Elegidas',
  hidden: 'Ocultar',
};

export function LandingEditor() {
  const dispatch = useAppDispatch();
  const reduceMotion = useReducedMotion();
  const user = useAppSelector(selectUser);
  const landing = useStoreLanding();
  const config = useStoreConfig();
  const products = useStoreCatalog();
  const draft = useAppSelector(selectDraftLandingConfig);
  const [publish, { isLoading: publishing }] = useUpdateLandingConfigMutation();

  const [section, setSection] = useState<SectionId>('banners');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportId>('d1280');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cartSection, setCartSection] = useState<CartEditorSection | null>(null);
  const [cartDirty, setCartDirty] = useState(false);
  const [recovery, setRecovery] = useState<StoredLandingDraft | null>(null);
  const [publishErrors, setPublishErrors] = useState<LandingErrors | null>(null);

  // Formulario de banner: copia local + su versión original para saber si hay
  // cambios sin aplicar.
  const [bannerForm, setBannerForm] = useState<HeroSlide | null>(null);
  const [bannerOriginal, setBannerOriginal] = useState('');
  const [bannerErrors, setBannerErrors] = useState<SlideErrors>({});
  const [discardForm, setDiscardForm] = useState(false);

  const original = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const host = typeof window !== 'undefined' ? window.location.host : '';
  const userId = user?.id ?? '';
  const serialized = signature(draft);
  const dirty = original.current !== null && serialized !== original.current;
  const formDirty = (bannerForm !== null && JSON.stringify(bannerForm) !== bannerOriginal) || cartDirty;
  const busy = publishing || uploading;
  const slide = draft?.heroSlides.find(item => item.id === selectedId) ?? draft?.heroSlides[0];

  const validationContext = useMemo(() => ({
    productUrls: products.map((p) => getProductUrl(p.id, p.name)),
    socialCount: [config?.socialLinks?.facebook, config?.socialLinks?.instagram, config?.socialLinks?.tiktok].filter((v) => v?.trim()).length,
  }), [products, config?.socialLinks]);

  // ── Aislamiento del área: tokens y fuente del panel, también en portales ──
  // Los diálogos y menús se montan en <body>, fuera del editor; el atributo en
  // un contenedor no cambiaría su cascada. Mientras el editor está abierto, el
  // documento entero es «admin» (la tienda real no se ve detrás).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.dataset.area;
    html.dataset.area = 'admin';
    setPreviewTheme(html.dataset.theme === 'dark' ? 'dark' : 'light');
    return () => {
      if (previous) html.dataset.area = previous;
    };
  }, []);

  // ── Sesión del borrador ──
  useEffect(() => {
    if (!draft && landing) dispatch(initBuilderSession(landing));
    if (original.current === null && landing) original.current = signature(landing);
  }, [draft, landing, dispatch]);

  // Borrador local de una sesión anterior: se OFRECE, nunca se aplica solo.
  useEffect(() => {
    if (!landing || !userId) return;
    const stored = loadLandingDraft(userId, host);
    if (stored && signature(stored.draft) !== signature(landing)) setRecovery(stored);
    // Solo al abrir el editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(landing), userId]);

  // Guardado local del borrador mientras haya cambios sin publicar.
  useEffect(() => {
    if (!userId || original.current === null || !draft || recovery) return;
    const timer = setTimeout(() => {
      if (dirty) saveLandingDraft({ userId, host, base: original.current ?? '', draft });
      else clearLandingDraft(userId, host);
    }, 500);
    return () => clearTimeout(timer);
  }, [serialized, dirty, draft, userId, host, recovery]);

  // ── Vista previa ──
  const syncPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'gyro:landing-preview', config: draft, slideId: preview ? null : slide?.id, interactive: preview, theme: previewTheme },
      window.location.origin,
    );
  }, [draft, slide?.id, preview, previewTheme]);

  useEffect(() => {
    syncPreview();
    function onMessage(event: MessageEvent) {
      // Solo mensajes del iframe propio y del mismo origen.
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const type = event.data?.type;
      if (type === 'gyro:preview-link') toast.info('En la vista previa los enlaces y compras no se ejecutan.', { id: 'preview-link' });
      if (type === 'gyro:preview-ready') syncPreview();
      if (type === 'gyro:select-section' && !busy && SECTIONS.some(item => item.id === event.data.section)) {
        setSection(event.data.section);
        setMobilePanel(true);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [syncPreview, busy]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const logical = VIEWPORTS.find(v => v.id === viewport) ?? VIEWPORTS[3];
  const scale = canvasSize.width > 0 ? Math.min(1, canvasSize.width / logical.width) : 1;
  const frameHeight = canvasSize.height > 0 ? canvasSize.height / scale : 800;

  // ── Salida con cambios pendientes ──
  useEffect(() => {
    if (!dirty && !formDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, formDirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || formDirty) && currentLocation.pathname !== nextLocation.pathname,
  );

  function exit() {
    dispatch(clearBuilderSession());
    dispatch(toggleEditMode());
  }
  function exitKeepingDraft() {
    if (userId && draft && dirty) saveLandingDraft({ userId, host, base: original.current ?? '', draft });
    exit();
  }
  function exitDiscarding() {
    if (userId) clearLandingDraft(userId, host);
    exit();
  }

  function recoverDraft() {
    if (!recovery) return;
    dispatch(initBuilderSession(recovery.draft));
    setRecovery(null);
    toast.success('Recuperaste tu borrador. Todavía no está publicado.');
  }
  function dismissRecovery() {
    if (userId) clearLandingDraft(userId, host);
    setRecovery(null);
  }

  async function save() {
    const parsed = landingConfigSchema.safeParse(draft);
    const errors = parsed.success ? validateLanding(parsed.data, validationContext) : { slides: {} };
    if (!parsed.success || hasLandingErrors(errors)) {
      setPublishErrors(errors);
      const firstSlide = Object.keys(errors.slides)[0];
      if (firstSlide) {
        setSection('banners');
        setSelectedId(firstSlide);
      } else if (errors.headerCategories) setSection('navigation');
      else if (errors.homeCategories) setSection('products');
      setMobilePanel(true);
      toast.error(parsed.success ? 'No se publicó: revisá los campos marcados.' : 'No se publicó: el borrador tiene datos inválidos.');
      return;
    }
    setPublishErrors(null);
    try {
      await publish(parsed.data).unwrap();
      original.current = signature(parsed.data);
      if (userId) clearLandingDraft(userId, host);
      exit();
      toast.success('Portada publicada. La tienda ya muestra los cambios.');
    } catch (error) {
      toast.error(errMsg(error, 'No se pudo publicar. Tu borrador sigue guardado.'));
    }
  }

  // ── Banners ──
  function openBanner(next: HeroSlide) {
    setBannerForm(next);
    setBannerOriginal(JSON.stringify(next));
    setBannerErrors(publishErrors?.slides[next.id] ?? {});
  }
  function closeBanner() {
    setBannerForm(null);
    setBannerOriginal('');
    setBannerErrors({});
  }
  function requestCloseBanner() {
    if (uploading) return;
    if (bannerForm && JSON.stringify(bannerForm) !== bannerOriginal) setDiscardForm(true);
    else closeBanner();
  }
  function applyBanner() {
    if (!bannerForm || !draft) return;
    const errors = validateSlide(bannerForm, validationContext);
    if (Object.keys(errors).length) {
      setBannerErrors(errors);
      return;
    }
    if (draft.heroSlides.some(item => item.id === bannerForm.id)) {
      dispatch(updateHeroSlides(draft.heroSlides.map(item => item.id === bannerForm.id ? bannerForm : item)));
    } else {
      dispatch(updateHeroSlides([...draft.heroSlides, bannerForm]));
    }
    setSelectedId(bannerForm.id);
    if (publishErrors?.slides[bannerForm.id]) {
      const rest = { ...publishErrors.slides };
      delete rest[bannerForm.id];
      setPublishErrors({ ...publishErrors, slides: rest });
    }
    closeBanner();
    toast.success('Banner aplicado al borrador. Publicá para que se vea en la tienda.');
  }
  function addSlide() {
    if (!draft || draft.heroSlides.length >= MAX_HERO_SLIDES) return;
    openBanner({ id: crypto.randomUUID(), title: '', description: '', eyebrow: '', mediaUrl: '', mediaType: 'image', buttonText: 'Ver catálogo', actionType: 'link', actionTarget: '/#catalogo' });
  }
  function moveSlide(direction: -1 | 1) {
    if (!draft || !slide) return;
    const index = draft.heroSlides.findIndex(item => item.id === slide.id);
    const target = index + direction;
    if (!draft.heroSlides[target] || slide.locked || draft.heroSlides[target].locked) return;
    const next = [...draft.heroSlides];
    [next[index], next[target]] = [next[target], next[index]];
    dispatch(updateHeroSlides(next));
  }

  const status = publishing
    ? { text: 'Publicando…', tone: 'bg-info/10 text-info' }
    : uploading
      ? { text: 'Subiendo archivo…', tone: 'bg-info/10 text-info' }
      : dirty
        ? { text: 'Borrador sin publicar', tone: 'bg-warning/10 text-warning' }
        : { text: 'Igual a lo publicado', tone: 'bg-success/10 text-success' };

  const headerMode = categoryMode(draft?.headerCategoriesMode, draft?.headerCategories);
  const homeMode = categoryMode(draft?.homeCategoriesMode, draft?.homeCategories);

  return (
    <div data-skin="admin" data-area="admin" className="landing-studio fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 lg:px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => (dirty || formDirty ? setExitOpen(true) : exit())}>← Salir</Button>
          <div className="border-l pl-4">
            <h1 className="text-sm font-semibold">Editor de portada</h1>
            <p role="status" className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', status.tone)}>{status.text}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Ancho de la vista previa" className="hidden items-center rounded-xl border p-1 md:flex">
            {VIEWPORTS.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={viewport === item.id}
                title={`${item.group} · ${item.width}px`}
                onClick={() => setViewport(item.id)}
                className={cn('rounded-xl px-2.5 py-1.5 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', viewport === item.id ? 'bg-muted font-semibold' : 'text-muted-foreground')}
              >
                <span className="sr-only">{item.group} </span>{item.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Tema de la vista previa" className="hidden items-center rounded-xl border p-1 sm:flex">
            {(['light', 'dark'] as const).map(theme => (
              <button
                key={theme}
                type="button"
                aria-pressed={previewTheme === theme}
                onClick={() => setPreviewTheme(theme)}
                className={cn('rounded-xl px-2.5 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', previewTheme === theme ? 'bg-muted font-semibold' : 'text-muted-foreground')}
              >
                {theme === 'light' ? 'Claro' : 'Oscuro'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { setPreview(!preview); setMobilePanel(false); }}>{preview ? 'Volver a editar' : 'Probar vista previa'}</Button>
          <Button size="sm" disabled={busy || !dirty || !draft} onClick={() => void save()}>{publishing ? 'Publicando…' : 'Publicar'}</Button>
        </div>
      </header>

      {recovery && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b bg-warning/10 px-4 py-3 text-sm lg:px-6">
          <p>
            Tenés un borrador sin publicar del {new Date(recovery.savedAt).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })}.
            {landing && recovery.base !== signature(landing) && ' La portada publicada cambió desde entonces: revisalo antes de publicar.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={dismissRecovery}>Descartar borrador</Button>
            <Button size="sm" onClick={recoverDraft}>Recuperar borrador</Button>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {!preview && (
          <aside className={cn('flex w-80 shrink-0 flex-col border-r bg-card lg:static lg:flex', mobilePanel ? 'absolute inset-x-0 bottom-0 top-0 z-20 w-full' : 'hidden')}>
            <div className="border-b p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Diseñá tu portada</p><Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobilePanel(false)}>Ver página</Button></div>
              <nav aria-label="Secciones del editor" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {SECTIONS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={section === item.id}
                    disabled={busy}
                    onClick={() => setSection(item.id)}
                    className={cn('relative rounded-xl px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', section === item.id ? 'bg-card font-semibold text-foreground' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground')}
                  >
                    {item.label}
                    {((item.id === 'banners' && publishErrors && Object.keys(publishErrors.slides).length > 0) ||
                      (item.id === 'navigation' && publishErrors?.headerCategories) ||
                      (item.id === 'products' && publishErrors?.homeCategories)) && (
                      <span className="ml-1.5 inline-block size-2 rounded-full bg-destructive" aria-label="con errores" />
                    )}
                  </button>
                ))}
              </nav>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="text-base font-semibold">{SECTIONS.find(item => item.id === section)?.label}</h2>
              <p className="mb-5 mt-1 text-xs text-muted-foreground">{SECTIONS.find(item => item.id === section)?.hint}</p>
              <motion.fieldset key={section} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} disabled={busy} className={cn('min-w-0 space-y-5', busy && 'pointer-events-none')}>
                {section === 'navigation' && (
                  <>
                    <CategoryModeField
                      label="Categorías del encabezado"
                      mode={headerMode}
                      onChange={(mode) => dispatch(setCategoryMode({ zone: 'header', mode }))}
                      descriptions={{
                        auto: 'Se muestran las categorías con productos, en su orden.',
                        custom: 'Solo las que elijas, en el orden que definas.',
                        hidden: 'El encabezado no muestra categorías.',
                      }}
                      error={publishErrors?.headerCategories}
                    />
                    {headerMode === 'custom' && <InlineCategoryNavEditor allCategories={config?.categories ?? []} />}
                  </>
                )}
                {section === 'products' && (
                  <>
                    <CategoryModeField
                      label="Secciones de la portada"
                      mode={homeMode}
                      onChange={(mode) => dispatch(setCategoryMode({ zone: 'home', mode }))}
                      descriptions={{
                        auto: 'Una sección por cada categoría con productos.',
                        custom: 'Solo las secciones que elijas, en ese orden.',
                        hidden: 'Sin secciones: se muestra el catálogo completo en una grilla.',
                      }}
                      error={publishErrors?.homeCategories}
                    />
                    {homeMode === 'custom' && <InlineRailsEditor allCategories={config?.categories ?? []} />}
                  </>
                )}
                {section === 'banners' && <>
                  <ul className="flex gap-2 overflow-x-auto pb-2" aria-label="Banners del borrador">
                    {draft?.heroSlides.map((item, index) => {
                      const hasErrors = Boolean(publishErrors?.slides[item.id]);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            aria-pressed={slide?.id === item.id}
                            onClick={() => setSelectedId(item.id)}
                            className={cn('w-32 shrink-0 overflow-hidden rounded-xl border bg-background text-left transition-colors hover:border-primary-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', slide?.id === item.id && 'border-primary ring-2 ring-primary/40', hasErrors && 'border-destructive')}
                          >
                            {item.mediaUrl && item.mediaType === 'image' ? <img src={item.mediaUrl} alt="" className="h-20 w-full object-cover" /> : <div className="grid h-20 place-items-center bg-muted text-xs">Banner {index + 1}</div>}
                            <span className="block truncate p-2 text-xs">{item.title || 'Sin título'}</span>
                            {hasErrors && <span className="block px-2 pb-2 text-xs font-medium text-destructive">Revisar</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button variant="outline" size="sm" className="w-full" disabled={!draft || draft.heroSlides.length >= MAX_HERO_SLIDES || busy} onClick={addSlide}>+ Agregar banner</Button>
                  {slide && <>
                    <div className="flex items-center justify-between gap-2 border-b pb-3">
                      <span className="text-xs text-muted-foreground">{slide.locked ? 'Banner principal' : 'Orden del banner'}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" disabled={slide.locked || busy || draft?.heroSlides[0]?.id === slide.id || draft?.heroSlides[(draft?.heroSlides.findIndex(item => item.id === slide.id) ?? 0) - 1]?.locked} onClick={() => moveSlide(-1)} aria-label="Mover banner antes">←</Button>
                        <Button variant="ghost" size="sm" disabled={slide.locked || busy || draft?.heroSlides.at(-1)?.id === slide.id} onClick={() => moveSlide(1)} aria-label="Mover banner después">→</Button>
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-card p-4">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Banner seleccionado</p>
                      <h3 className="font-semibold">{slide.title || 'Sin título'}</h3>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{slide.description || 'Sin descripción.'}</p>
                      {publishErrors?.slides[slide.id] && (
                        <ul className="mt-3 space-y-1 text-sm text-destructive">
                          {Object.values(publishErrors.slides[slide.id] ?? {}).map((message) => <li key={message}>{message}</li>)}
                        </ul>
                      )}
                      <Button className="mt-4 w-full" disabled={busy} onClick={() => openBanner({ ...slide })}>Editar banner</Button>
                    </div>
                    {!slide.locked && <Button variant="outline" size="sm" className="w-full text-destructive" disabled={busy || (draft?.heroSlides.length ?? 0) <= 1} onClick={() => setDeleteId(slide.id)}>Quitar banner del borrador</Button>}
                  </>}
                </>}
                {section === 'cart' && (
                  <div className="space-y-2">
                    {(Object.keys(CART_EDITOR_SECTIONS) as CartEditorSection[]).map(key => (
                      <button key={key} type="button" onClick={() => setCartSection(key)} className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        <span className="block text-sm font-medium">{CART_EDITOR_SECTIONS[key].label}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{CART_EDITOR_SECTIONS[key].hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.fieldset>
            </div>
            <div className="border-t p-4 text-xs text-muted-foreground">Los cambios aplicados quedan en el borrador (guardado en este navegador). La tienda cambia al publicar.</div>
          </aside>
        )}
        <div className="studio-canvas flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 text-xs text-muted-foreground">
            <span className="truncate">{preview ? 'Vista previa: probá los controles del carrusel. Las compras y enlaces no se ejecutan.' : 'Edición: tocá una sección de la página para editarla.'} · {logical.group} {logical.width}px{scale < 1 ? ` (al ${Math.round(scale * 100)}%)` : ''}</span>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => { setPreview(false); setMobilePanel(!mobilePanel); }}>{mobilePanel ? 'Ver página' : 'Ajustes'}</Button>
          </div>
          <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute top-0 left-1/2" style={{ width: logical.width * scale, height: '100%', transform: 'translateX(-50%)' }}>
              <iframe
                ref={frame}
                onLoad={syncPreview}
                title="Vista previa de la portada"
                src="/?landing-preview=1"
                style={{ width: logical.width, height: frameHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                className="border-x bg-background"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Salir con cambios pendientes: tres caminos claros. */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Salir del editor?</DialogTitle>
            <DialogDescription>
              {formDirty ? 'Tenés un formulario con cambios sin aplicar; esos cambios se pierden. ' : ''}
              El borrador no está publicado. Podés dejarlo guardado en este navegador para seguir después, o descartarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={exitKeepingDraft}>Salir y guardar el borrador</Button>
            <Button variant="outline" onClick={() => setExitOpen(false)}>Seguir editando</Button>
            <Button variant="ghost" className="text-destructive" onClick={exitDiscarding}>Descartar el borrador y salir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navegación del navegador (atrás, otra ruta) con cambios pendientes. */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
        variant="default"
        title="¿Salir del editor?"
        description="El borrador queda guardado en este navegador y podés recuperarlo al volver. Los formularios sin aplicar se pierden."
        confirmText="Salir"
        cancelText="Seguir editando"
        onConfirm={() => {
          if (userId && draft && dirty) saveLandingDraft({ userId, host, base: original.current ?? '', draft });
          blocker.proceed?.();
        }}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={open => !open && setDeleteId(null)}
        title="Quitar banner"
        description="Se quita del borrador. La tienda cambia cuando publiques."
        confirmText="Quitar del borrador"
        onConfirm={() => { if (draft) dispatch(updateHeroSlides(draft.heroSlides.filter(item => item.id !== deleteId))); setSelectedId(null); }}
      />

      <ConfirmDialog
        open={discardForm}
        onOpenChange={setDiscardForm}
        title="¿Descartar los cambios del banner?"
        description="Los cambios de este formulario todavía no se aplicaron al borrador."
        confirmText="Descartar cambios"
        cancelText="Seguir editando"
        onConfirm={closeBanner}
      />

      <Dialog open={bannerForm !== null} onOpenChange={open => { if (!open) requestCloseBanner(); }}>
        <DialogContent
          showCloseButton={!uploading}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          onEscapeKeyDown={event => { if (uploading) event.preventDefault(); }}
          onPointerDownOutside={event => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{draft?.heroSlides.some(item => item.id === bannerForm?.id) ? 'Editar banner' : 'Nuevo banner'}</DialogTitle>
            <DialogDescription>Los cambios pasan al borrador cuando tocás «Aplicar al borrador». No se publican solos.</DialogDescription>
          </DialogHeader>
          {bannerForm && <BannerEditor key={bannerForm.id} slide={bannerForm} onChange={(next) => { setBannerForm(next); setBannerErrors({}); }} onBusy={setUploading} errors={bannerErrors} />}
          <DialogFooter className="sticky bottom-0 border-t bg-popover pt-4">
            <Button variant="cancel" disabled={uploading} onClick={requestCloseBanner}>Cancelar</Button>
            <Button disabled={uploading} onClick={applyBanner}>Aplicar al borrador</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CartContentEditor section={cartSection} onClose={() => setCartSection(null)} onDirtyChange={setCartDirty} />
    </div>
  );
}

/** Automático / Elegidas / Ocultar, con la explicación del modo activo. */
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
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {(['auto', 'custom', 'hidden'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => onChange(item)}
            className={cn('rounded-xl px-2 py-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', mode === item ? 'bg-card font-semibold' : 'text-muted-foreground hover:text-foreground')}
          >
            {MODE_LABEL[item]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{descriptions[mode]}</p>
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </fieldset>
  );
}
