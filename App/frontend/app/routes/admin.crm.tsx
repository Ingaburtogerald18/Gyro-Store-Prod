import { FormLayout, FormDialogContent, FormActions, FormBody } from '~/components/ui/form-layout';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
// CRM y clientes (fase CRM-A): Agenda de seguimientos + directorio de
// contactos con Ficha 360. El inbox/bot de WhatsApp (CRM-B/C) llega cuando se
// conecte la Cloud API de Meta.
import { HugeIcon } from '~/components/ui/icon';
import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { formatLongDate } from '~/lib/formatters';
import { toast } from 'sonner';

import {
  adminContactInputSchema,
  CONTACT_ORIGINS,
  CONTACT_ORIGIN_LABELS,
  CONTACT_STAGE_LABELS,
  type ContactOrigin,
  type ContactStage,
} from '@shared/schemas';
import { PageHeader } from '~/components/admin/page-header';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Spinner } from '~/components/ui/spinner';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { QueryState } from '~/components/ui/query-state';
import { StatusBadge } from '~/components/ui/status-badge';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  useCreateContactMutation,
  useGetContactsQuery,
  useGetFollowUpsQuery,
  useUpdateFollowUpMutation,
} from '~/state/api/crm-api';
import {
  Kbd,
  SegmentedControl,
  ToolbarSearch,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import { Contact360Dialog } from '~/components/admin/crm/contact-360-dialog';

export const meta: MetaFunction = () => [{ title: pageTitle('CRM y clientes', { admin: true }) }];

const TODAY = new Date().toISOString().slice(0, 10);


export default function AdminCrm() {
  const [tab, setTab] = useState('agenda');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useShortcut('n', () => setCreateOpen(true));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="CRM y clientes"
        description="Seguimientos del día y la ficha completa de cada cliente."
        className="mb-0"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 gap-2 rounded-xl">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            Nuevo contacto
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Vista"
            value={tab as 'agenda' | 'contactos'}
            onChange={setTab}
            options={[
              { value: 'agenda', label: 'Agenda' },
              { value: 'contactos', label: 'Contactos' },
            ]}
          />
          {tab === 'contactos' && (
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nombre o teléfono" />
          )}
        </WorkspaceToolbar>
        <div>
          {tab === 'agenda' ? <AgendaTab onOpen={setSelected} /> : <ContactsTab search={search} onOpen={setSelected} />}
        </div>
      </Workspace>

      <Contact360Dialog contactId={selected} onClose={() => setSelected(null)} />
      <CreateContactDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={setSelected} />
    </div>
  );
}

function AgendaTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: pending = [], isLoading, isError, refetch } = useGetFollowUpsQuery({ status: 'pending' });
  const [updateFollowUp] = useUpdateFollowUpMutation();
  // Los avisos de la tienda cuya variante ya llegó van primero: hay que escribirles.
  const followUps = [...pending].sort((a, b) => Number(!!b.stockNotice?.arrived) - Number(!!a.stockNotice?.arrived));

  async function setStatus(id: string, status: 'completed' | 'cancelled') {
    try {
      await updateFollowUp({ id, data: { status } }).unwrap();
    } catch {
      toast.error('No se pudo actualizar el seguimiento.');
    }
  }

  return (
    <QueryState
      loading={isLoading}
      error={isError}
      empty={followUps.length === 0}
      errorMessage="No se pudo cargar la agenda."
      onRetry={refetch}
      shape="list"
      emptyFallback={
        <Card className="rounded-2xl border-dashed bg-card shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <HugeIcon icon={CheckmarkCircle02Icon} size={32} strokeWidth={2} className="mb-3 text-foreground" />
            <h3 className="text-lg font-medium text-foreground">Nada pendiente</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">No hay seguimientos por hacer. Agendá uno desde la ficha de un cliente.</p>
          </CardContent>
        </Card>
      }
    >
      <ul className="space-y-2">
        {followUps.map((f) => {
          const overdue = !!f.scheduledDate && f.scheduledDate < TODAY;
          const isToday = f.scheduledDate === TODAY;
          return (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(f.contactId)}>
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{f.contactName || f.contactPhone || 'Contacto'}</span>
                  {f.stockNotice ? (
                    <StatusBadge
                      status={f.stockNotice.arrived ? 'success' : 'neutral'}
                      label={f.stockNotice.arrived ? 'Ya llegó, avisar' : 'Esperando que llegue'}
                    />
                  ) : overdue ? (
                    <Badge variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 text-destructive">
                      Vencido · {formatLongDate(f.scheduledDate)}
                    </Badge>
                  ) : isToday ? (
                    <Badge variant="outline" className="rounded-full border-info/30 bg-info/10 text-info">Hoy</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatLongDate(f.scheduledDate)}</span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">{f.reason}</p>
              </button>
              {/* Acciones con texto: dos íconos chicos (✓ y ✕) para dos acciones
                  opuestas eran fáciles de confundir. */}
              <span className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-xl" onClick={() => setStatus(f.id, 'completed')}>
                  <HugeIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={2} className="text-foreground" aria-hidden />
                  Hecho
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-xl text-muted-foreground" onClick={() => setStatus(f.id, 'cancelled')}>
                  <HugeIcon icon={Cancel01Icon} size={15} strokeWidth={2} aria-hidden />
                  Descartar
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </QueryState>
  );
}

function ContactsTab({ search, onOpen }: { search: string; onOpen: (id: string) => void }) {
  const { data: contacts = [], isLoading, isError, refetch } = useGetContactsQuery(
    search.trim() ? { search: search.trim() } : undefined,
  );

  return (
    <QueryState
      loading={isLoading}
      error={isError}
      empty={contacts.length === 0}
      errorMessage="No se pudieron cargar los contactos."
      onRetry={refetch}
      shape="card"
      emptyFallback={
        <Card className="rounded-2xl border-dashed bg-card shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <HugeIcon icon={UserMultiple02Icon} size={32} strokeWidth={2} className="mb-3 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">Sin contactos</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Los pedidos web y el formulario de contacto crean contactos solos, o agregá uno a mano.</p>
          </CardContent>
        </Card>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="flex flex-col items-start gap-1 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate font-semibold text-foreground">{c.name || c.phone || 'Contacto'}</span>
              {c.stage && (
                <Badge variant="outline" className="shrink-0 text-2xs">
                  {CONTACT_STAGE_LABELS[c.stage as ContactStage] ?? c.stage}
                </Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{c.phone || 'Sin teléfono'}</span>
            <span className="text-2xs text-muted-foreground">
              {CONTACT_ORIGIN_LABELS[c.origin as ContactOrigin] ?? c.origin}
            </span>
          </button>
        ))}
      </div>
    </QueryState>
  );
}

// Mismas reglas que adminContactInputSchema (el teléfono es la identidad del
// contacto). Los errores van debajo de cada campo; el toast, al resultado.
const contactFormSchema = adminContactInputSchema.pick({ phone: true, name: true, origin: true }).extend({
  phone: z.string().trim().min(6, 'Escribí un teléfono válido (al menos 6 dígitos).').max(20, 'Máximo 20 caracteres.'),
  name: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  origin: z.enum(CONTACT_ORIGINS),
});
type ContactValues = z.input<typeof contactFormSchema>;
type ContactOutput = z.output<typeof contactFormSchema>;
const EMPTY_CONTACT: ContactValues = { phone: '', name: '', origin: 'other' };

function CreateContactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [createContact, { isLoading }] = useCreateContactMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactValues, unknown, ContactOutput>({ resolver: zodResolver(contactFormSchema), defaultValues: EMPTY_CONTACT });

  useEffect(() => {
    if (open) { reset(EMPTY_CONTACT); setServerError(null); }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const contact = await createContact({ phone: v.phone, name: v.name, origin: v.origin }).unwrap();
      toast.success('Contacto creado.');
      onClose();
      onCreated(contact.id);
    } catch (error) {
      setServerError(serverErrorMessage(error, 'No se pudo crear el contacto.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <FormDialogContent>
        <FormLayout onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Crear contacto</DialogTitle>
            <DialogDescription>
              El teléfono es la identidad del contacto. Si ya existe, se abre el que hay.
            </DialogDescription>
          </DialogHeader>
          <FormErrorBanner message={serverError} />
          <FormBody>
            <div className="grid gap-4">
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="crm-new-phone" required>
                  Teléfono
                </FieldLabel>
                <Input
                  id="crm-new-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="8888 8888"
                  aria-required
                  aria-invalid={!!errors.phone}
                  {...register('phone')}
                />
                <FieldError errors={[errors.phone]} />
              </Field>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="crm-new-name">Nombre (opcional)</FieldLabel>
                <Input
                  id="crm-new-name"
                  placeholder="Juan Pérez"
                  aria-invalid={!!errors.name}
                  {...register('name')}
                />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="crm-new-origin">Origen</FieldLabel>
                <Controller
                  control={control}
                  name="origin"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="crm-new-origin" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_ORIGINS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {CONTACT_ORIGIN_LABELS[o]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </FormBody>
          <FormActions>
            <Button type="button" variant="cancel" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Crear contacto
            </Button>
          </FormActions>
        </FormLayout>
      </FormDialogContent>
    </Dialog>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/route-error';
