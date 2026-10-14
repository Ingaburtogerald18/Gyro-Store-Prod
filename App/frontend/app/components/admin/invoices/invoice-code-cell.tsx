import { HugeIcon } from '~/components/ui/icon';
import { Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { toast } from 'sonner';

import { cn } from '~/lib/utils';

/** Copiar el número evita errores al tipearlo en Ventas. `stopPropagation`: la fila puede abrir el detalle. */
export function InvoiceCodeCell({ code, bold }: { code: string; bold?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`${code} copiado.`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // `navigator.clipboard` no existe fuera de HTTPS/localhost.
      toast.error('El navegador no permitió copiar. Seleccionalo a mano.');
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('font-mono', bold && 'font-medium')}>{code}</span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copiar número de factura"
        aria-label={`Copiar ${code}`}
        className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <HugeIcon
          icon={copied ? Tick01Icon : Copy01Icon}
          size={14}
          strokeWidth={2}
          className={cn(copied && 'text-foreground')}
        />
      </button>
    </span>
  );
}
