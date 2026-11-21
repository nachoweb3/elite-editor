import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from './core.mjs';

export const CACHE_ROOT = path.join(ROOT, 'cache', 'render-v3');

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

export function cacheHash(value, length = 28) {
  return createHash('sha256').update(stable(value)).digest('hex').slice(0, length);
}

export async function fingerPrint(file) {
  if (!file) return null;
  try {
    const stat = await fs.stat(file);
    return {file, size: stat.size, mtimeMs: Math.round(stat.mtimeMs)};
  } catch {
    return null;
  }
}

export async function ensureCacheDir(kind) {
  const directory = path.join(CACHE_ROOT, kind);
  await fs.mkdir(directory, {recursive: true});
  return directory;
}

export async function cachePath(kind, key, extension = '.mp4') {
  const directory = await ensureCacheDir(kind);
  return path.join(directory, `${key}${extension}`);
}

export async function cacheFile(kind, key, extension = '.mp4') {
  const file = await cachePath(kind, key, extension);
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 0 ? {file, size: stat.size, mtimeMs: Math.round(stat.mtimeMs)} : null;
  } catch {
    return null;
  }
}

export async function cacheJson(kind, key) {
  const file = await cachePath(kind, key, '.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeCacheJson(kind, key, value) {
  const file = await cachePath(kind, key, '.json');
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(file + '.tmp', file);
}

export async function copyAtomic(source, target) {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.copyFile(source, temporary);
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, {force: true}).catch(() => {});
    throw error;
  }
}

export async function linkOrCopy(source, target) {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.rm(target, {force: true}).catch(() => {});
  try {
    await fs.link(source, target);
  } catch {
    await fs.copyFile(source, target);
  }
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Error('Trabajo cancelado');
}

export function partKey({source, clip, width, height, filter, hasAudio, encoderVersion}) {
  return cacheHash({
    version: 5,
    source,
    start: clip.start,
    end: clip.end,
    transitionIn: clip.transitionIn || 'none',
    motion: clip.motion || 'none',
    width,
    height,
    filter,
    hasAudio,
    encoderVersion,
  });
}

export function compositeKey({parts, words, settings, duration, width, height, fps, quality, willDecorate, music, tracks, title, soundEffects, audioPlan, assets}) {
  return cacheHash({
    version: 6,
    parts,
    words,
    settings,
    duration,
    width,
    height,
    fps,
    quality,
    willDecorate,
    music,
    tracks,
    audioPlan,
    assets,
    title,
    soundEffects,
  });
}

export function overlayKey({artifact, media, visuals, audio, placements, inserts, width, height}) {
  return cacheHash({
    version: 6,
    artifact,
    media,
    visuals,
    audio,
    placements: [...placements.entries()].sort(([a], [b]) => a - b),
    inserts,
    width,
    height,
  });
}

export function placementKey({artifact, media, settings}) {
  return cacheHash({version: 3, artifact, media, settings});
}
