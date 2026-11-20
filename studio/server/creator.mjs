// Server side of the Creador panel in the manual editor.
// The short planner lives in shorts.mjs and is shared with the autonomous
// vertical renders, so both rank a moment with the same rules.
import {load,save,run} from './core.mjs';
import {planShortCandidates} from './shorts.mjs';

const MIN_WINDOW = 2;

function busy(project) {
  return (project.jobs || []).some(job => ['queued', 'running'].includes(job.status));
}

function montageDuration(project) {
  const fromClips = (project.clips || [])
    .filter(clip => clip.enabled)
    .reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0);
  return fromClips || Number(project.media?.duration) || 0;
}

async function transcriptOwner(project) {
  if (project.transcript?.length) return project;
  const sourceId = (project.clips || []).find(clip => clip.enabled && clip.sourceId)?.sourceId;
  if (!sourceId || sourceId === project.id) return project;
  const candidate = await load(sourceId).catch(() => null);
  return candidate?.transcript?.length ? candidate : project;
}

export async function shortCandidates(id, {min = 15, max = 30} = {}) {
  const project = await load(id);
  const owner = await transcriptOwner(project);
  const plan = planShortCandidates(owner.transcript || [], {
    sourceDuration: Number(owner.media?.duration) || 0,
    min,
    max,
  });
  return {
    revision: project.revision,
    sourceId: owner.id,
    candidates: plan.items,
    range: plan.range,
    fallback: plan.fallback,
    hint: plan.items.length
      ? ''
      : 'La transcripción no tiene frases en ese rango. Prueba otro rango o analiza la grabación primero.',
  };
}

// Turns the project into that one moment, vertically. It is a normal edit: the
// file is not touched, the previous montage stays in history and any automatic
// resource placed over the old timeline is cleared because its time no longer
// exists in the new one.
export async function applyShortWindow(id, {start, end, revision} = {}) {
  const project = await load(id);
  if (busy(project)) throw new Error('Espera a que termine el procesamiento antes de cambiar el montaje');
  if (revision !== undefined && Number(revision) !== project.revision) {
    throw new Error('El montaje cambió. Vuelve a buscar los clips antes de aplicar uno.');
  }
  if (!project.source) throw new Error('La grabación original ya no está disponible');
  const duration = Number(project.media?.duration) || 0;
  const from = Number(start);
  const to = Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('El clip elegido no es válido');
  if (from < 0 || to > duration + 0.001 || to - from < MIN_WINDOW) {
    throw new Error(`El clip debe durar al menos ${MIN_WINDOW} s y estar dentro de la grabación`);
  }
  const length = to - from;
  project.history = [...(project.history || []), {
    settings: project.settings,
    clips: project.clips,
    audioTracks: project.audioTracks || [],
    automatic: structuredClone(project.automatic ?? null),
  }].slice(-20);
  project.clips = [{id: '0', start: from, end: to, enabled: true, reason: 'Clip elegido en Creador'}];
  if (Array.isArray(project.audioTracks) && project.audioTracks.length) {
    project.audioTracks = project.audioTracks.flatMap(track => {
      const at = Number(track.at) || 0;
      if (at < from - 0.001) return [];
      const local = at - from;
      if (local >= length) return [];
      return [{...track, at: Number(local.toFixed(3)), duration: Number(Math.min(Number(track.duration) || 0, length - local).toFixed(3))}]
        .filter(item => item.duration > 0.05);
    });
  }
  if (project.automatic) {
    project.automatic = {
      ...project.automatic,
      status: 'review',
      direction: {events: [], media: [], summaries: [], credits: []},
    };
  }
  project.settings = {...project.settings, profile: 'reels', fit: 'contain'};
  project.reviewed = false;
  project.revision += 1;
  project.artifacts = {};
  await save(project);
  return project;
}

function parseLoudness(text) {
  const start = text.lastIndexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function round(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

// Single-pass EBU R128 measurement over at most five minutes. Enough to tell
// whether a voice sits below or above the -14 LUFS social target without
// waiting for a long recording to be analysed end to end.
export async function measureLoudness(id) {
  const project = await load(id);
  if (!project.source) throw new Error('La grabación original ya no está disponible');
  if (!project.media?.audio) throw new Error('Este vídeo no tiene pista de audio');
  const seconds = Math.min(300, Math.max(5, Number(project.media.duration) || 5));
  const {err} = await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-t', String(seconds), '-i', project.source,
    '-vn', '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-',
  ], {timeout: 180000});
  const parsed = parseLoudness(err);
  if (!parsed) throw new Error('No se pudo medir el volumen de este archivo');
  const integrated = round(parsed.input_i);
  const truePeak = round(parsed.input_tp);
  const lra = round(parsed.input_lra);
  let verdict;
  if (integrated === null) verdict = 'Sin medida de volumen integrado';
  else if (integrated < -20) verdict = 'Bajo: sube la voz o normaliza antes de exportar';
  else if (integrated > -11) verdict = 'Alto: baja el nivel para evitar saturación en el móvil';
  else verdict = 'Correcto para publicar en redes';
  const measured = Number(project.media.duration) > 300 ? 'primeros 5 minutos' : 'vídeo completo';
  return {
    integrated,
    truePeak,
    lra,
    target: -14,
    verdict,
    measured,
    advice: integrated === null
      ? 'No hay muestras suficientes de audio.'
      : `Objetivo −14 LUFS: ${integrated < -14 ? 'faltan' : 'sobran'} ${Math.abs(integrated + 14).toFixed(1)} dB. Pico real ${truePeak ?? '—'} dBTP (conviene no pasar de −1).`,
  };
}

export {montageDuration};
