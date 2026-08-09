// CRM y clientes (Fase CRM-A, doc 10): Agenda de seguimientos + directorio de
// contactos con Ficha 360. El inbox/bot de WhatsApp (CRM-B/C) llega cuando se
// conecte la Cloud API de Meta.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Cancel01Icon, CheckmarkCircle02Icon, Search01Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { formatShortDate } from '~/lib/formatters';
import { toast } from 'sonner';

import {
  CONTACT_ORIGINS,
  CONTACT_ORIGIN_LABELS,
  CONTACT_STAGE_LABELS,
  type ContactOrigin,
  type ContactStage,
} from '@shared/schemas';
import { PageHeader } from '~/components/layout/PageHeader';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { QueryState } from '~/components/ui/QueryState';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import {
  useCreateContactMutation,
  useGetContactsQuery,
  useGetFollowUpsQuery,
  useUpdateFollowUpMutation,
} from '~/store/api/crmApi';
import { Contact360Dialog } from '~/components/admin/crm/Contact360Dialog';

export const meta: MetaFunction = () => [{ title: pageTitle('CRM y clientes', { admin: true }) }];

const TODAY = new Date().toISOString().slice(0, 10);


export default function AdminCrm() {
  const [tab, setTab] = useState('agenda');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="CRM y clientes"
        description="Seguimientos del día y la ficha completa de cada cliente. (El chat de WhatsApp llega en una fase posterior.)"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="agenda" className="data-[state=active]:bg-muted">Agenda</TabsTrigger>
          <TabsTrigger value="contactos" className="data-[state=active]:bg-muted">Contactos</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="outline-none">
          <AgendaTab onOpen={setSelected} />
        </TabsContent>

        <TabsContent value="contactos" className="space-y-4 outline-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono…"
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)} className="h-10 font-bold">
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
              Nuevo contacto
            </Button>
          </div>
          <ContactsTab search={search} onOpen={setSelected} />
        </TabsContent>
      </Tabs>

      <Contact360Dialog contactId={selected} onClose={() => setSelected(null)} />
      <CreateContactDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={setSelected} />
    </div>
  );
}

function AgendaTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: followUps = [], isLoading, isError, refetch } = useGetFollowUpsQuery({ status: 'pending' });
  const [updateFollowUp] = useUpdateFollowUpMutation();

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
      loadingFallback={<div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-card" />)}</div>}
      emptyFallback={
        <Card className="border-dashed bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <HugeIcon icon={CheckmarkCircle02Icon} size={40} strokeWidth={2} className="mb-3 text-primary" />
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
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-card border bg-card p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(f.contactId)}>
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{f.contactName || f.contactPhone || 'Contacto'}</span>
                  {overdue ? (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">Vencido</Badge>
                  ) : isToday ? (
                    <Badge variant="outline" className="border-primary/40 text-primary">Hoy</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatShortDate(f.scheduledDate)}</span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">{f.reason}</p>
              </button>
              <span className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label="Completar" onClick={() => setStatus(f.id, 'completed')}>
                  <HugeIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={2} className="text-primary" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setStatus(f.id, 'cancelled')}>
                  <HugeIcon icon={Cancel01Icon} size={18} strokeWidth={2} className="text-destructive" />
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
      loadingFallback={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-card" />)}</div>}
      emptyFallback={
        <Card className="border-dashed bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <HugeIcon icon={UserMultiple02Icon} size={40} strokeWidth={2} className="mb-3 text-muted-foreground" />
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
            className="flex flex-col items-start gap-1 rounded-card border bg-card p-4 text-left transition-colors hover:border-primary/40"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate font-semibold text-foreground">{c.name || c.phone || 'Contacto'}</span>
              {c.stage && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {CONTACT_STAGE_LABELS[c.stage as ContactStage] ?? c.stage}
                </Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{c.phone || 'Sin teléfono'}</span>
            <span className="text-[11px] text-muted-foreground">
              {CONTACT_ORIGIN_LABELS[c.origin as ContactOrigin] ?? c.origin}
            </span>
          </button>
        ))}
      </div>
    </QueryState>
  );
}

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
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<ContactOrigin>('other');

  async function handleCreate() {
    if (phone.trim().length < 6) {
      toast.error('Ingresá un teléfono válido.');
      return;
    }
    try {
      const contact = await createContact({ phone: phone.trim(), name: name.trim(), origin }).unwrap();
      toast.success('Contacto creado.');
      setPhone('');
      setName('');
      setOrigin('other');
      onClose();
      onCreated(contact.id);
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo crear el contacto.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
          <DialogDescription>El teléfono es la identidad del contacto. Si ya existe, se abre el que hay.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8888 8888" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre (opcional)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Origen</label>
            <Select value={origin} onValueChange={(v) => setOrigin(v as ContactOrigin)}>
              <SelectTrigger className="w-full">
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
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={isLoading}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
