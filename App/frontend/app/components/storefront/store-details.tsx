// Punto de retiro y horario de atención desde Configuración → Negocio. Es un punto de retiro
// coordinado, no un local abierto al público: así se nombra en toda la tienda.
import { useStoreConfig } from '~/hooks/use-store-config';
import { storeMapsUrl } from '~/lib/store-pages';

export const INFO_LINK =
  'font-medium text-primary-2 underline-offset-4 hover:underline focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function PickupPoint() {
  const config = useStoreConfig();
  const address = config?.address?.trim();
  const mapsUrl = storeMapsUrl(config);
  if (!address) return null;
  return (
    <p>
      <span className="font-medium text-foreground">Punto de retiro: </span>
      {address}
      {mapsUrl && (
        <>
          {' · '}
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={INFO_LINK}>
            Cómo llegar
          </a>
        </>
      )}
    </p>
  );
}

export function BusinessHoursList() {
  const hours = useStoreConfig()?.businessHours ?? [];
  if (hours.length === 0) return null;
  return (
    <dl className="space-y-0.5">
      {hours.map((row) => (
        <div key={row.days} className="flex flex-wrap gap-x-1">
          <dt className="font-medium text-foreground">{row.days}:</dt>
          <dd>{row.hours}</dd>
        </div>
      ))}
    </dl>
  );
}
