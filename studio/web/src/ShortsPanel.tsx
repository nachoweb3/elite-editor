import {useEffect,useRef,useState} from 'react';
import type {Project,Short} from './types';
import {clock} from './timeline';
import './shorts.css';

type Props = {
  project: Project;
  busy: boolean;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onChange: (project: Project) => void;
};

type Copy = {title: string; description: string; hashtags: string};

const STATUS: Record<string, string> = {
  queued: 'En cola',
  rendering: 'Creando shorts',
  ready: 'Listos',
  failed: 'No se pudieron crear',
  cancelled: 'Cancelado',
  interrupted: 'Interrumpido',
};

function ShortCopy({project, item, api}: {project: Project; item: Short; api: Props['api']}) {
  const [copy, setCopy] = useState<Copy | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function load() {
    if (copy) return;
    try {
      setCopy(await api<Copy>(`/projects/${project.id}/shorts/${item.id}/metadata`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function write(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copiado.`);
      setTimeout(() => setStatus(''), 1800);
    } catch {
      setStatus('El navegador no permite copiar; selecciona el texto.');
    }
  }
  return <details className="shortcopy" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) void load(); }}>
    <summary>Texto para publicar</summary>
    {error ? <p role="alert">{error}</p> : null}
    {!copy && !error ? <p>Cargando…</p> : null}
    {copy ? <>
      <label>Título<input readOnly value={copy.title} /></label>
      <label>Descripción<textarea readOnly rows={4} value={copy.description} /></label>
      <label>Hashtags<input readOnly value={copy.hashtags} /></label>
      <div className="shortcopy-actions">
        <button type="button" onClick={() => void write(copy.title, 'Título')}>Título</button>
        <button type="button" onClick={() => void write(copy.description, 'Descripción')}>Descripción</button>
        <button type="button" onClick={() => void write(copy.hashtags, 'Hashtags')}>Hashtags</button>
      </div>
      {status ? <p role="status">{status}</p> : null}
    </> : null}
  </details>;
}

export function ShortsPanel({project, busy, api, onChange}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const selectAll=useRef<HTMLInputElement>(null);
  const shorts = project.shorts;
  const shortJob = project.jobs.slice().reverse().find(job => job.type === 'shorts');
  const processing = Boolean(working || shorts?.status === 'queued' || shorts?.status === 'rendering' || (shortJob && ['queued', 'running'].includes(shortJob.status)));
  const items = shorts?.items || [];
  const ready = items.filter(item => item.status === 'ready' && item.file);
  const selected = ready.filter(item => !excluded.includes(item.id));
  const packHref = `/api/projects/${project.id}/shorts-package?download=1&ids=${encodeURIComponent(selected.map(item => item.id).join(','))}`;
  const failure = error || shorts?.error || (shortJob?.status === 'failed' ? shortJob.message : '');
  useEffect(()=>{
    if(selectAll.current)selectAll.current.indeterminate=selected.length>0&&selected.length<ready.length;
  },[selected.length,ready.length]);

  async function generate() {
    if (busy || processing) return;
    setWorking(true);
    setError('');
    try {
      await api(`/projects/${project.id}/job`, {type: 'shorts'});
      setExcluded([]);
      onChange(await api<Project>(`/projects/${project.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return <section className="shorts">
    <div className="shortshead">
      <div>
        <p className="shortseyebrow">SHORTS AUTOMÁTICOS</p>
        <h2>Tu grabación, también en vertical.</h2>
        <p>Elijo {shorts?.count || '3–5'} momentos que se entienden solos, reencuadro a 9:16 siguiendo la cara o la pantalla y les doy su propio hook y subtítulos.</p>
      </div>
      <button className="shortsgenerate" disabled={busy || processing} onClick={() => void generate()}>
        {processing ? 'Creando shorts…' : shorts?.status === 'ready' ? 'Volver a generar' : 'Generar shorts'}
      </button>
    </div>
    {processing ? <div className="shortsprogress"><span className="shortspulse">✦</span><div><b>{STATUS[shorts?.status || 'queued'] || 'Preparando'}</b><p>{shorts?.status === 'queued' ? 'Esperando a que termine el trabajo actual.' : 'Buscando momentos, siguiendo caras y preparando cada MP4.'}</p></div></div> : null}
    {failure ? <div className="shortserror" role="alert">{failure}</div> : null}
    {!items.length && !processing ? <div className="shortsempty"><div>9:16</div><p>Genera los shorts desde la misma grabación. Verás aquí cada hook, su duración y el MP4 para descargar.</p></div> : null}
    {ready.length ? <div className="shortspack" role="group" aria-label="Paquete de publicación">
      <div>
        <b>Paquete de publicación</b>
        <p>{selected.length} de {ready.length} seleccionados · MP4, SRT, miniatura y texto de publicación.</p>
      </div>
      <label className="shortspack-all"><input ref={selectAll} type="checkbox" checked={selected.length === ready.length} onChange={e => setExcluded(e.target.checked ? [] : ready.map(item => item.id))} /> Seleccionar todos</label>
      {selected.length?<a className="shortspack-zip" href={packHref} download>⇩ Descargar {selected.length} en .zip</a>:<p role="status">Selecciona un short para descargar el ZIP.</p>}
    </div> : null}
    {items.length ? <div className="shortsgrid">{items.map(item => {
      const isReady = item.status === 'ready' && !!item.file;
      const source = `/api/projects/${project.id}/shorts/${item.id}/artifact`;
      const number = String(item.index).padStart(2, '0');
      const stamp = encodeURIComponent(shorts?.renderedAt || shorts?.generatedAt || project.revision);
      return <article className={`shortcard ${isReady ? 'ready' : 'pending'}`} key={item.id}>
        <div className="shortphone">
          {isReady ? <video controls playsInline preload="metadata" src={`${source}?v=${stamp}`} /> : <div className="shortwait"><span>✦</span><b>{item.status === 'rendering' ? 'Reencuadrando…' : 'Preparando…'}</b></div>}
          <span className="shortratio">9:16</span>
          {isReady ? <label className="shortpick"><input type="checkbox" checked={!excluded.includes(item.id)} onChange={e => setExcluded(current => e.target.checked ? current.filter(id => id !== item.id) : [...current, item.id])} aria-label={`Seleccionar short ${item.index} para el paquete`} /></label> : null}
        </div>
        <div className="shortmeta">
          <span className="shortindex">SHORT {number} · {clock(item.start)}–{clock(item.end)}</span>
          <h3>{item.hook}</h3>
          <p>{item.reframe?.mode === 'face' ? 'Encuadre siguiendo la cara' : item.reframe?.mode === 'screen' ? 'Encuadre siguiendo la pantalla' : 'Encuadre pendiente'} · subtítulos legibles</p>
          <div className="shortactions">
            {isReady ? <a href={`${source}?download=1`} download={`short-${number}.mp4`}>Descargar MP4</a> : <span>{STATUS[item.status] || 'En cola'}</span>}
            {isReady ? <a className="shortsrt" href={`${source}?format=srt&download=1`} download={`short-${number}.srt`}>SRT</a> : null}
          </div>
          {isReady ? <ShortCopy project={project} item={item} api={api} /> : null}
        </div>
      </article>;
    })}</div> : null}
  </section>;
}
