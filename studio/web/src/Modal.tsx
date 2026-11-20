import {useRef, type ReactNode} from 'react';
import {useDialogFocus} from './useDialog';

/** Diálogo modal compartido: fondo, foco atrapado, Escape y cierre al pulsar fuera. */
export function Modal({titleId, onClose, wide = false, busy, children}: {
  titleId: string;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  useDialogFocus(card, onClose);

  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={card} className={`modal-card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}>
      {children}
    </div>
  </div>;
}

/** Cabecera común de los diálogos: antetítulo, título, explicación y cierre. */
export function DialogHeader({titleId, kicker, title, description, onClose}: {
  titleId: string;
  kicker: string;
  title: string;
  description?: ReactNode;
  onClose: () => void;
}) {
  return <header>
    <div>
      <p className="modal-kicker">{kicker}</p>
      <h2 id={titleId}>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    <button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
  </header>;
}
