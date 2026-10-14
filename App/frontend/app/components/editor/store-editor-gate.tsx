// Entrada al modo edición: un admin a la vez. Toma el bloqueo, manda el latido
// y lo suelta al salir, a los 15 minutos sin actividad o al cerrar la pestaña.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { LockedIcon } from '@hugeicons/core-free-icons';
import type { EditorEntry, EditorLockHolder, StoreDraftInput } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { serverErrorMessage } from '~/components/ui/form-feedback';
import { HugeIcon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { formatNicaraguaDateTime } from '~/lib/formatters';
import {
  editorHolderOf,
  isEditorLockLost,
  refreshEditorToken,
  releaseStoreEditor,
  useEnterStoreEditorMutation,
  useSendEditorHeartbeatMutation,
} from '~/state/api/store-editor-api';
import { useAppDispatch } from '~/state/hooks';
import { toggleEditMode } from '~/state/slices/auth-slice';
import { clearBuilderSession } from '~/state/slices/builder-slice';
import { LandingEditor } from './landing-editor';

const TICK_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const IDLE_WARNING_MS = 13 * 60_000;
const IDLE_CLOSE_MS = 15 * 60_000;
const BUSY_RETRY_MS = 30_000;

/** Cambio del borrador que todavía no llegó al servidor. */
export type PendingDraft = Omit<StoreDraftInput, 'session'>;
export type PendingDraftRef = MutableRefObject<PendingDraft | null>;

type GateState =
  | { kind: 'entering' }
  | { kind: 'busy'; holder: EditorLockHolder }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entry: EditorEntry };

