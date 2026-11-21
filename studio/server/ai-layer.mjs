import {randomUUID} from 'node:crypto';
import {load,save} from './core.mjs';
import {readAssets} from './engine.mjs';
import {catalogue} from './director.mjs';
import {CLIP_TRANSITIONS,isClipTransition} from '../shared/transitions.mjs';

const STATUSES = new Set(['pending','accepted','rejected']);
const EFFECTS = Object.keys(CLIP_TRANSITIONS);
const MEDIA_KINDS = new Set(['meme','sound','pexels']);

function busy(p) {
  return p.jobs.some(job => ['queued','running'].includes(job.status));
}

function directionOf(p) {
  const direction = p.automatic?.direction;
  if (!direction || !Array.isArray(direction.media)) throw new Error('Este proyecto todavía no tiene intervenciones automáticas');
  if (!Array.isArray(direction.events)) direction.events = [];
  return direction;
}

function outputDuration(p) {
  const fromArtifact = Number(p.artifacts?.export?.duration || p.artifacts?.preview?.duration);
  if (Number.isFinite(fromArtifact) && fromArtifact > 0) return fromArtifact;
  const fromClips = p.clips.filter(c => c.enabled).reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);
  return fromClips || Number(p.media?.duration) || 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mediaItems(p) {
  const media = directionOf(p).media;
  return media.map((item, index) => ({item, index})).filter(({item}) => MEDIA_KINDS.has(item.kind));
}

function eventItems(p) {
  return directionOf(p).events.map((item, index) => ({item, index})).filter(({item}) => item.type === 'transition');
}

function activeClips(p) {
  return p.clips.filter(c => c.enabled);
}

function startOfClip(p, target) {
  let offset = 0;
  for (const clip of activeClips(p)) {
    if (clip === target) return offset;
    offset += Math.max(0, clip.end - clip.start);
  }
  return null;
}

function clipAt(p, outputTime) {
  let offset = 0;
  // Prefer the clip that *starts* at the requested time. A transition is
  // attached to the incoming clip, not to the outgoing one.
  for (const clip of activeClips(p)) {
    const length = Math.max(0, clip.end - clip.start);
    if (Math.abs(outputTime - offset) < 0.07) return {clip, start: offset, length, inside: false};
    offset += length;
  }
  offset = 0;
  for (const clip of activeClips(p)) {
    const length = Math.max(0, clip.end - clip.start);
    const end = offset + length;
    if (outputTime >= offset - 0.06 && outputTime <= end + 0.06) {
      return {clip, start: offset, length, inside: outputTime > offset + 0.06 && outputTime < end - 0.06};
    }
    offset = end;
  }
  return null;
}

function clearTransition(p, outputTime) {
  let offset = 0;
  for (const clip of activeClips(p)) {
    const start = offset;
    const length = Math.max(0, clip.end - clip.start);
    if (Math.abs(outputTime - start) < 0.07) {
      clip.transitionIn = 'none';
      return;
    }
    offset += length;
  }
}

// A transition in this editor belongs to the start of a clip. Applying one at a
// different montage time creates the required cut, so moving it actually changes
// what the rendered transition does instead of only changing its label.
function applyTransition(p, outputTime, effect) {
  const target = clipAt(p, outputTime);
  if (!target) return {at: null};
  if (!target.inside) {
    target.clip.transitionIn = effect;
    return {at: target.clip.start};
  }
  const sourceTime = target.clip.start + (outputTime - target.start);
  if (sourceTime - target.clip.start < 0.06 || target.clip.end - sourceTime < 0.06) {
    target.clip.transitionIn = effect;
    return {at: target.clip.start};
  }
  const index = p.clips.indexOf(target.clip);
  if (index < 0) throw new Error('No se pudo localizar el corte que contiene la transición');
  const first = {...target.clip, end: sourceTime};
  const second = {...target.clip, id: randomUUID(), start: sourceTime, transitionIn: effect};
  p.clips.splice(index, 1, first, second);
  return {at: sourceTime};
}

async function resourcePool(kind) {
  const [catalog, assets] = await Promise.all([catalogue(), readAssets()]);
  const wanted = kind === 'sound' ? 'sound' : kind === 'pexels' ? 'broll' : 'meme';
  const pool = [...catalog, ...assets].filter(asset => asset.kind === wanted && asset.file);
  return pool.filter((asset, index) => pool.findIndex(candidate => candidate.file === asset.file) === index);
}

