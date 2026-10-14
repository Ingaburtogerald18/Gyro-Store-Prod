// Sección «Combos» del modo edición: fotos y «Mostrar en la tienda» de cada
// combo, al borrador. Nombre, precio e incluidos se corrigen en Inventario.
import { useState } from 'react';
import {
  ArrowLeft01Icon,
  GiftIcon,
  ImageNotFound01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons';
import type { AdminCombo, DraftComboChange } from '@shared/schemas';
import { ImageUploader } from '~/components/editor/image-uploader';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { FormPanel, FormSection } from '~/components/ui/form-layout';
import { HugeIcon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import { Switch } from '~/components/ui/switch';
import { formatCordobas } from '~/lib/formatters';
import { EditorItemPreview } from './editor-item-preview';

const INVENTORY_COMBOS = '/admin/inventario?tab=combos';

function stateLabels(combo: AdminCombo): string[] {
  const labels: string[] = [];
  if (!combo.published) labels.push('Oculto');
  if (!combo.images.length) labels.push('Sin fotos');
  return labels;
}

export function EditorCombosPanel({
  combos,
  loading,
  failed,
  onRetry,
  selectedId,
  onSelect,
  onChange,
  onBusy,
  disabled,
  currency,
  changedIds = [],
}: {
  /** Con los cambios del borrador ya aplicados. */
  combos: AdminCombo[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, change: DraftComboChange) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
  currency?: string;
  changedIds?: string[];
}) {
  const [query, setQuery] = useState('');
  const selected = combos.find((combo) => combo.id === selectedId);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Cargando combos" className="space-y-3">
        <Skeleton className="h-11" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (failed) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm">No se pudieron cargar los combos.</p>
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (combos.length === 0) {
    return (
      <div className="space-y-3">
        <HugeIcon icon={GiftIcon} size={24} />
        <p className="text-sm">
          Todavía no hay combos. Se crean en Inventario, con su precio y lo que incluyen.
        </p>
        <Button variant="outline" asChild>
          <a href={INVENTORY_COMBOS} target="_blank" rel="noreferrer">
            Ir a Combos
            <HugeIcon icon={LinkSquare02Icon} size={16} />
          </a>
        </Button>
      </div>
    );
  }
  if (selected) {
    return (
      <ComboDetail
        key={selected.id}
        combo={selected}
        changed={changedIds.includes(selected.id)}
        onBack={() => onSelect(null)}
        onChange={(change) => onChange(selected.id, change)}
        onBusy={onBusy}
        disabled={disabled}
        currency={currency}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const visible = combos.filter((combo) => !q || combo.name.toLowerCase().includes(q));
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <Input
          type="search"
          aria-label="Buscar combos"
          placeholder="Buscar por nombre"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {visible.length} combos · Abrí uno para preparar sus fotos y visibilidad.
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm">Ningún combo coincide.</p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Combos de la tienda">
          {visible.map((combo) => (
            <li key={combo.id}>
              <button
                type="button"
                onClick={() => onSelect(combo.id)}
                disabled={disabled}
                className="flex min-h-36 w-full items-center gap-4 rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background">
                  {combo.images[0] ? (
                    <img
                      src={combo.images[0]}
                      alt=""
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <HugeIcon
                      icon={ImageNotFound01Icon}
                      size={16}
                      className="text-muted-foreground"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{combo.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[formatCordobas(combo.price, currency), ...stateLabels(combo)].join(' · ')}
                  </span>
                  {changedIds.includes(combo.id) && (
                    <Chip variant="status" tone="warning" className="mt-2">
                      Cambios sin publicar
                    </Chip>
                  )}
                  <span className="mt-2 block text-xs font-semibold text-primary-2">
                    Preparar combo
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComboDetail({
  combo,
  changed,
  onBack,
  onChange,
  onBusy,
  disabled,
  currency,
}: {
  combo: AdminCombo;
  changed: boolean;
  onBack: () => void;
  onChange: (change: DraftComboChange) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
  currency?: string;
}) {
  return (
    <FormPanel mode="page">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
        <Button variant="outline" onClick={onBack} disabled={disabled}>
          <HugeIcon icon={ArrowLeft01Icon} size={16} />
          Todos los combos
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Combos / Preparar</p>
          <h3 className="text-lg font-semibold">{combo.name}</h3>
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
            title="1. Fotos del combo"
            description="La primera foto es la imagen principal. Podés cambiarla desde las miniaturas."
          >
            <ImageUploader
              folder="catalog"
              images={combo.images}
              disabled={disabled}
              onBusy={onBusy}
              onChange={(images) => onChange({ images })}
            />
          </FormSection>
          <FormSection title="2. Visibilidad" description="Se aplica cuando publicás los cambios.">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={`show-combo-${combo.id}`} className="text-sm">
                <span className="block font-semibold">Mostrar en la tienda</span>
                <span className="block text-xs text-muted-foreground">
                  {combo.published
                    ? 'Se mostrará después de publicar.'
                    : 'Quedará oculto después de publicar.'}
                </span>
              </label>
              <Switch
                id={`show-combo-${combo.id}`}
                checked={combo.published}
                disabled={disabled}
                onCheckedChange={(published) => onChange({ published })}
              />
            </div>
          </FormSection>

          <details className="rounded-2xl border bg-card p-5">
            <summary className="cursor-pointer rounded-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Información del paquete
            </summary>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Precio del paquete</dt>
                <dd>{formatCordobas(combo.price, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Incluye</dt>
                <dd>
                  {combo.items.length ? (
                    <ul className="space-y-0.5">
                      {combo.items.map((item) => (
                        <li key={item.catalogItemId}>
                          {item.quantity} × {item.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'Sin productos'
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Nombre, precio y productos se corrigen en Inventario.{' '}
              <a
                href={INVENTORY_COMBOS}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary-2 underline-offset-4 hover:underline"
              >
                Editar en Combos
                <HugeIcon icon={LinkSquare02Icon} size={12} />
              </a>
            </p>
          </details>
        </div>
        <EditorItemPreview
          name={combo.name}
          price={formatCordobas(combo.price, currency)}
          image={combo.images[0]}
          visible={combo.published}
        />
      </div>
    </FormPanel>
  );
}