export function StoreEditorGate() {
  const dispatch = useAppDispatch();
  const session = useMemo(() => crypto.randomUUID(), []);
  const [enter] = useEnterStoreEditorMutation();
  const [state, setState] = useState<GateState>({ kind: 'entering' });
  const [lost, setLost] = useState<string | null>(null);
  const pendingDraft = useRef<PendingDraft | null>(null);

  const leave = useCallback(() => {
    dispatch(clearBuilderSession());
    dispatch(toggleEditMode());
  }, [dispatch]);

  const attempt = useCallback(async () => {
    await refreshEditorToken();
    try {
      const entry = await enter(session).unwrap();
      setState({ kind: 'ready', entry });
    } catch (err) {
      const holder = editorHolderOf(err);
      setState(
        holder
          ? { kind: 'busy', holder }
          : { kind: 'error', message: serverErrorMessage(err, 'No se pudo abrir el editor.') },
      );
    }
  }, [enter, session]);

  useEffect(() => {
    void attempt();
  }, [attempt]);

  useEffect(() => {
    if (state.kind !== 'busy') return;
    const timer = setInterval(() => void attempt(), BUSY_RETRY_MS);
    return () => clearInterval(timer);
  }, [state.kind, attempt]);

  const { idleWarning, keepEditing } = useEditorLock({
    session,
    enabled: state.kind === 'ready' && !lost,
    pendingDraft,
    onLost: setLost,
    onIdle: () => {
      leave();
      toast.info('Se cerró el editor por 15 minutos sin actividad', {
        description: 'Tu borrador quedó guardado.',
      });
    },
  });

  if (state.kind !== 'ready') return <EditorWaitScreen state={state} onRetry={attempt} onBack={leave} />;

  return (
    <>
      <LandingEditor session={session} entry={state.entry} pendingDraft={pendingDraft} onLockLost={setLost} />
      <Dialog open={idleWarning && !lost} onOpenChange={(open) => !open && keepEditing()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Seguís editando?</DialogTitle>
            <DialogDescription>
              Pasaron 13 minutos sin cambios. Si no seguís, a los 15 el editor se cierra y otro
              administrador puede entrar. Tu borrador queda guardado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="cancel" onClick={leave}>
              Salir del editor
            </Button>
            <Button onClick={keepEditing}>Seguir editando</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={lost !== null}>
        <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Se cerró el editor</DialogTitle>
            <DialogDescription>{lost}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={leave}>Volver a la tienda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useEditorLock({
  session,
  enabled,
  pendingDraft,
  onLost,
  onIdle,
}: {
  session: string;
  enabled: boolean;
  pendingDraft: PendingDraftRef;
  onLost: (message: string) => void;
  onIdle: () => void;
}) {
  const [beat] = useSendEditorHeartbeatMutation();
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastBeat = useRef(Date.now());
  const callbacks = useRef({ onLost, onIdle });
  callbacks.current = { onLost, onIdle };

  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now();
    };
    // Los clics dentro de la vista previa llegan como mensajes del iframe.
    const fromPreview = (event: MessageEvent) => {
      const type = event.data?.type;
      if (event.origin === window.location.origin && (type === 'gyro:select-section' || type === 'gyro:preview-link'))
        mark();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'input'] as const;
    for (const name of events) window.addEventListener(name, mark, { capture: true, passive: true });
    window.addEventListener('message', fromPreview);
    return () => {
      for (const name of events) window.removeEventListener(name, mark, { capture: true });
      window.removeEventListener('message', fromPreview);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    lastBeat.current = Date.now();
    let stopped = false;
    const timer = setInterval(async () => {
      const now = Date.now();
      const idle = now - lastActivity.current;
      if (idle >= IDLE_CLOSE_MS) {
        stopped = true;
        clearInterval(timer);
        callbacks.current.onIdle();
        return;
      }
      setIdleWarning(idle >= IDLE_WARNING_MS);
      if (now - lastBeat.current < HEARTBEAT_MS) return;
      const active = lastActivity.current > lastBeat.current;
      lastBeat.current = now;
      await refreshEditorToken();
      try {
        await beat({ session, active }).unwrap();
      } catch (err) {
        // Sin conexión se reintenta en el próximo latido; 409 = el bloqueo ya no es de esta pestaña.
        if (!stopped && isEditorLockLost(err)) {
          stopped = true;
          clearInterval(timer);
          callbacks.current.onLost(serverErrorMessage(err, 'El editor se cerró. Tu borrador está guardado.'));
        }
      }
    }, TICK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, session, beat]);

  useEffect(() => {
    if (!enabled) return;
    const release = () => releaseStoreEditor(session, pendingDraft.current);
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [enabled, session, pendingDraft]);

  const keepEditing = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleWarning(false);
  }, []);

  return { idleWarning, keepEditing };
}

function EditorWaitScreen({
  state,
  onRetry,
  onBack,
}: {
  state: Exclude<GateState, { kind: 'ready' }>;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div
      data-skin="admin"
      data-area="admin"
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <header className="flex items-center gap-5 border-b bg-card p-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Editor de portada</h1>
      </header>
      {state.kind === 'entering' ? (
        <div aria-busy="true" aria-label="Abriendo el editor" className="flex min-h-0 flex-1 gap-5 p-5">
          <Skeleton className="hidden w-60 xl:block" />
          <Skeleton className="flex-1" />
          <Skeleton className="hidden w-80 xl:block" />
        </div>
      ) : (
        <main className="flex flex-1 items-center justify-center p-5">
          <section role={state.kind === 'error' ? 'alert' : 'status'} className="max-w-md space-y-5 rounded-2xl border bg-card p-6">
            <HugeIcon icon={LockedIcon} size={24} />
            {state.kind === 'busy' ? (
              <>
                <h2 className="text-lg font-semibold">Está editando {state.holder.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Entró el {formatNicaraguaDateTime(state.holder.since)}. Edita un administrador a
                  la vez: cuando cierre el editor vas a poder entrar. Se vuelve a probar solo cada
                  30 segundos.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">No se pudo abrir el editor</h2>
                <p className="text-sm text-muted-foreground">{state.message}</p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="cancel" onClick={onBack}>
                Volver a la tienda
              </Button>
              <Button onClick={onRetry}>Reintentar</Button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
