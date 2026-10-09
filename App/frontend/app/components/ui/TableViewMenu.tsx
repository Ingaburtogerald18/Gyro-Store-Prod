import { useState } from 'react';
import { useLocalPreference } from '~/hooks/useLocalPreference';
import { isTableView, type TableView } from '~/lib/ui-preferences';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu';

const isOptionalView = (value: unknown): value is TableView | null => value === null || isTableView(value);

/** A view is explicit: opening a table never silently restores an old search. */
export function TableViewMenu({ tableId, current, onApply }: { tableId: string; current: TableView; onApply: (view: TableView) => void }) {
  const [saved, setSaved] = useLocalPreference<TableView | null>(`gyro.table.${tableId}.view`, null, isOptionalView);
  const [message, setMessage] = useState('');
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="outline">Mi vista</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="whitespace-normal text-xs font-normal text-muted-foreground">Guarda {current.search === undefined ? 'orden y columnas' : 'búsqueda, orden y columnas'} de esta tabla en este navegador. Los filtros del módulo se manejan por separado.</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!saved} onSelect={() => { if (saved) { onApply(saved); setMessage('Vista aplicada.'); } }}>Aplicar vista guardada</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setSaved(current); setMessage('Vista guardada.'); }}>{saved ? 'Actualizar vista guardada' : 'Guardar vista actual'}</DropdownMenuItem>
          <DropdownMenuItem disabled={!saved} onSelect={() => { setSaved(null); setMessage('Vista guardada eliminada.'); }}>Eliminar vista guardada</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" role="status">{message}</span>
    </>
  );
}