function exposeAsset(item) {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind === 'broll' ? 'pexels' : item.kind,
    description: item.description || '',
    duration: Number(item.duration) || 0,
    author: item.author || '',
    license: item.license || '',
    page: item.page || '',
    source: item.source || '',
    provider: item.provider || '',
    greenScreen: item.greenScreen ?? null,
    useAudio: item.useAudio === true,
  };
}

async function assetFor(kind, id) {
  const pool = await resourcePool(kind);
  return pool.find(asset => asset.id === id) || null;
}

function applyResource(item, asset) {
  item.file = asset.file;
  item.name = asset.name;
  item.description = asset.description || '';
  item.resourceId = asset.id;
  item.source = asset.source || '';
  item.author = asset.author || '';
  item.page = asset.page || '';
  item.license = asset.license || '';
  item.provider = asset.provider || '';
  item.attribution = asset.attribution || '';
  if (asset.greenScreen !== undefined) item.greenScreen = asset.greenScreen;
  if (asset.useAudio !== undefined) item.useAudio = asset.useAudio;
  if (!item.duration) item.duration = Math.min(3.2, Number(asset.duration) || 3.2);
}

async function updateMedia(p, body, item) {
  const changes = body.changes || {};
  const duration = outputDuration(p);
  let placementDirty = false;
  if (changes.status !== undefined) {
    if (!STATUSES.has(changes.status)) throw new Error('Estado de intervención inválido');
    item.status = changes.status;
  }
  if (changes.outputTime !== undefined) {
    const value = finite(changes.outputTime, NaN);
    if (!Number.isFinite(value) || value < 0 || value > duration) throw new Error('Tiempo fuera del montaje');
    item.outputTime = Number(clamp(value, 0, Math.max(0, duration - 0.1)).toFixed(3));
    placementDirty = true;
  }
  if (changes.duration !== undefined) {
    const value = finite(changes.duration, NaN);
    if (!Number.isFinite(value) || value < 0.1 || value > 12) throw new Error('Duración inválida');
    item.duration = Number(value.toFixed(3));
    placementDirty = true;
  }
  if (changes.volume !== undefined) {
    const value = finite(changes.volume, NaN);
    if (!Number.isFinite(value) || value < 0 || value > 2) throw new Error('Volumen inválido');
    item.volume = Number(value.toFixed(3));
  }
  if (changes.useAudio !== undefined) item.useAudio = changes.useAudio === true;
  if (changes.resourceId !== undefined) {
    const asset = await assetFor(item.kind, String(changes.resourceId));
    if (!asset) throw new Error('El recurso elegido no pertenece a este tipo de intervención');
    applyResource(item, asset);
    placementDirty = true;
  }
  if (changes.regenerate === true) {
    const pool = await resourcePool(item.kind);
    if (!pool.length) throw new Error('No hay recursos alternativos para esta intervención');
    const current = pool.findIndex(asset => asset.file === item.file || asset.id === item.resourceId);
    applyResource(item, pool[(current + 1) % pool.length]);
    item.status = 'pending';
    item.regeneratedAt = new Date().toISOString();
    placementDirty = true;
  }
  if (item.outputTime + item.duration > duration) item.duration = Math.max(0.1, duration - item.outputTime);
  // A saved placement belonged to the previous time/resource. Do not paint an
  // old overlay over a new frame: the next face-safe pass calculates a new one.
  if (placementDirty) item.placement = null;
  item.updatedAt = new Date().toISOString();
}

