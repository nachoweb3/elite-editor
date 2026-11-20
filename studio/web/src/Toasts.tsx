import {useCallback, useEffect, useRef, useState} from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = {id: number; kind: ToastKind; message: string; detail?: string; progress?: number};

const ICONS: Record<ToastKind, string> = {success: '✓', error: '!', info: 'i'};
const DURATION = {success: 4500, error: 8000};
const PROGRESS_ID = 0;

/** Avisos no bloqueantes: mensajes con autocierre y un único aviso de progreso. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setToasts(list => list.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((kind: 'success' | 'error', message: string) => {
    const id = ++next.current;
    setToasts(list => [...list.slice(-4), {id, kind, message}]);
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
  }, [dismiss]);

  /** Progreso de importación: se actualiza en el sitio o se retira pasando null. */
  const progress = useCallback((message: string | null, value = 0, detail?: string) => {
    setToasts(list => message === null
      ? list.filter(toast => toast.id !== PROGRESS_ID)
      : [...list.filter(toast => toast.id !== PROGRESS_ID), {id: PROGRESS_ID, kind: 'info', message, detail, progress: value}]);
  }, []);

  useEffect(() => () => {
    timers.current.forEach(timer => clearTimeout(timer));
    timers.current.clear();
  }, []);

  return {toasts, notify, progress, dismiss};
}

export function Toasts({toasts, onDismiss}: {toasts: Toast[]; onDismiss: (id: number) => void}) {
  return <div className="toast-stack" role="region" aria-label="Notificaciones">
    {toasts.map(toast => <div key={toast.id} className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">{ICONS[toast.kind]}</span>
      <div className="toast-copy">
        <p>{toast.message}</p>
        {toast.detail ? <small>{toast.detail}</small> : null}
        {typeof toast.progress === 'number'
          ? <div className="toast-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={toast.progress} aria-label="Progreso de importación">
              <span style={{width: `${Math.max(2, Math.min(100, toast.progress))}%`}}/>
            </div>
          : null}
      </div>
      <button type="button" className="toast-close" aria-label="Cerrar notificación" onClick={() => onDismiss(toast.id)}>✕</button>
    </div>)}
  </div>;
}
