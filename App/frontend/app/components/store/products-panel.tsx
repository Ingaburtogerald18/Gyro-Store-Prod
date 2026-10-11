import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ImageNotFound01Icon,
  LinkSquare02Icon,
  Menu01Icon,
  PackageSearchIcon,
} from '@hugeicons/core-free-icons';
import type { DraftProductChange, EditorProduct } from '@shared/schemas';
import { ImageUploader } from '~/components/catalog/ImageUploader';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { FormPanel, FormSection } from '~/components/ui/form-layout';
import { HugeIcon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import { Switch } from '~/components/ui/switch';
import { formatCordobas } from '~/lib/formatters';
import { cardImages } from '~/lib/storeDraftProducts';
import { cn } from '~/lib/utils';
import { EditorItemPreview } from './editor-item-preview';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'unpublished', label: 'Ocultos' },
  { id: 'noPhotos', label: 'Sin fotos' },
  { id: 'soldOut', label: 'Agotados' },
  { id: 'comingSoon', label: 'Próximamente' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];
const PAGE_SIZE = 25;
const selectionClass = 'border-2 border-primary-2 font-semibold';
const hasPhotos = (product: EditorProduct) =>
  cardImages(product.images, product.imagesByColor).length > 0;
const photoCount = (product: EditorProduct) =>
  product.images.length +
  Object.values(product.imagesByColor).reduce((total, images) => total + images.length, 0);
const MATCHES: Record<FilterId, (product: EditorProduct) => boolean> = {
  all: () => true,
  unpublished: (product) => !product.published,
  noPhotos: (product) => !hasPhotos(product),
  soldOut: (product) => product.card.availability === 'sold_out',
  comingSoon: (product) => product.card.availability === 'coming_soon',
};
function priceLabel(product: EditorProduct, currency?: string) {
  if (product.card.availability === 'coming_soon') return 'Próximamente · Sin precio';
  if (product.card.price <= 0) return 'Sin precio de venta';
  return `${product.card.priceFrom ? 'Desde ' : ''}${formatCordobas(product.card.price, currency)}`;
}

