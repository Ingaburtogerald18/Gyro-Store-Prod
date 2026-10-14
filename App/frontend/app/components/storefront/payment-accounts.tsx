// Cuentas bancarias de la tienda, cargadas en Configuración → General. Sin
// ninguna no se muestra: una sección vacía parece que no se aceptan transferencias.
import { useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { CreditCardIcon, Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { useGetConfigQuery, type StoreBankAccount } from '~/state/api/session-api';

const CURRENCY_LABELS: Record<string, string> = {
  NIO: 'Córdobas',
  USD: 'Dólares',
};

function AccountRow({ account }: { account: StoreBankAccount }) {
  const [copied, setCopied] = useState(false);

  // El número de cuenta se copia con un botón y no se deja para seleccionar a
  // mano: en el celular —que es de donde viene casi todo el tráfico— seleccionar
  // veinte dígitos sin equivocarse es incómodo, y un dígito de más manda la
  // transferencia a otro lado.
  async function copy() {
    try {
      await navigator.clipboard.writeText(account.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o contexto no seguro) no pasa nada: el
      // número está a la vista y se puede copiar a mano.
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {account.bank}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {CURRENCY_LABELS[account.currency] ?? account.currency}
          </span>
        </p>
        {/* `tabular-nums` para que los dígitos tengan ancho fijo: un número de
            cuenta con ancho variable es más difícil de cotejar contra el que uno
            está tipeando en la app del banco. */}
        <p className="mt-0.5 break-all font-mono text-sm tabular-nums text-muted-foreground">
          {account.number}
        </p>
        {account.holder && (
          <p className="mt-0.5 text-xs text-muted-foreground">A nombre de {account.holder}</p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={copy}
        aria-label={`Copiar el número de cuenta de ${account.bank}`}
      >
        <HugeIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          size={16}
          strokeWidth={2}
          className={copied ? 'text-foreground' : undefined}
        />
        <span className="ml-1.5 text-xs">{copied ? 'Copiado' : 'Copiar'}</span>
      </Button>
    </li>
  );
}

export function PaymentAccounts({ className }: { className?: string }) {
  const { data: config } = useGetConfigQuery();
  const accounts = config?.bankAccounts ?? [];

  if (accounts.length === 0) return null;

  return (
    <div className={className}>
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        <HugeIcon icon={CreditCardIcon} size={18} strokeWidth={2} aria-hidden />
        Formas de pago
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Podés depositar o transferir a cualquiera de estas cuentas. Mandanos el comprobante por
        WhatsApp para coordinar la entrega.
      </p>

      <ul className="mt-3">
        {accounts.map((account, i) => (
          <AccountRow key={`${account.bank}-${account.number}-${i}`} account={account} />
        ))}
      </ul>
    </div>
  );
}
