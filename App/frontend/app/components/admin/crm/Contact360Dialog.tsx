import {
  FormDialogContent,
  FormBody,
  FormLayout,
  FormActions,
  FormSection,
} from '~/components/ui/form-layout';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
// Ficha 360 (doc 10 §1): un contacto con todo su historial en una pantalla —
// compras (ventas reales + pedidos web), LTV, actividad y seguimientos. Permite
// cambiar la etapa, agregar notas y agendar/cerrar seguimientos.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { formatShortDate } from '~/lib/formatters';

import {
  CONTACT_ORIGIN_LABELS,
  CONTACT_STAGES,
  CONTACT_STAGE_LABELS,
  type ContactOrigin,
  type ContactStage,
} from '@shared/schemas';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { formatCordobas } from '~/lib/formatters';
import {
  useAddContactActivityMutation,
  useCreateFollowUpMutation,
  useGetContact360Query,
  useUpdateContactMutation,
  useUpdateFollowUpMutation,
} from '~/store/api/crmApi';

// La ficha 360 muestra historial, así que acá el año SÍ importa: sin él, una
// actividad de 2025 y una de 2026 se ven iguales.
const fmtDate = (iso: string | null | undefined) => formatShortDate(iso, { withYear: true });

// Mismas reglas que followUpInputSchema del backend (sin contactId: lo pone la ficha).
const followUpFormSchema = z.object({
  scheduledDate: z.string().min(1, 'Elegí una fecha.'),
  reason: z.string().trim().min(1, 'Escribí el motivo.').max(280, 'Máximo 280 caracteres.'),
});
type FollowUpFormValues = z.infer<typeof followUpFormSchema>;