async function updateEvent(p, body, event) {
  const changes = body.changes || {};
  const duration = outputDuration(p);
  const oldTime = Number(event.outputTime) || 0;
  if (changes.status !== undefined) {
    if (!STATUSES.has(changes.status)) throw new Error('Estado de transición inválido');
    event.status = changes.status;
    if (event.status === 'rejected') clearTransition(p, oldTime);
    else if (event.status === 'accepted') applyTransition(p, oldTime, event.effect || 'fadeblack');
  }
  if (changes.effect !== undefined) {
    if (!isClipTransition(changes.effect)) throw new Error('Transición inválida');
    event.effect = changes.effect;
    if (event.status !== 'rejected') applyTransition(p, oldTime, event.effect);
  }
  if (changes.outputTime !== undefined) {
    const nextTime = finite(changes.outputTime, NaN);
    if (!Number.isFinite(nextTime) || nextTime < 0 || nextTime > duration) throw new Error('Tiempo de transición fuera del montaje');
    if (event.status !== 'rejected') clearTransition(p, oldTime);
    const applied = event.status === 'rejected' ? {at: null} : applyTransition(p, nextTime, event.effect || 'fadeblack');
    event.outputTime = Number(clamp(nextTime, 0, Math.max(0, duration - 0.1)).toFixed(3));
    if (applied.at !== null) event.at = Number(Number(applied.at).toFixed(3));
  }
  if (changes.regenerate === true) {
    const current = EFFECTS.indexOf(event.effect);
    event.effect = EFFECTS[(current + 1) % EFFECTS.length];
    event.status = 'pending';
    if (event.status !== 'rejected') applyTransition(p, oldTime, event.effect);
    event.regeneratedAt = new Date().toISOString();
  }
  event.updatedAt = new Date().toISOString();
}

export async function updateIntervention(id, body) {
  const p = await load(id);
  if (busy(p)) throw new Error('Espera a que termine el procesamiento antes de modificar intervenciones');
  if (body?.allStatus && STATUSES.has(body.allStatus)) {
    const direction = directionOf(p);
    const filterKind = body?.kind;
    for (const entry of mediaItems(p)) {
      if (!filterKind || entry.item.kind === filterKind) {
        entry.item.status = body.allStatus;
        entry.item.updatedAt = new Date().toISOString();
      }
    }
    if (!filterKind || filterKind === 'transition') {
      for (const entry of eventItems(p)) {
        entry.item.status = body.allStatus;
        const oldTime = Number(entry.item.outputTime) || 0;
        if (body.allStatus === 'rejected') clearTransition(p, oldTime);
        else if (body.allStatus === 'accepted') applyTransition(p, oldTime, entry.item.effect || 'fadeblack');
        entry.item.updatedAt = new Date().toISOString();
      }
    }
    p.revision = Number(p.revision || 0) + 1;
    p.artifacts = {};
    p.automatic.status = 'review';
    p.automatic.updatedAt = new Date().toISOString();
    await save(p);
    return p;
  }
  const target = body?.target;
  const index = Number(body?.index);
  if (!['media','event'].includes(target) || !Number.isInteger(index)) throw new Error('Intervención inválida');
  const direction = directionOf(p);
  const list = target === 'media' ? mediaItems(p) : eventItems(p);
  const found = list.find(entry => entry.index === index);
  if (!found) throw new Error('Intervención no encontrada');
  if (target === 'media') await updateMedia(p, body, found.item);
  else await updateEvent(p, body, found.item);
  p.revision = Number(p.revision || 0) + 1;
  p.artifacts = {};
  p.automatic.status = 'review';
  p.automatic.updatedAt = new Date().toISOString();
  await save(p);
  return p;
}

export async function setMusic(id, body) {
  const p = await load(id);
  if (busy(p)) throw new Error('Espera a que termine el procesamiento antes de cambiar la música');
  const musicId = body?.musicId === null || body?.musicId === '' ? null : String(body?.musicId || '');
  const assets = await readAssets();
  if (musicId) {
    const asset = assets.find(a => a.id === musicId && a.kind === 'music');
    if (!asset) throw new Error('Música no encontrada en la biblioteca');
  }
  const volume = finite(body?.musicVolume, p.settings.musicVolume ?? 0.05);
  if (volume < 0 || volume > 0.3) throw new Error('El volumen de música debe estar entre 0 y 0.3');
  p.settings = {...p.settings, musicId, musicVolume: Number(volume.toFixed(3))};
  p.revision = Number(p.revision || 0) + 1;
  p.artifacts = {};
  p.automatic = p.automatic ? {...p.automatic, status: p.automatic.status === 'working' ? 'working' : 'review'} : p.automatic;
  await save(p);
  return p;
}

export async function interventionCatalogue() {
  const [catalog, assets] = await Promise.all([catalogue(), readAssets()]);
  const pool = [...catalog, ...assets].filter(asset => ['meme','sound','broll','music'].includes(asset.kind));
  return pool.filter((asset, index) => pool.findIndex(candidate => candidate.file === asset.file || candidate.id === asset.id) === index).map(exposeAsset);
}
