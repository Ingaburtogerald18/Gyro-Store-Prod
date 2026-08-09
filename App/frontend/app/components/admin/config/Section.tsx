// Envoltura de sección para la vista de Configuración (extraída de
// admin.configuracion.tsx). Card con título + descripción; la comparten las
// tres pestañas (General, Finanzas, Imágenes).
import { Card, CardContent } from "~/components/ui/card";

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col bg-card border shadow-sm overflow-hidden ${className || ''}`}>
      <div className="p-6 pb-4">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <CardContent className="flex-1 p-6 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}