export function Contact360Dialog({ contactId, onClose }: { contactId: string | null; onClose: () => void }) {
  const { data: ficha, isLoading, isError } = useGetContact360Query(contactId ?? '', { skip: !contactId });
  const [updateContact] = useUpdateContactMutation();
  const [addActivity, { isLoading: addingNote }] = useAddContactActivityMutation();
  const [createFollowUp, { isLoading: creatingFu }] = useCreateFollowUpMutation();
  const [updateFollowUp] = useUpdateFollowUpMutation();

  const [note, setNote] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  // Agendar seguimiento: react-hook-form + las reglas de followUpInputSchema.
  const {
    register: registerFu,
    handleSubmit: handleSubmitFu,
    reset: resetFu,
    formState: { errors: fuErrors },
  } = useForm<FollowUpFormValues>({ resolver: zodResolver(followUpFormSchema), defaultValues: { scheduledDate: '', reason: '' } });

  async function handleStage(stage: ContactStage) {
    if (!contactId) return;
    try {
      await updateContact({ id: contactId, data: { stage } }).unwrap();
      toast.success('Etapa actualizada.');
    } catch {
      toast.error('No se pudo actualizar la etapa.');
    }
  }

  async function handleAddNote() {
    if (!contactId || !note.trim()) return;
    try {
      await addActivity({ id: contactId, note: note.trim() }).unwrap();
      setNote('');
      toast.success('Nota agregada.');
    } catch {
      toast.error('No se pudo agregar la nota.');
    }
  }

  const handleAddFollowUp = handleSubmitFu(async (v) => {
    if (!contactId) return;
    setFollowUpError(null);
    try {
      await createFollowUp({ contactId, scheduledDate: v.scheduledDate, reason: v.reason }).unwrap();
      resetFu({ scheduledDate: '', reason: '' });
      toast.success('Seguimiento agendado.');
    } catch (err) {
      setFollowUpError(serverErrorMessage(err, 'No se pudo agendar el seguimiento.'));
    }
  });

  async function setFuStatus(id: string, status: 'completed' | 'cancelled') {
    try {
      await updateFollowUp({ id, data: { status } }).unwrap();
    } catch {
      toast.error('No se pudo actualizar el seguimiento.');
    }
  }

  const pendingFollowUps = ficha?.followUps.filter((f) => f.status === 'pending') ?? [];

  return (
    <Dialog open={!!contactId} onOpenChange={(o) => !o && onClose()}>
      <FormDialogContent size="long">
        <DialogHeader>
          <DialogTitle>{ficha?.contact.name || ficha?.contact.phone || 'Contacto'}</DialogTitle>
          <DialogDescription>Ficha 360: compras, actividad y seguimientos.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : isError || !ficha ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No se pudo cargar el contacto.
          </div>
        ) : (
          <FormBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Teléfono:</span>{' '}
                  {ficha.contact.phone || '—'}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Origen:</span>{' '}
                  {CONTACT_ORIGIN_LABELS[ficha.contact.origin as ContactOrigin] ??
                    ficha.contact.origin}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Alta:</span>{' '}
                  {fmtDate(ficha.contact.createdAt)}
                </p>
                <div className="pt-1">
                  <label
                    htmlFor="contact360-stage"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Etapa
                  </label>
                  <Select
                    value={ficha.contact.stage ?? ''}
                    onValueChange={(v) => handleStage(v as ContactStage)}
                  >
                    <SelectTrigger id="contact360-stage" className="mt-1 w-full">
                      <SelectValue placeholder="Sin etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {CONTACT_STAGE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">LTV (ventas confirmadas)</p>
                <p className="nums text-2xl font-bold text-primary-2">{formatCordobas(ficha.ltv)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ficha.orderCount} pedido{ficha.orderCount === 1 ? '' : 's'} en total
                </p>
              </div>
            </div>

            <FormSection title="Compras e historial">
              {ficha.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pedidos registrados.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {ficha.orders.map((o) => (
                    <li key={`${o.kind}-${o.id}`} className="flex items-center justify-between py-2">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-2xs">
                          {o.kind === 'sale' ? 'Venta' : 'Web'}
                        </Badge>
                        <span className="text-muted-foreground">{o.status}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
                      </span>
                      <span className="nums font-semibold">{formatCordobas(o.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </FormSection>

            <FormSection title="Seguimientos">
              {pendingFollowUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin seguimientos pendientes.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingFollowUps.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between rounded-xl border p-2.5 text-sm"
                    >
                      <span>
                        <span className="font-medium">{fmtDate(f.scheduledDate)}</span> — {f.reason}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Completar"
                          onClick={() => setFuStatus(f.id, 'completed')}
                        >
                          <HugeIcon
                            icon={CheckmarkCircle02Icon}
                            size={16}
                            strokeWidth={2}
                            className="text-primary"
                          />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          aria-label="Cancelar"
                          onClick={() => setFuStatus(f.id, 'cancelled')}
                        >
                          <HugeIcon
                            icon={Cancel01Icon}
                            size={16}
                            strokeWidth={2}
                            className="text-destructive"
                          />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <FormLayout mode="page" onSubmit={handleAddFollowUp} noValidate>
                <FormErrorBanner message={followUpError} />
                <FormBody>
                  <Field className="flex-1" data-invalid={!!fuErrors.scheduledDate}>
                    <FieldLabel htmlFor="contact360-fu-date" required>
                      Fecha
                    </FieldLabel>
                    <Input
                      id="contact360-fu-date"
                      type="date"
                      aria-required
                      aria-invalid={!!fuErrors.scheduledDate}
                      {...registerFu('scheduledDate')}
                    />
                    <FieldError errors={[fuErrors.scheduledDate]} />
                  </Field>
                  <Field className="flex-[2]" data-invalid={!!fuErrors.reason}>
                    <FieldLabel htmlFor="contact360-fu-reason" required>
                      Motivo
                    </FieldLabel>
                    <Input
                      id="contact360-fu-reason"
                      placeholder="Ej. Recordar cotización"
                      aria-required
                      aria-invalid={!!fuErrors.reason}
                      {...registerFu('reason')}
                    />
                    <FieldError errors={[fuErrors.reason]} />
                  </Field>
                </FormBody>
                <FormActions>
                  <Button type="submit" disabled={creatingFu}>
                    {creatingFu && <Spinner className="mr-2" />}
                    {creatingFu ? 'Guardando…' : 'Agendar seguimiento'}
                  </Button>
                </FormActions>
              </FormLayout>
            </FormSection>

            <FormSection title="Actividad">
              <div className="flex gap-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Agregar una nota…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  aria-label="Agregar nota"
                  variant="outline"
                  onClick={handleAddNote}
                  disabled={addingNote || !note.trim()}
                >
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
              {ficha.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin actividad.</p>
              ) : (
                <ul className="space-y-2">
                  {ficha.activities.map((a) => (
                    <li key={a.id} className="rounded-xl border p-2.5 text-sm">
                      <p className="whitespace-pre-wrap">{a.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDate(a.createdAt)}
                        {a.type ? ` · ${a.type}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </FormSection>
          </FormBody>
        )}
      </FormDialogContent>
    </Dialog>
  );
}
