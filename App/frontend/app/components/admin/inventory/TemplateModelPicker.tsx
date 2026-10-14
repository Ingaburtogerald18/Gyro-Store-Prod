import { useEffect, useMemo, useRef, useState } from 'react';
import { Add01Icon, CheckmarkBadge01Icon } from '@hugeicons/core-free-icons';
import type { AdminTemplate, Category } from '@shared/schemas';
import { templateNameKey } from '@shared/template-names';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { HugeIcon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '~/components/ui/popover';
import { Skeleton } from '~/components/ui/skeleton';
import { searchTemplates } from '~/lib/templateSearch';
import { cn } from '~/lib/utils';

export function TemplateModelPicker({
  id,
  templates,
  categories = [],
  query,
  selectedId,
  onQueryChange,
  onSelect,
  onCreate,
  error,
  description,
  required = false,
  disabled = false,
  loading = false,
  failed = false,
  onRetry,
}: {
  id: string;
  templates: AdminTemplate[];
  categories?: Category[];
  query: string;
  selectedId: string;
  onQueryChange: (query: string) => void;
  onSelect: (template: AdminTemplate | null) => void;
  onCreate?: (name: string) => void;
  error?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const previousId = useRef(selectedId);
  const refocus = useRef(false);
  const selected = templates.find((template) => template.id === selectedId);
  const queryKey = templateNameKey(query);
  const searchable = query.trim().length >= 2 && Boolean(queryKey);
  const matches = useMemo(
    () => (searchable ? searchTemplates(templates, query) : []),
    [templates, query, searchable],
  );
  const shown = matches.slice(0, 4);
  const exact = matches.some((template) => templateNameKey(template.name) === queryKey);
  const canCreate = searchable && !exact && Boolean(onCreate);
  const optionCount = shown.length + (canCreate ? 1 : 0);
  const categoryName = (template: AdminTemplate) =>
    categories.find((category) => category.id === template.categoryId)?.name ?? '';
  const listId = `${id}-results`;
  const createId = `${id}-create`;
  const expanded = open && searchable && !selected && !disabled && !loading && !failed;
  const activeId = shown[active]
    ? `${id}-option-${shown[active].id}`
    : canCreate && active === shown.length
    ? createId
    : undefined;
  const hasError = Boolean(error && !selected);
  const help = selected
    ? `Plantilla vinculada: ${selected.name}. Usá Cambiar para elegir otro modelo.`
    : loading
    ? 'Cargando plantillas.'
    : 'Escribí al menos 2 caracteres y elegí una plantilla de las sugerencias.';

  useEffect(() => {
    if (selected && previousId.current !== selectedId) input.current?.focus();
    if (refocus.current && !selectedId) {
      refocus.current = false;
      input.current?.focus();
      input.current?.select();
    }
    if (!selectedId || selected) previousId.current = selectedId;
  }, [selectedId, selected]);

  useEffect(() => {
    if (expanded && activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, activeId]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function choose(template: AdminTemplate) {
    close();
    onSelect(template);
    input.current?.focus();
  }

  function create() {
    if (!canCreate) return;
    close();
    onCreate?.(query.trim());
  }

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={id} required={required}>
        Modelo del producto
      </FieldLabel>
      <Popover
        open={expanded}
        modal={false}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActive(-1);
        }}
      >
        <PopoverAnchor asChild>
          <div ref={anchor} className="relative">
            <Input
              ref={input}
              id={id}
              role="combobox"
              value={selected?.name ?? query}
              readOnly={Boolean(selected)}
              placeholder="Buscar modelo…"
              autoComplete="off"
              disabled={disabled || (!selected && (loading || failed))}
              aria-required={required}
              aria-invalid={hasError}
              aria-expanded={expanded}
              aria-controls={expanded && optionCount ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={expanded ? activeId : undefined}
              aria-describedby={[
                `${id}-help`,
                description && `${id}-description`,
                hasError && `${id}-error`,
                failed && !selected && `${id}-failure`,
              ]
                .filter(Boolean)
                .join(' ')}
              className={cn(
                selected &&
                  'border-2 border-primary-2 bg-selection pl-10 pr-24 font-semibold text-selection-foreground',
              )}
              onFocus={() => !selected && setOpen(true)}
              onClick={() => !selected && setOpen(true)}
              onChange={(event) => {
                onQueryChange(event.target.value);
                setOpen(true);
                setActive(-1);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || selected) return;
                if (event.key === 'Escape' && expanded) {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
                if (event.key === 'Tab') close();
                if (
                  (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
                  searchable &&
                  optionCount
                ) {
                  event.preventDefault();
                  setOpen(true);
                  setActive((current) =>
                    event.key === 'ArrowDown'
                      ? expanded
                        ? (current + 1) % optionCount
                        : 0
                      : !expanded || current <= 0
                      ? optionCount - 1
                      : current - 1,
                  );
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (expanded && shown[active]) choose(shown[active]);
                  else if (expanded && canCreate && active === shown.length) create();
                  else setOpen(true);
                }
              }}
            />
            {loading && !selected && (
              <Skeleton className="pointer-events-none absolute inset-0 h-11" aria-hidden />
            )}
            {selected && (
              <>
                <HugeIcon
                  icon={CheckmarkBadge01Icon}
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-2"
                />
                <Button
                  type="button"
                  variant="link"
                  disabled={disabled}
                  aria-label={`Cambiar plantilla de ${selected.name}`}
                  className="absolute right-1 top-0 px-3"
                  onClick={() => {
                    refocus.current = true;
                    setOpen(true);
                    setActive(-1);
                    onSelect(null);
                  }}
                >
                  Cambiar
                </Button>
              </>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          role="presentation"
          className="max-h-[min(20rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] gap-0 overflow-y-auto border border-border p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchor.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {shown.length === 0 && (
            <p role="status" className="px-3 py-3 text-xs text-muted-foreground">
              No encontramos una plantilla para «{query.trim()}».
            </p>
          )}
          {optionCount > 0 && (
            <ul id={listId} role="listbox" aria-label="Plantillas encontradas">
              {shown.map((template, index) => (
                <li key={template.id} role="presentation">
                  <Button
                    type="button"
                    variant="ghost"
                    role="option"
                    tabIndex={-1}
                    disabled={disabled}
                    aria-selected={active === index}
                    id={`${id}-option-${template.id}`}
                    className={cn(
                      'h-11 w-full justify-between gap-3 px-3 text-left',
                      active === index &&
                        'border-2 border-primary-2 bg-selection text-selection-foreground',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(template)}
                  >
                    <span className="min-w-0 truncate font-semibold">{template.name}</span>
                    {categoryName(template) && (
                      <span className="max-w-40 truncate text-xs text-muted-foreground">
                        {categoryName(template)}
                      </span>
                    )}
                  </Button>
                </li>
              ))}
              {canCreate && (
                <li role="presentation" className={cn(shown.length > 0 && 'mt-1 border-t pt-1')}>
                  <Button
                    type="button"
                    variant="ghost"
                    role="option"
                    tabIndex={-1}
                    disabled={disabled}
                    aria-selected={active === shown.length}
                    id={createId}
                    className={cn(
                      'h-11 w-full justify-start gap-2 px-3 text-left text-primary-2',
                      active === shown.length &&
                        'border-2 border-primary-2 bg-selection text-selection-foreground',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={create}
                  >
                    <HugeIcon icon={Add01Icon} size={16} aria-hidden />
                    <span className="truncate">Crear plantilla «{query.trim()}»</span>
                  </Button>
                </li>
              )}
            </ul>
          )}
          {matches.length > shown.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Escribí más para acotar las coincidencias.
            </p>
          )}
          {!exact && !onCreate && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Si falta el modelo, creá su plantilla en Inventario → Plantillas.
            </p>
          )}
        </PopoverContent>
      </Popover>
      <p id={`${id}-help`} role="status" className="sr-only">
        {help}
      </p>
      {failed && !selected && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p id={`${id}-failure`} className="text-xs text-muted-foreground">
            No se pudieron cargar las plantillas.
          </p>
          {onRetry && (
            <Button type="button" variant="outline" onClick={onRetry} disabled={disabled}>
              Reintentar
            </Button>
          )}
        </div>
      )}
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`}>{!selected && error}</FieldError>
    </Field>
  );
}
