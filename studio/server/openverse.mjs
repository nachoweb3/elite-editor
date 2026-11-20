import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './core.mjs';

const API = 'https://api.openverse.org/v1/images/';
const MAX_BYTES = 25 * 1024 * 1024;
const OPEN_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa']);
const STOP = new Set(['meme', 'memes', 'this', 'that', 'the', 'a', 'an', 'is', 'of', 'for', 'with', 'and', 'to', 'in', 'on', 'reaction', 'funny']);

const strip = value => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();
const normalize = value => strip(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');
const terms = query => normalize(query).split(/[^a-z0-9]+/).filter(term => term.length > 2 && !STOP.has(term));

function mediaUrl(item) {
  for (const raw of [item.url, item.thumbnail]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      const match = /\.(jpe?g|png|webp)$/i.exec(url.pathname);
      if (match) return {url: raw, ext: match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()};
    } catch {}
  }
  return null;
}

function relevance(item, query) {
  const haystack = normalize([item.title, ...(item.tags || []).map(tag => tag.name)].join(' '));
  const wanted = terms(query);
  const hits = wanted.filter(term => haystack.includes(term)).length;
  const wantsMeme = /\bmemes?\b/i.test(query);
  const hasMeme = /\bmemes?\b/i.test(haystack);
  return hits > 0 && (!wantsMeme || hasMeme);
}

function score(item, query) {
  const haystack = normalize([item.title, ...(item.tags || []).map(tag => tag.name)].join(' '));
  const hits = terms(query).filter(term => haystack.includes(term)).length;
  const license = String(item.license || '').toLowerCase();
  return (license === 'cc0' || license === 'pdm' ? 100 : 0) + hits * 10 + (/\bmemes?\b/i.test(haystack) ? 5 : 0);
}

export async function fetchOpenverseMeme(query) {
  if (typeof query !== 'string' || query.trim().length < 2) throw new Error('Consulta de meme vacía');
  const params = new URLSearchParams({
    q: query.trim(),
    page_size: '12',
    license_type: 'commercial,modification',
    mature: 'false',
  });
  const response = await fetch(`${API}?${params}`, {
    headers: {'User-Agent': 'NACHO-WEB3-Studio/1.0 (+local video editor)'},
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Openverse respondió HTTP ${response.status}`);
  const data = await response.json();
  const candidates = (data.results || [])
    .filter(item => OPEN_LICENSES.has(String(item.license || '').toLowerCase()))
    .map(item => ({item, ...mediaUrl(item)}))
    .filter(entry => entry.url && relevance(entry.item, query))
    .sort((a, b) => score(b.item, query) - score(a.item, query));
  if (!candidates.length) return null;
  await fs.mkdir(path.join(ROOT, 'input/memes'), {recursive: true});
  for (const entry of candidates.slice(0, 4)) {
    try {
      const media = await fetch(entry.url, {signal: AbortSignal.timeout(30000), redirect: 'follow'});
      if (!media.ok) continue;
      const type = String(media.headers.get('content-type') || '');
      if (!type.startsWith('image/')) continue;
      const buffer = Buffer.from(await media.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_BYTES) continue;
      const id = String(entry.item.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || Math.random().toString(36).slice(2);
      const name = `openverse-${id}.${entry.ext}`;
      const file = path.join(ROOT, 'input/memes', name);
      const license = String(entry.item.license || '').toLowerCase();
      const author = strip(entry.item.creator);
      const page = String(entry.item.foreign_landing_url || '');
      const licenseUrl = String(entry.item.license_url || '');
      const provider = 'Openverse';
      const source = strip(entry.item.source);
      const description = strip(entry.item.title) || query;
      const attribution = `${author || 'Autor desconocido'} · ${license.toUpperCase()}${source ? ' · ' + source : ''}`;
      await fs.writeFile(file, buffer);
      await fs.writeFile(file + '.json', JSON.stringify({
        description,
        author,
        page,
        provider,
        source,
        license,
        licenseUrl,
        query,
        attribution,
        useAudio: false,
        greenScreen: false,
      }, null, 2));
      return {
        id: `openverse-${id}`,
        kind: 'meme',
        name,
        description,
        file,
        greenScreen: false,
        useAudio: false,
        provider,
        source,
        author,
        page,
        license,
        licenseUrl,
        attribution,
        duration: 2.6,
      };
    } catch {}
  }
  return null;
}
