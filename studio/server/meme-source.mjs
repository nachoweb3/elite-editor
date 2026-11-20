import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './core.mjs';
import {searchGiphy} from './giphy.mjs';
import {fetchOpenverseMeme} from './openverse.mjs';

const MAX_BYTES = 30 * 1024 * 1024;

export async function fetchGiphyMeme(query) {
  if (typeof query !== 'string' || query.trim().length < 2) throw new Error('Consulta de meme vacía');
  const result = await searchGiphy(query, {limit: 8});
  const item = result.items.find(candidate => candidate.mp4Url);
  if (!item) throw new Error('Giphy no devolvió un MP4 utilizable');
  const response = await fetch(item.mp4Url, {signal: AbortSignal.timeout(30000), redirect: 'follow'});
  if (!response.ok) throw new Error(`Giphy MP4 respondió HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Meme de Giphy vacío o demasiado grande');
  await fs.mkdir(path.join(ROOT, 'input/memes'), {recursive: true});
  const name = `giphy-${item.id}.mp4`;
  const file = path.join(ROOT, 'input/memes', name);
  const attribution = [item.author, 'Giphy', item.page].filter(Boolean).join(' · ');
  await fs.writeFile(file, buffer);
  await fs.writeFile(file + '.json', JSON.stringify({
    description: item.title || query,
    author: item.author || '',
    page: item.page || '',
    provider: 'Giphy',
    source: 'Giphy',
    license: 'Giphy',
    licenseUrl: 'https://giphy.com',
    attribution,
    query,
    useAudio: false,
    greenScreen: false,
  }, null, 2));
  return {
    id: `giphy-${item.id}`,
    kind: 'meme',
    name,
    description: item.title || query,
    file,
    greenScreen: false,
    useAudio: false,
    provider: 'Giphy',
    source: 'Giphy',
    author: item.author || '',
    page: item.page || '',
    license: 'Giphy',
    licenseUrl: 'https://giphy.com',
    attribution,
  };
}

// Openverse first: it only returns CC0, public-domain, CC BY or CC BY-SA media.
// Giphy is the last resort and always carries author/source attribution.
export async function fetchInternetMeme(query) {
  try {
    const open = await fetchOpenverseMeme(query);
    if (open) return open;
  } catch {}
  return fetchGiphyMeme(query);
}
