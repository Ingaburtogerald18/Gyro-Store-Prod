// Configuración: orquestador delgado. Cada pestaña vive en components/admin/config/
// (General, Finanzas/Variables, Categorías, Imágenes/Recursos); acá solo se elige
// cuál mostrar.
import { useState } from 'react';
import { AnimatedTabs } from '~/components/ui/AnimatedTabs';
import { GeneralConfig } from '~/components/admin/config/GeneralConfig';
import { FinanzasConfig } from '~/components/admin/config/FinanzasConfig';
import { ImagesConfig } from '~/components/admin/config/ImagesConfig';

export default function AdminConfiguracion() {
  const [currentTab, setCurrentTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'variables', label: 'Variables' },
    { id: 'recursos', label: 'Recursos' },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-20 pt-4 animate-in fade-in zoom-in-95 duration-200">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">Parámetros del negocio editables desde la UI.</p>
      </div>

      <AnimatedTabs
        items={tabs}
        value={currentTab}
        onChange={setCurrentTab}
        layoutId="config-tabs"
      />

      <div className="mt-6">
        {currentTab === 'general' && <GeneralConfig />}
        { currentTab === 'variables' && <FinanzasConfig />}
        { currentTab === 'recursos' && <ImagesConfig />}
      </div>
    </div>
  );
}
