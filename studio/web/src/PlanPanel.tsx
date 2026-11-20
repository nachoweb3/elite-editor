import {useEffect, useState, type FormEvent} from 'react';
import {Modal} from './Modal';

type Metric = {
  key: string;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
};

type Usage = {
  plan: {key: string; label: string; unlimited: boolean};
  period: string;
  resetsAt: string;
  metrics: Metric[];
};

type Session = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  expiresAt: string;
};

type ActivityEvent = {at: string; action: string; detail: string; ip: string};
type Trash = {projects: number; assets: number; bytes: number; oldest: string | null};
type AdminAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  createdAt: string;
  sessions: number;
  projects: number;
};

const amount = (metric: Metric, value: number | null) => {
  if (value === null) return '—';
  if (metric.key === 'uploadGB' || metric.key === 'storageGB') return `${value.toFixed(2)} GB`;
  return String(Math.round(value * 10) / 10).replace('.0', '');
};

const date = (iso: string) => new Date(iso).toLocaleDateString('es-ES', {day: 'numeric', month: 'long'});
const when = (iso: string) => new Date(iso).toLocaleString('es-ES', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const items = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const fileSize = (bytes: number) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : bytes <= 0
    ? '0 KB'
  : bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ACTIVITY: Record<string, string> = {
  account: 'Cuenta creada',
  login: 'Inicio de sesión',
  password: 'Contraseña actualizada',
  export: 'Datos descargados',
  sessions: 'Sesiones cerradas',
  trash: 'Papelera vaciada',
  plan: 'Plan actualizado',
  reset: 'Contraseña restablecida',
};

export function PlanPanel({api, onClose}: {api: <T>(route: string, data?: unknown) => Promise<T>; onClose: () => void}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [trash, setTrash] = useState<Trash | null>(null);
  const [role, setRole] = useState('');
  const [selfId, setSelfId] = useState('');
  const [people, setPeople] = useState<AdminAccount[]>([]);
  const [temporary, setTemporary] = useState<{name: string; password: string} | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);

  async function loadAdmin() {
    try {
      setPeople(await api<AdminAccount[]>('/admin/accounts'));
    } finally {
      setPeopleLoaded(true);
    }
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const value = await api<Usage>('/usage');
        if (alive) setUsage(value);
      } catch (reason) {
        if (alive) setError((reason as Error).message);
      }
      const [me, sessionList, events, trashInfo] = await Promise.allSettled([
        api<{user?: {id?: string; role?: string}}>('/session'),
        api<Session[]>('/account/sessions'),
        api<ActivityEvent[]>('/account/activity'),
        api<Trash>('/trash'),
      ]);
      if (!alive) return;
      if (me.status === 'fulfilled') {
        setRole(me.value.user?.role || '');
        setSelfId(me.value.user?.id || '');
      }
      if (sessionList.status === 'fulfilled') setSessions(sessionList.value);
      if (events.status === 'fulfilled') setActivity(events.value);
      if (trashInfo.status === 'fulfilled') setTrash(trashInfo.value);
      if (me.status === 'fulfilled' && me.value.user?.role === 'owner') {
        try { await loadAdmin(); } catch (reason) { if (alive) setError((reason as Error).message); }
      }
      if (alive) setLoading(false);
    }
    void load().catch(reason => { if (alive) { setError((reason as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, []);


  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    setNotice('');
    setError('');
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordNotice('');
    if (next !== repeat) { setPasswordNotice('Las contraseñas nuevas no coinciden.'); return; }
    setPasswordBusy(true);
    try {
      const result = await api<{revoked: number}>('/account/password', {currentPassword: current, password: next});
      setCurrent(''); setNext(''); setRepeat('');
      setPasswordNotice(result.revoked > 0
        ? `Contraseña actualizada. Se cerraron ${result.revoked} sesiones en otros dispositivos.`
        : 'Contraseña actualizada.');
      const updated = await api<Session[]>('/account/sessions');
      setSessions(updated);
    } catch (reason) {
      setPasswordNotice((reason as Error).message);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function revokeSession(id: string) {
    await run(`session-${id}`, async () => {
      const result = await api<{sessions: Session[]}>('/account/sessions/revoke', {id});
      setSessions(result.sessions);
      setNotice('Sesión cerrada.');
    });
  }

  async function revokeOthers() {
    await run('sessions', async () => {
      const result = await api<{sessions: Session[]; revoked: number}>('/account/sessions/revoke', {all: true});
      setSessions(result.sessions);
      setNotice(`Se cerraron ${result.revoked} sesiones.`);
    });
  }

  async function emptyTrash() {
    await run('trash', async () => {
      const result = await api<{projects: number; assets: number; summary: Trash}>('/trash/empty', {});
      setTrash(result.summary);
      setConfirmTrash(false);
      setActivity(await api<ActivityEvent[]>('/account/activity'));
      setNotice(`Papelera vaciada: ${items(result.projects, 'proyecto', 'proyectos')} y ${items(result.assets, 'recurso', 'recursos')}.`);
    });
  }

  async function changePlan(id: string, plan: string) {
    await run(`plan-${id}`, async () => {
      await api('/admin/plan', {id, plan});
      await loadAdmin();
      setNotice('Plan actualizado.');
    });
  }

  async function resetFor(account: AdminAccount) {
    await run(`reset-${account.id}`, async () => {
      const result = await api<{password: string}>('/admin/reset-password', {id: account.id});
      setTemporary({name: account.name, password: result.password});
      await loadAdmin();
    });
  }

  async function closeAll(account: AdminAccount) {
    await run(`close-${account.id}`, async () => {
      await api('/admin/sessions/revoke', {id: account.id});
      await loadAdmin();
      setNotice(`Sesiones de ${account.name} cerradas.`);
    });
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await api('/account/delete', {password: deletePassword});
      location.href = '/';
    } catch (reason) {
      setDeleteError((reason as Error).message);
      setDeleteBusy(false);
    }
  }

  const others = sessions.filter(item => !item.current);

  return <Modal titleId="plan-title" onClose={onClose} busy={loading}>
      <header>
        <div>
          <p className="modal-kicker">TU PLAN</p>
          <h2 id="plan-title">{usage ? usage.plan.label : 'Plan del estudio'}</h2>
          <p>{usage?.plan.unlimited ? 'Sin límites en esta instalación.' : usage ? `Se reinicia el ${date(usage.resetsAt)}.` : 'Cargando consumo…'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
      </header>

      {error ? <p className="plan-error" role="alert">{error}</p> : null}
      {notice ? <p className="plan-note" role="status">{notice}</p> : null}

      {usage ? <div className="plan-metrics">
        {usage.metrics.map(metric => <div className="plan-metric" key={metric.key}>
          <div className="plan-metric-head">
            <span>{metric.label}</span>
            <strong>
              {usage.plan.unlimited || metric.limit === null
                ? `${amount(metric, metric.used)} · sin límite`
                : `${amount(metric, metric.used)} / ${amount(metric, metric.limit)}`}
            </strong>
          </div>
          {!usage.plan.unlimited && metric.percent !== null
            ? <div className="plan-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metric.percent} aria-label={metric.label}>
                <span style={{width: `${Math.max(1, metric.percent)}%`}} className={metric.percent >= 90 ? 'full' : ''}/>
              </div>
            : null}
        </div>)}
      </div> : null}

      <div className="plan-included">
        <h3>Qué incluye</h3>
        <ul>
          <li>Edición manual, automática y exportación MP4 en tu equipo.</li>
          <li>Subtítulos, retoque facial, sonidos, memes y clips verticales.</li>
          <li>Los servicios externos de generación usan tu propia clave y sus créditos.</li>
        </ul>
        <p>El render ocurre en tu ordenador: estos límites protegen la cola de trabajos y el disco, no son una cuota de nube.</p>
      </div>

      <section className="plan-section">
        <h3>Sesiones</h3>
        <p>Dispositivos que han entrado con tu cuenta. Si ves uno que no reconoces, ciérralo: su enlace deja de funcionar al instante.</p>
        {loading && !sessions.length ? <Skeleton rows={2}/> : <ul className="plan-sessions">
          {sessions.map(item => <li key={item.id} className="plan-session">
            <div>
              <strong>{item.device}</strong>
              {item.current ? <span className="plan-tag">Este dispositivo</span> : null}
              <small>{when(item.lastSeenAt)} · {item.ip || 'local'}</small>
            </div>
            {item.current ? null : <button type="button" disabled={!!busy} onClick={() => void revokeSession(item.id)}>Cerrar</button>}
          </li>)}
          {!sessions.length ? <li className="plan-empty">No hay otras sesiones abiertas.</li> : null}
        </ul>}
        {others.length ? <button type="button" className="plan-secondary" disabled={!!busy} onClick={() => void revokeOthers()}>Cerrar las demás sesiones</button> : null}
      </section>

      <section className="plan-section">
        <h3>Actividad reciente</h3>
        {loading && !activity.length ? <Skeleton rows={3}/> : activity.length ? <ul className="plan-activity">
          {activity.slice(0, 10).map((event, index) => <li key={`${event.at}-${index}`}>
            <span>{ACTIVITY[event.action] || event.action}</span>
            <small>{event.detail} · {when(event.at)}</small>
          </li>)}
        </ul> : <p className="plan-note">Todavía no hay actividad registrada.</p>}
      </section>

      <section className="plan-section">
        <h3>Papelera</h3>
        <p>{trash ? `${items(trash.projects, 'proyecto', 'proyectos')} y ${items(trash.assets, 'recurso', 'recursos')} · ${fileSize(trash.bytes)}` : 'Calculando…'}</p>
        <p className="plan-note">La papelera se vacía sola a los 30 días. Vacíala ahora para liberar espacio en el disco y en tu cuota.</p>
        {confirmTrash
          ? <div className="plan-confirm">
              <p>Se borrarán definitivamente {items(trash?.projects || 0, 'proyecto', 'proyectos')} y {items(trash?.assets || 0, 'recurso', 'recursos')}. No se puede deshacer.</p>
              <button type="button" className="plan-danger-button" disabled={!!busy} onClick={() => void emptyTrash()}>{busy === 'trash' ? 'Vaciando…' : 'Sí, vaciar'}</button>
              <button type="button" disabled={!!busy} onClick={() => setConfirmTrash(false)}>Cancelar</button>
            </div>
          : <button type="button" disabled={!!busy || !trash || (!trash.projects && !trash.assets)} onClick={() => setConfirmTrash(true)}>Vaciar papelera</button>}
      </section>

      <section className="plan-section">
        <h3>Cuenta y datos</h3>
        <a className="plan-link" href="/api/account/export">Descargar mis datos (JSON)</a>
        <p>Incluye tus proyectos, el montaje, el consumo del mes y los recursos que has importado.</p>

        <form className="plan-form" onSubmit={changePassword}>
          <strong>Cambiar contraseña</strong>
          <label>Contraseña actual
            <input type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required/>
          </label>
          <label>Nueva contraseña
            <input type="password" autoComplete="new-password" minLength={8} maxLength={200} value={next} onChange={event => setNext(event.target.value)} required/>
          </label>
          <label>Repite la nueva contraseña
            <input type="password" autoComplete="new-password" minLength={8} maxLength={200} value={repeat} onChange={event => setRepeat(event.target.value)} required/>
          </label>
          <button type="submit" disabled={passwordBusy}>{passwordBusy ? 'Guardando…' : 'Cambiar contraseña'}</button>
          {passwordNotice ? <p role="status" className="plan-note">{passwordNotice}</p> : null}
          <p>Al cambiarla se cierran las demás sesiones; esta sigue abierta.</p>
        </form>
      </section>

      {role === 'owner' ? <section className="plan-section plan-admin">
        <h3>Cuentas del estudio</h3>
        <p>Solo el dueño ve esta lista. Cambia el plan de un miembro o desbloquéalo con una contraseña temporal de un solo uso.</p>
        <div className="plan-accounts">
          {people.map(account => <div className="plan-account" key={account.id}>
            <div>
              <strong>{account.name}</strong>
              <small>{account.email} · {account.role === 'owner' ? 'Dueño' : 'Miembro'} · {items(account.projects, 'proyecto', 'proyectos')} · {items(account.sessions, 'sesión', 'sesiones')}</small>
            </div>
            <div className="plan-account-actions">
              <select aria-label={`Plan de ${account.name}`} value={account.plan} disabled={account.role === 'owner' || !!busy} onChange={event => void changePlan(account.id, event.target.value)}>
                <option value="free">Gratis</option>
                <option value="pro">Pro</option>
              </select>
              <button type="button" disabled={!!busy || account.id === selfId} onClick={() => void resetFor(account)}>Contraseña temporal</button>
              <button type="button" disabled={!!busy || account.id === selfId} onClick={() => void closeAll(account)}>Cerrar sesiones</button>
            </div>
          </div>)}
          {!peopleLoaded ? <Skeleton rows={2}/> : !people.length ? <p className="plan-empty">Todavía no hay más cuentas.</p> : null}
        </div>
        {temporary ? <p role="status" className="plan-note">
          Contraseña temporal de {temporary.name}: <code className="plan-code">{temporary.password}</code>. Se muestra una sola vez; pídele que la cambie al entrar.
        </p> : null}
      </section> : null}

      <details className="plan-danger">
        <summary>Eliminar mi cuenta</summary>
        <p>Se borran tus proyectos, tus archivos importados y tus generaciones de este equipo. No se puede deshacer.</p>
        <form className="plan-form" onSubmit={deleteAccount}>
          <label>Escribe tu contraseña para confirmar
            <input type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} required/>
          </label>
          <button type="submit" className="plan-danger-button" disabled={deleteBusy || !deletePassword}>
            {deleteBusy ? 'Eliminando…' : 'Eliminar cuenta y datos'}
          </button>
          {deleteError ? <p role="alert" className="plan-error">{deleteError}</p> : null}
        </form>
      </details>
  </Modal>;
}

function Skeleton({rows = 2}: {rows?: number}) {
  return <div className="plan-skeleton" aria-hidden="true">
    {Array.from({length: rows}, (_, index) => <span key={index}/>)}
  </div>;
}