export function ProductsPanel({
  products,
  loading,
  failed,
  onRetry,
  selectedId,
  onSelect,
  onChange,
  onReorder,
  onBusy,
  disabled,
  currency,
  changedIds = [],
  groupByCategory = false,
}: {
  products: EditorProduct[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, change: DraftProductChange) => void;
  onReorder: (ids: string[]) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
  currency?: string;
  changedIds?: string[];
  /** La portada muestra una fila por categoría: el orden se arma dentro de cada una. */
  groupByCategory?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState(false);
  const selected = products.find((product) => product.id === selectedId);
  const changed = new Set(changedIds);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((item) => [item.id, products.filter(MATCHES[item.id]).length]),
      ) as Record<FilterId, number>,
    [products],
  );
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter(
      (product) =>
        MATCHES[filter](product) &&
        (!search ||
          product.name.toLowerCase().includes(search) ||
          product.category.toLowerCase().includes(search)),
    );
  }, [products, filter, query]);
  useEffect(() => setPage(1), [query, filter]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const shown = visible.slice(offset, offset + PAGE_SIZE);
  // Al ordenar se ven todos, sin páginas, para poder mover cualquier producto.
  const groups = useMemo(() => {
    if (!groupByCategory) return [{ key: null, label: '', items: products }];
    const byCategory = new Map<string, EditorProduct[]>();
    for (const product of products)
      byCategory.set(product.category, [...(byCategory.get(product.category) ?? []), product]);
    return [...byCategory].map(([key, items]) => ({ key, label: key || 'Sin categoría', items }));
  }, [groupByCategory, products]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd({ active, over }: DragEndEvent, category: string | null) {
    if (!ordering || disabled || !over || active.id === over.id) return;
    const inGroup = (product: EditorProduct) => category === null || product.category === category;
    const ids = products.filter(inGroup).map((product) => product.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Los demás productos conservan su lugar; solo se reacomoda este grupo.
    const moved = arrayMove(ids, from, to);
    let next = 0;
    onReorder(products.map((product) => (inGroup(product) ? moved[next++] : product.id)));
  }
  function toggleOrder() {
    if (!ordering) {
      setQuery('');
      setFilter('all');
      setPage(1);
    }
    setOrdering(!ordering);
  }
  if (loading)
    return (
      <div aria-busy="true" aria-label="Cargando productos" className="space-y-4">
        <Skeleton className="h-24" />
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24" />
        ))}
      </div>
    );
  if (failed)
    return (
      <div role="alert" className="space-y-3 rounded-2xl border bg-card p-5">
        <p>No se pudieron cargar los productos.</p>
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  if (selected)
    return (
      <ProductDetail
        key={selected.id}
        product={selected}
        changed={changed.has(selected.id)}
        onBack={() => onSelect(null)}
        onChange={(change) => onChange(selected.id, change)}
        onBusy={onBusy}
        disabled={disabled}
        currency={currency}
      />
    );

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            aria-label="Buscar productos"
            placeholder="Buscar por nombre o categoría"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled || ordering}
            className="min-w-48 flex-1"
          />
          <Button
            variant="outline"
            aria-pressed={ordering}
            disabled={disabled || products.length < 2}
            onClick={toggleOrder}
            className={cn(ordering && selectionClass)}
          >
            {ordering ? 'Terminar de ordenar' : 'Ordenar productos'}
          </Button>
        </div>
        <div role="group" aria-label="Filtrar productos" className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={filter === item.id}
              disabled={disabled || ordering}
              className={cn(filter === item.id && selectionClass)}
              onClick={() => setFilter(item.id)}
            >
              {item.label}{' '}
              <span className="tabular-nums text-muted-foreground">{counts[item.id]}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {ordering
            ? `${groupByCategory ? 'La tienda muestra los productos por categoría: ordenalos dentro de cada una. ' : ''}Arrastrá desde el asa o, con teclado, presioná Espacio y usá las flechas.`
            : 'Abrí un producto para preparar sus fotos. La visibilidad corresponde al borrador.'}
        </p>
      </div>
      {ordering ? (
        groups.map((group) => (
          <section key={group.key ?? 'todos'} aria-label={group.label || 'Productos de la tienda'} className="space-y-3">
            {group.key !== null && (
              <h3 className="font-semibold">
                {group.label}{' '}
                <span className="tabular-nums text-muted-foreground">{group.items.length}</span>
              </h3>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleDragEnd(event, group.key)}
            >
              <SortableContext
                items={group.items.map((product) => product.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-3">
                  {group.items.map((product, index) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      position={index + 1}
                      changed={changed.has(product.id)}
                      sortable={!disabled}
                      disabled
                      currency={currency}
                      onOpen={() => onSelect(product.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </section>
        ))
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center">
          <HugeIcon icon={PackageSearchIcon} size={24} aria-hidden />
          <p>
            {products.length
              ? 'Ningún producto coincide con la búsqueda.'
              : 'Todavía no hay productos para preparar.'}
          </p>
          {products.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Ver todos
            </Button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors}>
          <SortableContext
            items={shown.map((product) => product.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-3" aria-label="Productos de la tienda">
              {shown.map((product, index) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  position={offset + index + 1}
                  changed={changed.has(product.id)}
                  sortable={false}
                  disabled={disabled}
                  currency={currency}
                  onOpen={() => onSelect(product.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <div hidden={ordering} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="tabular-nums">
          {visible.length ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, visible.length)}` : '0'}{' '}
          de {visible.length} productos
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Página anterior"
            disabled={disabled || currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <HugeIcon icon={ArrowLeft01Icon} size={16} aria-hidden />
          </Button>
          <span className="tabular-nums">
            Página {currentPage} de {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Página siguiente"
            disabled={disabled || currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <HugeIcon icon={ArrowRight01Icon} size={16} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  position,
  changed,
  sortable,
  disabled,
  currency,
  onOpen,
}: {
  product: EditorProduct;
  position: number;
  changed: boolean;
  sortable: boolean;
  disabled: boolean;
  currency?: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: !sortable,
  });
  const image = cardImages(product.images, product.imagesByColor)[0];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4',
        isDragging && 'relative z-10 border-primary-2',
      )}
    >
      {sortable && (
        <Button
          variant="outline"
          size="icon"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${product.name}, posición ${position}`}
          className="cursor-grab touch-none active:cursor-grabbing"
        >
          <HugeIcon icon={Menu01Icon} size={16} aria-hidden />
        </Button>
      )}
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background">
        {image ? (
          <img src={image} alt="" className="size-full object-contain" loading="lazy" />
        ) : (
          <HugeIcon icon={ImageNotFound01Icon} size={20} aria-hidden />
        )}
      </span>
      <div className="min-w-48 flex-1 space-y-1">
        <p className="font-semibold">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          {product.category || 'Sin categoría'}
          {sortable && ` · Posición ${position}`}
        </p>
        <div className="flex flex-wrap gap-3">
          <Chip variant="status" tone={product.published ? 'success' : 'neutral'}>
            {product.published ? 'Visible' : 'Oculto'}
          </Chip>
          {changed && (
            <Chip variant="status" tone="warning">
              Cambios sin publicar
            </Chip>
          )}
          {product.card.availability === 'sold_out' && (
            <Chip variant="status" tone="neutral">
              Agotado
            </Chip>
          )}
          {product.card.availability === 'coming_soon' && (
            <Chip variant="status" tone="info">
              Próximamente
            </Chip>
          )}
        </div>
      </div>
      <div className="space-y-1 md:w-44">
        <p className="font-semibold tabular-nums">{priceLabel(product, currency)}</p>
        <p className="text-xs text-muted-foreground">
          {photoCount(product) ? `${photoCount(product)} fotos` : 'Sin fotos'}
        </p>
      </div>
      <Button variant="outline" disabled={disabled} onClick={onOpen}>
        Preparar producto
      </Button>
    </li>
  );
}

function ProductDetail({
  product,
  changed,
  onBack,
  onChange,
  onBusy,
  disabled,
  currency,
}: {
  product: EditorProduct;
  changed: boolean;
  onBack: () => void;
  onChange: (change: DraftProductChange) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
  currency?: string;
}) {
  const [color, setColor] = useState(product.colors[0] ?? '');
  const activeColor = product.colors.includes(color) ? color : product.colors[0] ?? '';
  const templateHref = product.templateId
    ? `/admin/inventario?tab=templates&plantilla=${product.templateId}`
    : '/admin/inventario?tab=templates';
  return (
    <FormPanel mode="page">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" disabled={disabled} onClick={onBack}>
            <HugeIcon icon={ArrowLeft01Icon} size={16} aria-hidden /> Todos los productos
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Productos / Preparar</p>
            <h3 className="text-lg font-semibold">{product.name}</h3>
          </div>
        </div>
        {changed && (
          <Chip variant="status" tone="warning">
            Cambios sin publicar
          </Chip>
        )}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <FormSection
            title="1. Fotos generales"
            description="La primera foto es la imagen principal de la tarjeta. Podés cambiarla desde las miniaturas."
          >
            <ImageUploader
              folder="catalog"
              images={product.images}
              disabled={disabled}
              onBusy={onBusy}
              onChange={(images) => onChange({ images })}
            />
            {!product.images.length && product.colors.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Si no cargás fotos generales, la tarjeta usará las fotos de los colores.
              </p>
            )}
          </FormSection>
          {product.colors.length > 0 && (
            <FormSection
              title="2. Fotos por color"
              description="Elegí un color y subí únicamente las fotos de esa variante."
            >
              <div role="group" aria-label="Color de las fotos" className="flex flex-wrap gap-2">
                {product.colors.map((option) => (
                  <Button
                    key={option}
                    variant="outline"
                    aria-pressed={activeColor === option}
                    disabled={disabled}
                    className={cn(activeColor === option && selectionClass)}
                    onClick={() => setColor(option)}
                  >
                    {option}{' '}
                    <span className="tabular-nums">
                      ({product.imagesByColor[option]?.length ?? 0})
                    </span>
                  </Button>
                ))}
              </div>
              <ImageUploader
                key={activeColor}
                folder="catalog"
                images={product.imagesByColor[activeColor] ?? []}
                disabled={disabled}
                onBusy={onBusy}
                onChange={(images) =>
                  onChange({ imagesByColor: { ...product.imagesByColor, [activeColor]: images } })
                }
              />
            </FormSection>
          )}
          <FormSection
            title={`${product.colors.length > 0 ? '3' : '2'}. Visibilidad`}
            description="Esta decisión se aplica cuando publicás los cambios."
          >
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={`show-${product.id}`} className="text-sm">
                <span className="block font-semibold">Mostrar en la tienda</span>
                <span className="block text-xs text-muted-foreground">
                  {product.published
                    ? 'Se mostrará después de publicar.'
                    : 'Quedará oculto después de publicar.'}
                </span>
              </label>
              <Switch
                id={`show-${product.id}`}
                checked={product.published}
                disabled={disabled}
                onCheckedChange={(published) => onChange({ published })}
              />
            </div>
          </FormSection>
          <details className="rounded-2xl border bg-card p-5">
            <summary className="cursor-pointer rounded-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Información del modelo
            </summary>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Categoría</dt>
                <dd>{product.category || 'Sin categoría'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Precio de bodega</dt>
                <dd>{priceLabel(product, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Descripción de la plantilla</dt>
                <dd className="whitespace-pre-line">{product.description || 'Sin descripción'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Nombre, descripción y categoría se corrigen en Plantillas; el precio de venta se
              define en bodega.
            </p>
            <Button variant="outline" asChild className="mt-3">
              <a href={templateHref} target="_blank" rel="noreferrer">
                Editar en Plantillas <HugeIcon icon={LinkSquare02Icon} size={16} aria-hidden />
              </a>
            </Button>
          </details>
        </div>
        <EditorItemPreview
          name={product.name}
          category={product.category}
          price={priceLabel(product, currency)}
          image={cardImages(product.images, product.imagesByColor)[0]}
          visible={product.published}
        />
      </div>
    </FormPanel>
  );
}
