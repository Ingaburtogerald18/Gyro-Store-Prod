import * as React from "react"
import { HugeIcon } from "~/components/ui/icon"
import { CheckmarkBadge01Icon } from "@hugeicons/core-free-icons"

import { Input } from "~/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/ui/popover"

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
  /** Contenido extra a la derecha de cada sugerencia (stock, código, precio…). */
  renderOptionMeta?: (option: string) => React.ReactNode;
  /**
   * Texto ADICIONAL contra el que buscar, además del propio nombre de la opción
   * (códigos de lote, SKU…). Sirve para que tipear `GS-047` encuentre el
   * producto aunque su nombre no contenga esa cadena.
   */
  getSearchText?: (option: string) => string;
  /** Mensaje cuando no hay ninguna sugerencia. */
  emptyMessage?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  id,
  "aria-invalid": ariaInvalid,
  disabled,
  renderOptionMeta,
  getSearchText,
  emptyMessage = 'No hay sugerencias.',
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  // Filtrado manual: matchea contra el nombre de la opción Y contra el texto
  // extra que provea el consumidor (códigos de lote, SKU…). Con el campo
  // vacío (recién enfocado, sin tipear nada) se listan TODAS las opciones —
  // es lo que deja "hacer click y ver todo" sin forzar a escribir primero.
  const visibleOptions = React.useMemo(() => {
    if (!value.trim()) return options.slice(0, 40)
    const lower = value.toLowerCase()
    return options
      .filter((o) => {
        if (o.toLowerCase().includes(lower)) return true
        const extra = getSearchText?.(o)
        return extra ? extra.toLowerCase().includes(lower) : false
      })
      .slice(0, 40)
  }, [options, value, getSearchText])

  // Al enfocar o hacer clic se abre siempre, aunque el valor ya sea una opción:
  // así se puede reabrir para cambiarla.
  const showOptions = visibleOptions.length > 0 && open;

  return (
    // `PopoverAnchor` y NO `PopoverTrigger`.
    //
    // El trigger de Radix se apropia del foco y del teclado del elemento que
    // envuelve: dentro de un Dialog (que además monta su propio focus trap) eso
    // hacía que el input perdiera el cursor apenas se abría la lista y no se
    // pudiera seguir escribiendo. El anchor solo aporta la posición: el input
    // queda como un input común y la apertura la maneja este componente.
    <Popover open={showOptions} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id={id}
            value={value}
            onChange={(e) => {
               onChange(e.target.value);
               setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Además de `onFocus`: si el input YA estaba enfocado (por
            // ejemplo, se acaba de cerrar la lista con Escape) un click ahí
            // no dispara foco de nuevo, y sin esto el click no hacía nada.
            onClick={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            role="combobox"
            autoComplete="off"
            className="w-full"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0" 
        align="start" 
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList id={id ? `${id}-listbox` : undefined}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <span className="truncate flex-1">{option}</span>
                  {renderOptionMeta?.(option)}
                  {value === option && (
                    <HugeIcon icon={CheckmarkBadge01Icon} size={16} className="shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
