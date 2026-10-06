import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { landingConfigSchema, MAX_HERO_SLIDES, type HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { toggleEditMode } from '~/store/slices/authSlice';
import { clearBuilderSession, initBuilderSession, selectDraftLandingConfig, updateHeroSlides } from '~/store/slices/builderSlice';
import { useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import { useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { InlineRailsEditor } from './inline-rails-editor';
import { BannerEditor } from './banner-editor';
import { CART_EDITOR_SECTIONS, CartContentEditor, type CartEditorSection } from '~/components/cart/cart-content-editor';
import { cn } from '~/lib/utils';
import { errMsg } from '~/lib/formatters';

const SECTIONS = [
  { id: 'banners', label: 'Banners', hint: 'Imagen, texto y botón principal' },
  { id: 'navigation', label: 'Navegación', hint: 'Categorías del encabezado' },
  { id: 'products', label: 'Secciones', hint: 'Orden de los grupos de productos' },
  { id: 'cart', label: 'Carrito', hint: 'Textos e imágenes de compra' },
] as const;

export function LandingEditor() {
  const dispatch = useAppDispatch();
  const landing = useStoreLanding();
  const config = useStoreConfig();
  const draft = useAppSelector(selectDraftLandingConfig);
  const [publish, { isLoading: publishing }] = useUpdateLandingConfigMutation();
  const [section, setSection] = useState<typeof SECTIONS[number]['id']>('banners');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [preview, setPreview] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cartSection, setCartSection] = useState<CartEditorSection | null>(null);
  const original = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const serialized = draft ? JSON.stringify(draft) : null;
  const dirty = original.current !== null && serialized !== original.current;
  const busy = publishing || uploading;
  const slide = draft?.heroSlides.find(item => item.id === selectedId) ?? draft?.heroSlides[0];

  useEffect(() => {
    if (!draft && landing) dispatch(initBuilderSession(landing));
    if (original.current === null && (draft || landing)) original.current = JSON.stringify(draft ?? landing);
  }, [draft, landing, dispatch]);

  const syncPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'gyro:landing-preview', config: draft, slideId: slide?.id, interactive: preview }, window.location.origin);
  }, [draft, slide?.id, preview]);

  useEffect(() => {
    syncPreview();
    function ready(event: MessageEvent) {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'gyro:preview-ready') syncPreview();
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'gyro:select-section' && !busy && SECTIONS.some(item => item.id === event.data.section)) { setSection(event.data.section); setMobilePanel(true); }
    }
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [syncPreview, busy]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function exit() {
    dispatch(clearBuilderSession());
    dispatch(toggleEditMode());
  }
  async function save() {
    const parsed = landingConfigSchema.safeParse(draft);
    if (!parsed.success || parsed.data.heroSlides.some(item => !item.title.trim())) {
      toast.error('Revisa los banners: cada uno debe tener un título y contenido válido.');
      return;
    }
    try {
      await publish(parsed.data).unwrap();
      original.current = JSON.stringify(parsed.data);
      exit();
      toast.success('Los cambios de la portada ya están publicados.');
    } catch (error) {
      toast.error(errMsg(error, 'No se pudo publicar. Tu borrador sigue disponible.'));
    }
  }
  function changeSlide(next: HeroSlide) {
    if (draft) dispatch(updateHeroSlides(draft.heroSlides.map(item => item.id === next.id ? next : item)));
  }
  function addSlide() {
    if (!draft || draft.heroSlides.length >= MAX_HERO_SLIDES) return;
    const next: HeroSlide = { id: crypto.randomUUID(), title: 'Nuevo banner', description: '', eyebrow: '', mediaUrl: '', mediaType: 'image', buttonText: 'Ver catálogo', actionType: 'link', actionTarget: '/#catalogo' };
    dispatch(updateHeroSlides([...draft.heroSlides, next]));
    setSelectedId(next.id);
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

  return (
    <div data-skin="admin" data-area="admin" className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 lg:px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => dirty ? setDiscard(true) : exit()}>← Salir</Button>
          <div className="border-l pl-4"><h1 className="text-sm font-semibold">Editor de portada</h1><p role="status" className="mt-0.5 text-xs text-muted-foreground">{publishing ? 'Publicando…' : uploading ? 'Subiendo archivo…' : dirty ? 'Cambios sin publicar' : 'Todo está al día'}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Tamaño de vista previa" className="hidden rounded-lg border p-1 sm:flex">
            {(['desktop', 'mobile'] as const).map(item => <button key={item} aria-pressed={device === item} onClick={() => setDevice(item)} className={cn('rounded-md px-3 py-1.5 text-xs', device === item && 'bg-muted font-semibold')}>{item === 'desktop' ? 'Escritorio' : 'Móvil'}</button>)}
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { setPreview(!preview); setMobilePanel(false); }}>{preview ? 'Volver a editar' : 'Vista previa'}</Button>
          <Button size="sm" disabled={busy || !dirty || !draft} onClick={() => void save()}>Publicar cambios</Button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {!preview && (
          <aside className={cn('flex w-80 shrink-0 flex-col border-r bg-card lg:static lg:flex', mobilePanel ? 'absolute inset-x-0 bottom-0 top-0 z-20 w-full' : 'hidden')}>
            <div className="border-b p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Contenido de la tienda</p>
              <nav aria-label="Secciones del editor" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {SECTIONS.map(item => <button key={item.id} aria-pressed={section === item.id} disabled={busy} onClick={() => setSection(item.id)} className={cn('rounded-lg px-3 py-2.5 text-sm transition-colors', section === item.id ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{item.label}</button>)}
              </nav>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="text-base font-semibold">{SECTIONS.find(item => item.id === section)?.label}</h2>
              <p className="mb-5 mt-1 text-xs text-muted-foreground">{SECTIONS.find(item => item.id === section)?.hint}</p>
              <fieldset disabled={busy} className={cn("min-w-0 space-y-5", busy && "pointer-events-none")}>
                {section === 'navigation' && <><p className="text-xs text-muted-foreground">Arrastra para ordenar. Sin selección se muestran las categorías automáticamente.</p><InlineCategoryNavEditor allCategories={config?.categories ?? []} /></>}
                {section === 'products' && <InlineRailsEditor allCategories={config?.categories ?? []} />}
                {section === 'banners' && <>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {draft?.heroSlides.map((item, index) => <button key={item.id} aria-pressed={slide?.id === item.id} onClick={() => setSelectedId(item.id)} className={cn('w-24 shrink-0 overflow-hidden rounded-lg border text-left', slide?.id === item.id && 'border-primary ring-1 ring-primary')}>
                      {item.mediaUrl && item.mediaType === 'image' ? <img src={item.mediaUrl} alt="" className="h-14 w-full object-cover" /> : <div className="grid h-14 place-items-center bg-muted text-xs">Banner {index + 1}</div>}
                      <span className="block truncate p-2 text-xs">{item.title || 'Sin título'}</span>
                    </button>)}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" disabled={!draft || draft.heroSlides.length >= MAX_HERO_SLIDES || busy} onClick={addSlide}>+ Añadir banner</Button>
                  {slide && <>
                    <div className="flex items-center justify-between gap-2 border-b pb-3">
                      <span className="text-xs text-muted-foreground">{slide.locked ? 'Banner principal' : 'Orden del banner'}</span>
                      <div className="flex gap-1"><Button variant="ghost" size="sm" disabled={slide.locked || busy || draft?.heroSlides[0]?.id === slide.id || draft?.heroSlides[(draft?.heroSlides.findIndex(item => item.id === slide.id) ?? 0) - 1]?.locked} onClick={() => moveSlide(-1)} aria-label="Mover banner antes">←</Button><Button variant="ghost" size="sm" disabled={slide.locked || busy || draft?.heroSlides.at(-1)?.id === slide.id} onClick={() => moveSlide(1)} aria-label="Mover banner después">→</Button></div>
                    </div>
                    <BannerEditor key={slide.id} slide={slide} onChange={changeSlide} onBusy={setUploading} disabled={busy} />
                    {!slide.locked && <Button variant="outline" size="sm" className="w-full text-destructive" disabled={busy || (draft?.heroSlides.length ?? 0) <= 1} onClick={() => setDeleteId(slide.id)}>Eliminar banner</Button>}
                  </>}
                </>}
                {section === 'cart' && <div className="space-y-2">{(Object.keys(CART_EDITOR_SECTIONS) as CartEditorSection[]).map(key => <button key={key} onClick={() => setCartSection(key)} className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted"><span className="block text-sm font-medium">{CART_EDITOR_SECTIONS[key].label}</span><span className="mt-1 block text-xs text-muted-foreground">{CART_EDITOR_SECTIONS[key].hint}</span></button>)}</div>}
              </fieldset>
            </div>
            <div className="border-t p-4 text-xs text-muted-foreground">Los ajustes se reflejan en la vista previa. La tienda cambia al publicar.</div>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col bg-muted/40">
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 text-xs text-muted-foreground"><span>Vista previa · {device === 'mobile' ? '390 px' : 'Escritorio'}</span><Button variant="ghost" size="sm" className="lg:hidden" onClick={() => { setPreview(false); setMobilePanel(!mobilePanel); }}>{mobilePanel ? 'Ver página' : 'Ajustes'}</Button><button className="sm:hidden" onClick={() => setDevice(device === 'mobile' ? 'desktop' : 'mobile')}>{device === 'mobile' ? 'Ver escritorio' : 'Ver móvil'}</button></div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3 sm:p-6">
            <iframe ref={frame} onLoad={syncPreview} title="Vista previa de la portada" src="/?landing-preview=1" className={cn('h-full shrink-0 rounded-xl border bg-background shadow-sm transition-[width] duration-200', device === 'mobile' ? 'w-[390px]' : 'w-full')} />
          </div>
        </div>
      </div>
      <ConfirmDialog open={discard} onOpenChange={setDiscard} title="¿Descartar los cambios?" description="La tienda conservará su versión publicada. Los ajustes de esta sesión se perderán." confirmText="Descartar y salir" onConfirm={exit} />
      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)} title="Eliminar banner" description="Se quitará del borrador. La tienda cambia cuando publiques." confirmText="Eliminar del borrador" onConfirm={() => { if (draft) dispatch(updateHeroSlides(draft.heroSlides.filter(item => item.id !== deleteId))); setSelectedId(null); }} />
      <CartContentEditor section={cartSection} onClose={() => setCartSection(null)} />
    </div>
  );
}
