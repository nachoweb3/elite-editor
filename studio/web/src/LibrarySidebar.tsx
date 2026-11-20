/**
 * LibrarySidebar.tsx
 * Panel izquierdo del editor manual con 7 pestañas:
 *   medios | memes | audio | texto | rostro | creador | asistente
 */
import { useEffect, useRef, useState } from 'react';
import type { AudioAsset, AudioTrack, Project } from './types';
import { AudioLibrary } from './AudioEditor';
import { ShortsPanel } from './ShortsPanel';

/* ─── tipos locales ─────────────────────────────────────────────── */
interface CatalogueItem {
  id: string;
  name: string;
  kind: 'meme' | 'sound' | 'music' | 'pexels';
  duration: number;
  description: string;
  author: string;
  license: string;
  greenScreen: boolean | null;
}

interface MediaItem {
  kind: string;
  name: string;
  outputTime: number;
  duration?: number;
  status?: string;
  resourceId?: string;
}

type ExtProject = Project & {
  automatic?: { direction?: { media?: MediaItem[] } };
};

const stamp = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(
    Math.floor((t % 1) * 30)
  ).padStart(2, '0')}`;

const snap = (t: number) => Math.round(t * 30) / 30;

/* ─── icons ─────────────────────────────────────────────────────── */
const TABS: { id: string; icon: string; label: string }[] = [
  { id: 'medios',    icon: '▣',  label: 'Medios'    },
  { id: 'memes',    icon: '✦',  label: 'Memes'     },
  { id: 'audio',    icon: '♫',  label: 'Audio'     },
  { id: 'texto',    icon: '☷',  label: 'Texto'     },
  { id: 'rostro',   icon: '◉',  label: 'Rostro'    },
  { id: 'creador',  icon: '⚡', label: 'Creador'   },
  { id: 'asistente',icon: '◈',  label: 'Asistente' },
];

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: MEMES
══════════════════════════════════════════════════════════════════════ */
function MemesPanel({
  project,
  time,
  disabled,
  onAddMeme,
}: {
  project: ExtProject | null;
  time: number;
  disabled: boolean;
  onAddMeme: (item: CatalogueItem, at: number) => void;
}) {
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CatalogueItem | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/catalogue')
      .then(r => r.json())
      .then((items: CatalogueItem[]) => {
        setCatalogue(items.filter(i => i.kind === 'meme' || i.kind === 'pexels'));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = catalogue.filter(m =>
    !query || m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">MEMES &amp; B-ROLL <span>{filtered.length}</span></div>
      <input
        className="lib-search"
        placeholder="Buscar meme…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {error && <p className="lib-error">{error}</p>}
      {loading && <p className="lib-hint">Cargando…</p>}
      {!loading && !filtered.length && query && (
        <p className="lib-hint">Sin resultados para «{query}»</p>
      )}
      {preview && (
        <div className="meme-preview-bar">
          <video
            key={preview.id}
            src={`/api/asset?id=${preview.id}`}
            autoPlay
            loop
            muted
            playsInline
            className="meme-preview-thumb"
          />
          <strong title={preview.name}>{preview.name}</strong>
          {preview.duration > 0 && (
            <small>{preview.duration.toFixed(1)} s</small>
          )}
          <div className="meme-preview-actions">
            <button
              disabled={disabled || !project}
              onClick={() => { onAddMeme(preview, snap(time)); setPreview(null); }}
            >
              ＋ Añadir en {stamp(time)}
            </button>
            <button onClick={() => setPreview(null)}>✕</button>
          </div>
        </div>
      )}
      <div className="meme-grid">
        {filtered.map(m => (
          <div
            key={m.id}
            className={`meme-card ${preview?.id === m.id ? 'selected' : ''}`}
            title={m.name}
            onClick={() => setPreview(preview?.id === m.id ? null : m)}
          >
            {m.kind === 'meme' ? (
              <video
                src={`/api/asset?id=${m.id}`}
                muted
                loop
                playsInline
                className="meme-card-thumb"
                onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={e => { (e.currentTarget as HTMLVideoElement).pause(); }}
              />
            ) : (
              <div className="meme-card-icon">🎬</div>
            )}
            <span className="meme-card-name">{m.name}</span>
            {m.duration > 0 && <small>{m.duration.toFixed(1)}s</small>}
            <button
              className="meme-card-add"
              disabled={disabled || !project}
              title={`Añadir "${m.name}" en ${stamp(time)}`}
              onClick={e => { e.stopPropagation(); onAddMeme(m, snap(time)); }}
            >
              ＋
            </button>
          </div>
        ))}
      </div>
      <p className="lib-hint">
        Haz clic en un meme para previsualizar · ＋ lo añade en el cursor ({stamp(time)})
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: TEXTO & SUBTÍTULOS
══════════════════════════════════════════════════════════════════════ */
function TextoPanel({
  project,
  disabled,
  api,
  onProject,
}: {
  project: ExtProject | null;
  disabled: boolean;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onProject: (p: Project) => void;
}) {
  const settings = (project?.settings ?? {}) as Record<string, unknown>;
  const subtitlesOn = !!(settings.subtitles);
  const subtitlePos = String(settings.subtitlePosition || 'bottom');
  const subtitleTpl = String(settings.subtitleTemplate || 'Cinematic');
  const titleVal = String(settings.title || '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function patch(change: Record<string, unknown>) {
    if (!project || disabled) return;
    setWorking(true);
    setError('');
    try {
      const p = await api<Project>(`/projects/${project.id}/settings`, change);
      onProject(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const transcript = project?.transcript || [];

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">TEXTO &amp; SUBTÍTULOS</div>
      <fieldset disabled={disabled || working}>
        <div className="lib-row">
          <label className="lib-toggle-label">
            <input
              type="checkbox"
              checked={subtitlesOn}
              onChange={e => void patch({ subtitles: e.target.checked })}
            />
            <span>Subtítulos activos</span>
          </label>
        </div>
        {subtitlesOn && (
          <>
            <label className="lib-label">
              Posición
              <select
                className="lib-select"
                value={subtitlePos}
                onChange={e => void patch({ subtitlePosition: e.target.value })}
              >
                <option value="top">Arriba</option>
                <option value="bottom">Abajo</option>
              </select>
            </label>
            <label className="lib-label">
              Estilo
              <select
                className="lib-select"
                value={subtitleTpl}
                onChange={e => void patch({ subtitleTemplate: e.target.value })}
              >
                <option value="Cinematic">Cinematic</option>
                <option value="Viral">Viral</option>
                <option value="Tutorial">Tutorial</option>
                <option value="Dark Future">Dark Future</option>
              </select>
            </label>
            <label className="lib-label">
              Título inicial
              <input
                className="lib-input"
                type="text"
                maxLength={80}
                placeholder="Título que aparece los 3 primeros segundos"
                value={titleVal}
                onChange={e => void patch({ title: e.target.value })}
              />
            </label>
          </>
        )}
      </fieldset>
      {error && <p className="lib-error">{error}</p>}
      {transcript.length > 0 && (
        <>
          <div className="lib-section-title">TRANSCRIPCIÓN</div>
          <p className="lib-hint">Pulsa «Quitar» para eliminar esa frase del montaje.</p>
          <div className="lib-transcript">
            {transcript.map((seg, i) => (
              <div key={i} className="lib-seg">
                <time>{stamp(seg.start)}</time>
                <p>{seg.text}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {!transcript.length && (
        <p className="lib-hint">La transcripción aparece tras el análisis automático.</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: ROSTRO & BELLEZA
══════════════════════════════════════════════════════════════════════ */
const FACE_CONTROLS: [string, string][] = [
  ['faceSmooth',     'Piel · conservar textura'],
  ['faceLight',      'Luz sobre el rostro'],
  ['faceUnderEyes',  'Suavizar ojeras'],
  ['faceEyes',       'Luminosidad de ojos'],
  ['faceTeeth',      'Blanqueamiento de dientes'],
  ['faceJaw',        'Afinar mandíbula'],
];

const NATURAL_PRESET = {
  faceRetouch: true,
  faceSmooth: 0.22,
  faceLight: 0.12,
  faceUnderEyes: 0.12,
  faceEyes: 0.08,
  faceTeeth: 0,
  faceJaw: 0,
};

function RostroPanel({
  project,
  disabled,
  api,
  onProject,
}: {
  project: ExtProject | null;
  disabled: boolean;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onProject: (p: Project) => void;
}) {
  const settings = (project?.settings || {}) as Record<string, number | boolean>;
  const [face, setFace] = useState({
    faceRetouch: true,
    faceSmooth: 0.22,
    faceLight: 0.12,
    faceUnderEyes: 0.12,
    faceEyes: 0.08,
    faceTeeth: 0,
    faceJaw: 0,
    ...settings,
  });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function apply() {
    if (!project) return;
    setWorking(true);
    setError('');
    try {
      const p = await api<Project>(`/projects/${project.id}/portrait`, {
        revision: project.revision,
        settings: face,
      });
      onProject(p);
      await api(`/projects/${project.id}/job`, { type: 'rerender' });
      onProject(await api<Project>(`/projects/${project.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">ROSTRO &amp; BELLEZA</div>
      <label className="lib-toggle-label">
        <input
          type="checkbox"
          checked={face.faceRetouch as boolean}
          onChange={e => setFace({ ...face, faceRetouch: e.target.checked })}
        />
        <span>Retoque activo</span>
      </label>
      <fieldset disabled={!face.faceRetouch || disabled || working}>
        {FACE_CONTROLS.map(([key, label]) => (
          <label key={key} className="lib-label lib-slider-label">
            <span>
              {label}
              <b>{Math.round((face[key as keyof typeof face] as number) * 100)} %</b>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((face[key as keyof typeof face] as number) * 100)}
              onChange={e =>
                setFace({ ...face, [key]: Number(e.target.value) / 100 })
              }
            />
          </label>
        ))}
      </fieldset>
      {error && <p className="lib-error">{error}</p>}
      <div className="lib-actions">
        <button
          disabled={disabled || working || !project}
          className="lib-primary"
          onClick={() => void apply()}
        >
          {working ? 'Aplicando…' : 'Aplicar y ver resultado'}
        </button>
        <button onClick={() => setFace(NATURAL_PRESET)}>Ajuste natural</button>
      </div>
      <p className="lib-hint">
        Los ojos y labios se excluyen del suavizado. Sin rostro detectado, el fotograma se conserva tal cual.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: CREADOR (Shorts · Volumen · LUT)
