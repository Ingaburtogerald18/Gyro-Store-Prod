// Configuración: orquestador delgado. Cada pestaña vive en components/admin/config/
// (General, Finanzas/Variables, Categorías, Imágenes/Recursos); acá solo se elige
// cuál mostrar.
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { PageHeader } from '~/components/layout/PageHeader';
import { SegmentedControl } from '~/components/admin/workspace';
import { GeneralConfig } from '~/components/admin/config/GeneralConfig';
import { FinanzasConfig } from '~/components/admin/config/FinanzasConfig';
import { ImagesConfig } from '~/components/admin/config/ImagesConfig';

// Sin esto la pestaña del navegador mostraba la URL: era la única sección
// del panel sin título.
export const meta: MetaFunction = () => [{ title: pageTitle('Configuración', { admin: true }) }];

type Tab = 'general' | 'variables' | 'recursos';

export default function AdminConfiguracion() {
  const [currentTab, setCurrentTab] = useState<Tab>('general');

  // `max-w-4xl`: son formularios; a todo el ancho los campos quedan enormes.
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="Configuración"
        description="Parámetros del negocio que usan la tienda, las facturas y los cálculos."
        className="mb-0"
      />

      <SegmentedControl
        label="Sección de configuración"
        value={currentTab}
        onChange={setCurrentTab}
        options={[
          { value: 'general', label: 'Negocio' },
          { value: 'variables', label: 'Finanzas' },
          { value: 'recursos', label: 'Imágenes' },
        ]}
      />

      <div>
        {currentTab === 'general' && <GeneralConfig />}
        {currentTab === 'variables' && <FinanzasConfig />}
        {currentTab === 'recursos' && <ImagesConfig />}
      </div>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
