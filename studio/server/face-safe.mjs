import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,CACHE_ROOT,python,run} from './core.mjs';
import {cacheJson,writeCacheJson,placementKey,fingerPrint,throwIfCancelled} from './render-cache.mjs';

const WORKER = path.join(ROOT, 'workers/face_safe.py');
const FACE_PADDING = 0.035;
const SIZES = [0.30, 0.27, 0.24, 0.21, 0.18];
const MARGIN = 0.045;
const BOTTOM = 0.09;
// Las webcams de reacción suelen ocupar la esquina inferior izquierda. La reservamos
// siempre, aunque el detector no llegue a ver una cara pequeña, girada o con poca luz.
const LOW_LEFT_GUARD = {x: 0, y: 0.55, w: 0.38, h: 0.45};

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function padded(face) {
  return {
    x: Math.max(0, face.x - FACE_PADDING),
    y: Math.max(0, face.y - FACE_PADDING),
    w: Math.min(1, face.w + FACE_PADDING * 2),
    h: Math.min(1, face.h + FACE_PADDING * 2),
  };
}

// The facecam is more than a face box: it is a camera window in a corner. Protect
// a generous area around small corner faces so an overlay never sits over the
// creator's reaction camera, even when the detector only sees a few pixels of face.
function cameraGuard(face) {
  const centerX = face.x + face.w / 2;
  const centerY = face.y + face.h / 2;
  const side = centerX < 0.38 ? 'left' : centerX > 0.62 ? 'right' : null;
  if (!side || centerY < 0.48) return null;
  const padX = Math.max(0.10, face.w * 1.7);
  const padY = Math.max(0.10, face.h * 1.15);
  return {
    x: Math.max(0, face.x - padX),
    y: Math.max(0, face.y - padY),
    w: Math.min(1, face.w + padX * 2),
    h: Math.min(1, face.h + padY * 2),
    position: side === 'left' ? 'low-left-camera' : 'low-right-camera',
  };
}

function candidatePositions(size) {
  const right = 1 - MARGIN - size;
  const bottom = 1 - BOTTOM - size;
  const center = (1 - size) / 2;
  const xs = [
    {name: 'left', x: MARGIN},
    {name: 'center', x: center},
    {name: 'right', x: right},
  ];
  const ys = [
    {name: 'top', y: MARGIN},
    {name: 'middle', y: center},
    {name: 'bottom', y: bottom},
  ];
  return ys.flatMap(row => xs.map(col => ({
    name: `${row.name}-${col.name}`,
    x: col.x,
    y: row.y,
  })));
}

function regionRisk(grid, box) {
  if (!grid?.length) return 0;
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  if (!cols) return 0;
  const x0 = Math.max(0, Math.floor(box.x * cols));
  const x1 = Math.min(cols, Math.ceil((box.x + box.w) * cols));
  const y0 = Math.max(0, Math.floor(box.y * rows));
  const y1 = Math.min(rows, Math.ceil((box.y + box.h) * rows));
  let sum = 0, max = 0, count = 0;
  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const value = Number(grid[row][col]) || 0;
      sum += value;
      max = Math.max(max, value);
      count++;
    }
  }
  return count ? Math.min(1, sum / count + max * 0.35) : 0;
}