══════════════════════════════════════════════════════════════════════ */
type ShortCandidate = {
  start: number; end: number; duration: number;
  score: number; title: string; text: string; reasons: string[];
};

type Loudness = {
  integrated: number | null; truePeak: number | null; lra: number | null;
  target: number; verdict: string; advice: string; measured: string;
};

const LOUDNESS_ROWS: [keyof Loudness, string, string][] = [
  ['integrated', 'Volumen integrado', ' LUFS'],
  ['truePeak', 'Pico real', ' dBTP'],
  ['lra', 'Rango dinámico', ' LU'],
];

function CreadorPanel({
  project,
  disabled,
  api,
  onProject,
}: {
  project: ExtProject | null;
  disabled: boolean;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onProject: (p: Project) => void;
}) {
  const [range, setRange] = useState('15-30');
  const [shorts, setShorts] = useState<ShortCandidate[] | null>(null);
  const [shortsRevision, setShortsRevision] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hint, setHint] = useState('');
  const [loudness, setLoudness] = useState<Loudness | null>(null);

  const stale = shortsRevision !== null && project?.revision !== shortsRevision;

  async function findShorts() {
    if (!project) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const [min, max] = range.split('-').map(Number);
      const r = await api<{ revision: number; candidates?: ShortCandidate[]; hint?: string; fallback?: boolean }>(
        `/projects/${project.id}/shorts?min=${min}&max=${max}`
      );
      setShorts(r.candidates || []);
      setHint(r.hint || (r.fallback ? 'No había frases en ese rango: he ampliado la búsqueda. Revisa la duración de cada clip.' : ''));
      setShortsRevision(r.revision);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function applyShort(c: ShortCandidate) {
    if (!project) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const p = await api<Project>(`/projects/${project.id}/shorts`, {
        start: c.start, end: c.end, revision: project.revision,
      });
      onProject(p); setShorts(null);
      setNotice(`Montaje recortado a ${stamp(c.start)} – ${stamp(c.end)} en vertical. El original no se ha tocado.`);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function measureLoudness() {
    if (!project) return;
    setWorking(true); setError('');
    try {
      const r = await api<Loudness>(`/projects/${project.id}/loudness`);
      setLoudness(r);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  const pct = (n: number) => `${Math.round(n)}`;

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">CREADOR &amp; SHORTS</div>

      {/* Shorts finder */}
      <div className="lib-section-title">CLIPS PARA SHORTS</div>
      <p className="lib-hint">Busca momentos que se entiendan solos. Elegir uno recorta el montaje a ese tramo y lo pone en 9:16; el archivo original no cambia.</p>
      <label className="lib-label">
        Duración
        <select className="lib-select" value={range} onChange={e => { setRange(e.target.value); setShorts(null); }}>
          <option value="15-30">15 – 30 s</option>
          <option value="30-60">30 – 60 s</option>
          <option value="60-90">60 – 90 s</option>
        </select>
      </label>
      <button className="lib-primary" disabled={working || disabled || !project} onClick={() => void findShorts()}>
        {working && !shorts ? 'Buscando…' : 'Buscar clips para Shorts'}
      </button>
      {stale && <p className="lib-warn">El montaje cambió: vuelve a buscar.</p>}
      {error && <p className="lib-error">{error}</p>}
      {notice && <p className="lib-ok">{notice}</p>}
      {hint && <p className="lib-warn">{hint}</p>}
      {shorts !== null && !shorts.length && (
        <p className="lib-hint">Sin candidatos en ese rango. Prueba otro o analiza primero.</p>
      )}
      {shorts?.map((c, i) => (
        <div key={i} className="lib-short-card">
          <div className="lib-short-head">
            <span>{stamp(c.start)} – {stamp(c.end)} · {Math.round(c.duration)} s</span>
            <span className="lib-score">{pct(c.score * 100)}/100</span>
          </div>
          <div className="lib-score-bar">
            <span style={{ width: `${Math.max(2, c.score * 100)}%` }} />
          </div>
          {c.title && <strong>{c.title}</strong>}
          {c.text && <p className="lib-short-text">{c.text}</p>}
          {c.reasons?.length > 0 && (
            <div className="lib-reasons">
              {c.reasons.map(r => <span key={r} className="lib-reason">{r}</span>)}
            </div>
          )}
          <button
            disabled={working || disabled || stale}
            onClick={() => void applyShort(c)}
          >
            Usar este clip · vertical
          </button>
        </div>
      ))}

      {/* Generación automática y paquete de publicación, sin salir del editor */}
      <div className="lib-section-title" style={{ marginTop: 20 }}>PAQUETE DE PUBLICACIÓN</div>
      <p className="lib-hint">Genera los shorts desde este montaje y descarga un .zip con MP4, SRT, miniatura y texto listo para publicar.</p>
      {project && (
        <ShortsPanel project={project} busy={disabled} api={api} onChange={onProject} />
      )}

      {/* Loudness meter */}
      <div className="lib-section-title" style={{ marginTop: 20 }}>VOLUMEN &amp; LUFS</div>
      <button disabled={working || disabled || !project} onClick={() => void measureLoudness()}>
        {working ? 'Midiendo…' : 'Medir volumen del vídeo'}
      </button>
      {loudness && (
        <div className="lib-loudness">
          {LOUDNESS_ROWS.map(([key, label, unit]) => (
            <div key={key} className="lib-loudness-row">
              <span>{label}</span>
              <strong>{loudness[key] === null ? '—' : `${loudness[key]}${unit}`}</strong>
            </div>
          ))}
          <div className="lib-loudness-row">
            <span>Objetivo</span>
            <strong>{loudness.target} LUFS</strong>
          </div>
          <p className="lib-hint">{loudness.verdict}. {loudness.advice}</p>
          <p className="lib-hint">Medido en el {loudness.measured}.</p>
        </div>
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: ASISTENTE IA
══════════════════════════════════════════════════════════════════════ */
function AsistentePanel({
  project,
  disabled,
  api,
  onProject,
}: {
  project: ExtProject | null;
  disabled: boolean;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onProject: (p: Project) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  async function run() {
    if (!project || !prompt.trim()) return;
    setWorking(true); setError(''); setResult('');
    try {
      const p = await api<Project>(`/projects/${project.id}/prompt`, {
        prompt: prompt.trim(),
        revision: project.revision,
      });
      onProject(p);
      await api(`/projects/${project.id}/job`, { type: 'rerender' });
      onProject(await api<Project>(`/projects/${project.id}`));
      setResult('✓ Instrucción aplicada. Generando resultado…');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function detectStickman() {
    if (!project) return;
    setWorking(true); setError('');
    try {
      await api(`/projects/${project.id}/job`, { type: 'stickman' });
      onProject(await api<Project>(`/projects/${project.id}`));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">ASISTENTE IA</div>

      <div className="lib-section-title">INSTRUCCIÓN EN LENGUAJE NATURAL</div>
      <p className="lib-hint">
        Escribe qué quieres cambiar: «baja la música al 10 %, quita los subtítulos, ilumina un poco».
      </p>
      <textarea
        className="lib-textarea"
        maxLength={3000}
        placeholder="Dile qué quieres cambiar…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
      />
      <div className="lib-actions">
        <button
          className="lib-primary"
          disabled={disabled || working || !project || prompt.trim().length < 3}
          onClick={() => void run()}
        >
          {working ? 'Interpretando…' : 'Aplicar instrucción'}
        </button>
      </div>
      {result && <p className="lib-ok">{result}</p>}
      {error && <p className="lib-error">{error}</p>}

      <div className="lib-section-title" style={{ marginTop: 20 }}>DETECTOR DE CONCEPTOS (STICKMAN)</div>
      <p className="lib-hint">
        Detecta los momentos en los que explicas una idea y dibuja un muñeco animado sobre tu vídeo.
      </p>
      <button
        disabled={disabled || working || !project}
        onClick={() => void detectStickman()}
      >
        {working ? 'Detectando…' : '◈ Detectar conceptos con stickman'}
      </button>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PESTAÑA: MEDIOS (wrapper del panel actual)
══════════════════════════════════════════════════════════════════════ */
function MediosPanel({
  library,
  draft,
  ready,
  busy,
  galleryVersion,
  token,
  onAdd,
  onOpen,
  onChooseVideo,
  onAddAudio,
  api,
  onRefresh,
}: {
  library: Project[];
  draft: Project | null;
  ready: boolean;
  busy: boolean;
  galleryVersion: number;
  token: string;
  onAdd: (p: Project) => void;
  onOpen: (p: Project) => void;
  onChooseVideo: (asProject: boolean) => void;
  onAddAudio: (a: AudioAsset, at?: number) => void;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onRefresh: () => void;
}) {
  const [sub, setSub] = useState<'video' | 'audio'>('video');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const id = draft?.id;

  async function duplicate(project: Project) {
    setNotice('');
    setError('');
    try {
      await api(`/projects/${project.id}/duplicate`, {});
      setNotice(`Copia de «${project.name}» creada en la biblioteca.`);
      onRefresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <div className="lib-panel">
      <div className="nle-panel-title">MEDIOS <span>{library.length}</span></div>
      {notice ? <p className="lib-ok" role="status">{notice}</p> : null}
      {error ? <p className="lib-error" role="alert">{error}</p> : null}
      <div className="lib-sub-tabs">
        <button aria-pressed={sub === 'video'} onClick={() => setSub('video')}>Vídeos</button>
        <button aria-pressed={sub === 'audio'} onClick={() => setSub('audio')}>Audio</button>
      </div>

      {sub === 'video' && (
        <>
          <button
            className="nle-import"
            disabled={!ready || busy}
            onClick={() => onChooseVideo(false)}
          >
            ＋ Añadir vídeo a biblioteca
          </button>
          <div className="nle-media-list">
            {library.map(p => (
              <article key={p.id} className={p.id === id ? 'active' : ''}>
                <div className="nle-media-icon">▶</div>
                <div>
                  <strong title={p.name}>{p.name}</strong>
                  <small>
                    {stamp(p.media.duration)} · {p.media.width} × {p.media.height}
                  </small>
                </div>
                <button
                  aria-label={`Añadir ${p.name} a la línea de tiempo`}
                  disabled={busy}
                  onClick={() => onAdd(p)}
                >
                  ＋
                </button>
                <button
                  className="nle-open"
                  disabled={busy}
                  onClick={() => onOpen(p)}
                >
                  Abrir proyecto
                </button>
                <button
                  className="nle-open"
                  disabled={busy}
                  onClick={() => void duplicate(p)}
                >
                  Duplicar
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {sub === 'audio' && (
        <AudioLibrary
          key={galleryVersion}
          token={token}
          disabled={!draft || busy}
          onAdd={onAddAudio}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL: LibrarySidebar
══════════════════════════════════════════════════════════════════════ */
export function LibrarySidebar({
  /* estado del editor */
  library,
  draft,
  ready,
  busy,
  dirty,
  time,
  galleryVersion,
  token,
  fileInput,
  audioRequest,
  /* callbacks */
  api,
  onAdd,
  onOpen,
  onChooseVideo,
  onAddAudio,
  onAddMeme,
  onProject,
  onRefresh,
  onFile,
}: {
  library: Project[];
  draft: Project | null;
  ready: boolean;
  busy: boolean;
  dirty: boolean;
  time: number;
  galleryVersion: number;
  token: string;
  fileInput: React.RefObject<HTMLInputElement | null>;
  audioRequest: number;
  api: <T>(route: string, data?: unknown) => Promise<T>;
  onAdd: (p: Project) => void;
  onOpen: (p: Project) => void;
  onChooseVideo: (asProject: boolean) => void;
  onAddAudio: (a: AudioAsset, at?: number) => void;
  onAddMeme: (item: CatalogueItem, at: number) => void;
  onProject: (p: Project) => void;
  onRefresh: () => void;
  onFile: (files: File[]) => void;
}) {
  const saved = sessionStorage.getItem('nacho:lib-tab');
  const [tab, setTab] = useState(saved || 'medios');
  const [expanded, setExpanded] = useState(false);
  useEffect(()=>{
    if(audioRequest){setTab('audio');setExpanded(true);sessionStorage.setItem('nacho:lib-tab','audio');}
  },[audioRequest]);

  function switchTab(id: string) {
    setTab(id);
    setExpanded(true);
    sessionStorage.setItem('nacho:lib-tab', id);
  }

  const extDraft = draft as ExtProject | null;

  return (
    <aside className={`nle-library nle-library-v2${expanded ? ' expanded' : ''}`} data-guide="medios">
      <input ref={fileInput} type="file" accept=".mp4,.mov,.mkv,.webm" hidden multiple disabled={!ready||busy}
        onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';onFile(files);}}/>
      {/* barra de iconos vertical */}
      <nav className="lib-tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`lib-tab-btn ${tab === t.id ? 'active' : ''}`}
            title={t.label}
            aria-pressed={tab === t.id}
            onClick={() => switchTab(t.id)}
          >
            <span className="lib-tab-icon">{t.icon}</span>
            <span className="lib-tab-label">{t.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="lib-expand"
          aria-expanded={expanded}
          aria-label={expanded ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          title={expanded ? 'Ocultar panel' : 'Mostrar panel'}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? '‹' : '›'}
        </button>
      </nav>

      {/* contenido de la pestaña activa */}
      <div className="lib-panel-wrap">
        {tab === 'medios' && (
          <MediosPanel
            library={library}
            draft={draft}
            ready={ready}
            busy={busy}
            galleryVersion={galleryVersion}
            token={token}
            onAdd={onAdd}
            onOpen={onOpen}
            onChooseVideo={onChooseVideo}
            onAddAudio={onAddAudio}
            api={api}
            onRefresh={onRefresh}
          />
        )}
        {tab === 'memes' && (
          <MemesPanel
            project={extDraft}
            time={time}
            disabled={!draft || busy}
            onAddMeme={onAddMeme}
          />
        )}
        {tab === 'audio' && (
          <div className="lib-panel">
            <div className="nle-panel-title">AUDIO &amp; EFECTOS</div>
            <AudioLibrary
              key={galleryVersion}
              token={token}
              disabled={!draft || busy}
              onAdd={onAddAudio}
            />
          </div>
        )}
        {tab === 'texto' && (
          <TextoPanel
            project={extDraft}
            disabled={!draft || busy}
            api={api}
            onProject={onProject}
          />
        )}
        {tab === 'rostro' && (
          <RostroPanel
            project={extDraft}
            disabled={!draft || busy}
            api={api}
            onProject={onProject}
          />
        )}
        {tab === 'creador' && (
          <CreadorPanel
            key={draft?.id}
            project={extDraft}
            disabled={!draft || busy || dirty}
            api={api}
            onProject={onProject}
          />
        )}
        {tab === 'asistente' && (
          <AsistentePanel
            project={extDraft}
            disabled={!draft || busy}
            api={api}
            onProject={onProject}
          />
        )}
      </div>
    </aside>
  );
}
