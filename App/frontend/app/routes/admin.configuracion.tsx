// Configuración: cada pestaña vive en components/admin/config/; acá solo se elige cuál mostrar.
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { PageHeader } from '~/components/admin/page-header';
import { SegmentedControl } from '~/components/admin/workspace';
import { GeneralConfig } from '~/components/admin/config/general-config';
import { FinanzasConfig } from '~/components/admin/config/finanzas-config';
import { ImagesConfig } from '~/components/admin/config/images-config';
import { AttentionConfig } from '~/components/admin/config/attention-config';

// Sin esto la pestaña del navegador mostraba la URL: era la única sección
// del panel sin título.
export const meta: MetaFunction = () => [{ title: pageTitle('Configuración', { admin: true }) }];

type Tab = 'general' | 'atencion' | 'variables' | 'recursos';

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
          { value: 'atencion', label: 'Atención' },
          { value: 'variables', label: 'Finanzas' },
          { value: 'recursos', label: 'Imágenes' },
        ]}
      />

      <div>
        {currentTab === 'general' && <GeneralConfig />}
        {currentTab === 'atencion' && <AttentionConfig />}
        {currentTab === 'variables' && <FinanzasConfig />}
        {currentTab === 'recursos' && <ImagesConfig />}
      </div>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/route-error';
