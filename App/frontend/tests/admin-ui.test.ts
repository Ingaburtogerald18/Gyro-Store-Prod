import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { allowedNavGroups, currentNavItem } from '../app/lib/admin-navigation';
import { decodePreference, isDensity, isStringList, isTableView, isVisibility } from '../app/lib/ui-preferences';
import { useLocalPreference } from '../app/hooks/useLocalPreference';
import { DataTable } from '../app/components/ui/DataTable';
import { orderExpansionReducer, orderIsExpanded } from '../app/lib/orderExpansion';
import { OrderAccordion } from '../app/components/admin/inventory/OrderAccordion';

test('las órdenes se abren independientemente y los controles globales reinician las excepciones', () => {
  let state = { all: false, exceptions: {} };
  state = orderExpansionReducer(state, { type: 'toggle', id: 'order:1' });
  state = orderExpansionReducer(state, { type: 'toggle', id: 'order:2' });
  assert.equal(orderIsExpanded(state, 'order:1'), true);
  assert.equal(orderIsExpanded(state, 'order:2'), true);
  assert.equal(orderIsExpanded(state, 'order:3'), false);
  state = orderExpansionReducer(state, { type: 'all', open: true });
  state = orderExpansionReducer(state, { type: 'toggle', id: 'order:2' });
  assert.equal(orderIsExpanded(state, 'order:1'), true);
  assert.equal(orderIsExpanded(state, 'order:2'), false);
  assert.equal(orderIsExpanded(state, 'order:3'), true);
  state = orderExpansionReducer(state, { type: 'all', open: false });
  assert.equal(orderIsExpanded(state, 'order:1'), false);
  assert.equal(orderIsExpanded(state, 'order:2'), false);
});

test('el acordeón inicia cerrado con su resumen y acciones; una búsqueda muestra los productos', () => {
  const panels = [{ id: 'order:1', label: 'Orden 1', summary: 'Proveedor · 4 productos · USD 120', toolbar: createElement('button', null, 'Acciones de la orden'), details: createElement('p', null, 'Producto encontrado') }];
  const closed = renderToString(createElement(OrderAccordion, { panels }));
  assert.match(closed, /Proveedor · 4 productos · USD 120/);
  assert.match(closed, /Acciones de la orden/);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /aria-controls="([^"]+)-details"/);
  assert.doesNotMatch(closed, /Producto encontrado/);
  const searching = renderToString(createElement(OrderAccordion, { panels, searching: true }));
  assert.match(searching, /aria-expanded="true"/);
  assert.match(searching, /Producto encontrado/);
});

test('la búsqueda de módulos conserva el acceso de cada rol', () => {
  const seller = allowedNavGroups(false, 'seller').flatMap((group) => group.items.map((item) => item.name));
  assert.deepEqual(seller.sort(), ['Mis Facturas', 'Ventas', 'Pedidos web', 'Catálogo', 'Personal', 'CRM y clientes'].sort());
  assert.ok(!seller.includes('Inventario'));
  assert.ok(seller.includes('Pedidos web'));
  const admin = allowedNavGroups(true, 'admin').flatMap((group) => group.items);
  assert.ok(admin.some((item) => item.name === 'Inventario'));
  assert.ok(!admin.some((item) => item.name === 'Mis Facturas'));
  assert.equal(currentNavItem('/admin/inventario/entrada', admin)?.name, 'Inventario');
  assert.equal(currentNavItem('/admin/inventario-falso', admin), undefined);
});

test('las preferencias antiguas o corruptas no rompen el panel', () => {
  assert.equal(decodePreference('compact', 'normal', isDensity), 'compact');
  assert.equal(decodePreference('"compact"', 'normal', isDensity), 'compact');
  assert.equal(decodePreference('{mal json', 'normal', isDensity), 'normal');
  assert.deepEqual(decodePreference('["/admin", 1]', [], isStringList), []);
  for (const value of [null, [], 'hidden', { price: 'false' }]) assert.equal(isVisibility(value), false);
  assert.equal(isVisibility({ price: false }), true);
  for (const value of [null, {}, { columns: {}, sorting: [null] }, { columns: {}, sorting: [{ id: 'price', desc: 'yes' }] }]) assert.equal(isTableView(value), false);
  assert.equal(isTableView({ columns: { price: true }, sorting: [{ id: 'price', desc: true }], search: 'texto' }), true);
  assert.equal(isTableView({ columns: {}, sorting: [] }), true); // Búsqueda controlada por el módulo.
});

test('el HTML inicial de preferencias coincide aun con almacenamiento bloqueado', () => {
  function Preference() {
    const [density] = useLocalPreference('gyro.table.density', 'normal', isDensity);
    return createElement('span', null, density);
  }
  const initial = renderToString(createElement(Preference));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { get localStorage() { throw new Error('Storage bloqueado'); } } });
  try { assert.equal(renderToString(createElement(Preference)), initial); }
  finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('selección con id cero y búsquedas externas mantienen controles honestos', () => {
  const html = renderToString(createElement(DataTable<{ id: number; name: string }>, {
    data: [{ id: 0, name: 'Ejemplo' }], columns: [{ accessorKey: 'name', header: 'Nombre' }],
    selectedRowId: 0, onRowClick() {}, globalFilterValue: 'Ejemplo', hideSearch: true,
  }));
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /Abrir fila/);
  assert.match(html, /Búsqueda del módulo/);
  assert.doesNotMatch(html, /Quitar búsqueda|Limpiar filtros/);
});