function variation(seed, name) {
  let hash = 2166136261;
  for (const char of `${seed}:${name}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

export function choosePlacement(faces = [], {subtitlePosition = 'bottom', subtitles = true, grid = null, seed = 0} = {}) {
  const captionBand = subtitles
    ? subtitlePosition === 'top'
      ? {x: 0, y: 0, w: 1, h: 0.22}
      : {x: 0, y: 0.78, w: 1, h: 0.22}
    : null;
  const safeFaces = faces.map(padded);
  // If the detector found nothing at all, keep the conservative reaction-cam
  // guard as a last resort. When faces are visible, their camera guards are
  // more precise and do not block an empty left side forever.
  if (!faces.length) safeFaces.push(LOW_LEFT_GUARD);
  for (const face of faces) {
    const guard = cameraGuard(face);
    if (guard) safeFaces.push(guard);
  }
  const candidates = [];
  for (const size of SIZES) {
    for (const candidate of candidatePositions(size)) {
      const box = {x: candidate.x, y: candidate.y, w: size, h: size};
      if (safeFaces.some(face => intersects(box, face))) continue;
      if (captionBand && intersects(box, captionBand)) continue;
      const textRisk = regionRisk(grid, box);
      const score = textRisk * 3.2 - (size - 0.18) * 0.65 + variation(seed, candidate.name) * 0.045;
      candidates.push({
        x: Number(box.x.toFixed(4)),
        y: Number(box.y.toFixed(4)),
        w: size,
        h: size,
        position: candidate.name,
        captionSafe: true,
        textRisk: Number(textRisk.toFixed(4)),
        score: Number(score.toFixed(4)),
        cameraSafe: true,
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const calm = candidates.filter(candidate => candidate.textRisk <= 0.11);
  return calm[0] || candidates[0] || null;
}

export async function sampleFaces(video, ranges, report, {signal}={}) {
  if (!ranges.length) return [];
  const dir = path.join(CACHE_ROOT, `faces-${randomUUID()}`);
  await fs.mkdir(dir, {recursive: true});
  const request = path.join(dir, 'request.json');
  const output = path.join(dir, 'faces.json');
  await fs.writeFile(request, JSON.stringify({ranges}), 'utf8');
  try {
    await run(python, [WORKER, video, request, output], {log: report, signal});
    return JSON.parse(await fs.readFile(output, 'utf8')).ranges || [];
  } finally {
    await fs.rm(dir, {recursive: true, force: true}).catch(() => {});
  }
}

export async function placementsForArtifact(project, artifact, report, {signal}={}) {
  throwIfCancelled(signal);
  const media = Array.isArray(project.automatic?.direction?.media)
    ? project.automatic.direction.media
    : [];
  const visuals = [];
  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    if (!['meme', 'pexels'].includes(item.kind)) continue;
    if (item.status === 'rejected') continue;
    const at = Math.max(0, Number(item.outputTime) || 0);
    const duration = Math.max(0.1, Math.min(Number(item.duration) || 3.2, artifact.duration - at));
    if (!Number.isFinite(at) || at >= artifact.duration) {
      visuals.push({index, invalid: true});
      continue;
    }
    visuals.push({index, item, start: at, end: at + duration});
  }
  const ranges = visuals.filter(v => !v.invalid).map(v => ({start: v.start, end: v.end}));
  const key = placementKey({
    artifact: artifact.composition ? {composition: artifact.composition} : await fingerPrint(artifact.file),
    media: visuals.map(({index, item, invalid, start, end}) => ({index, invalid, start, end, kind: item?.kind, file: item?.file, status: item?.status, selected: item?.resourceId || null})),
    settings: {subtitlePosition: project.settings?.subtitlePosition, subtitles: project.settings?.subtitles},
  });
  const cached = await cacheJson('placements', key);
  if (cached?.placements) {
    report('[cache] Colocaciones reutilizadas sin volver a analizar caras');
    return new Map(Object.entries(cached.placements).map(([index, placement]) => [Number(index), placement]));
  }
  let sampled = [];
  if (ranges.length) {
    try {
      sampled = await sampleFaces(artifact.file, ranges, report, {signal});
    } catch (error) {
      if (signal?.aborted) throw error;
      report(`No se pudo comprobar caras para colocar memes; se omiten: ${error.message}`);
      const skip = new Map();
      for (const visual of visuals) skip.set(visual.index, null);
      return skip;
    }
  }
  const placements = new Map();
  let rangeIndex = 0;
  for (const visual of visuals) {
    if (visual.invalid) {
      placements.set(visual.index, null);
      continue;
    }
    const range = sampled[rangeIndex++] || {faces: []};
    const placement = choosePlacement(range.faces || [], {
      subtitlePosition: project.settings?.subtitlePosition,
      subtitles: project.settings?.subtitles !== false,
      grid: range.grid || null,
      seed: visual.index,
    });
    placements.set(visual.index, placement);
    if (!placement) {
      report(`Meme omitido en ${visual.start.toFixed(1)} s: no hay una zona que evite caras, facecam y subtítulos`);
    } else if ((range.faces || []).length) {
      report(`Meme en ${visual.start.toFixed(1)} s colocado en ${placement.position} (${Math.round(placement.w * 100)}%; texto ${Math.round((placement.textRisk || 0) * 100)}%), fuera de ${range.faces.length} zona(s) facial(es)`);
    } else {
      report(`Meme en ${visual.start.toFixed(1)} s colocado en ${placement.position} (${Math.round(placement.w * 100)}%; texto ${Math.round((placement.textRisk || 0) * 100)}%)`);
    }
  }
  throwIfCancelled(signal);
  await writeCacheJson('placements', key, {placements: Object.fromEntries(placements), createdAt: new Date().toISOString()});
  return placements;
}
