// Giphy proxy + local key storage. The key never leaves this computer except
// as the api_key query parameter sent to api.giphy.com from this server.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT, atomic} from './core.mjs';

const secretFile = path.join(ROOT, 'config/giphy.local.json');
const envFile = path.join(ROOT, '.env.local');

async function envKey() {
  if (process.env.GIPHY_API_KEY) return process.env.GIPHY_API_KEY.trim();
  try {
    const text = await fs.readFile(envFile, 'utf8');
    const match = text.match(/^\s*(?:NEXT_PUBLIC_|VITE_)?GIPHY_API_KEY\s*=\s*(.*?)\s*$/m);
    return (match?.[1] || '').replace(/^(['"])(.*)\1$/, '$2').trim();
  } catch {
    return '';
  }
}

async function fileKey() {
  try {
    const data = JSON.parse(await fs.readFile(secretFile, 'utf8'));
    return typeof data.key === 'string' ? data.key.trim() : '';
  } catch {
    return '';
  }
}

async function key() {
  // A key saved from the panel wins over the optional environment fallback.
  return (await fileKey()) || (await envKey());
}

export async function giphyStatus() {
  return {configured: Boolean(await key())};
}

export async function saveGiphyKey(value) {
  if (typeof value !== 'string') throw Error('Clave de Giphy inválida');
  const cleaned = value.trim();
  if (!cleaned || cleaned.length < 10 || cleaned.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    throw Error('Clave de Giphy inválida: revisa que la copiaste completa');
  }
  await atomic(secretFile, {key: cleaned});
  return {configured: true};
}

function normalize(payload) {
  return (payload.data || []).flatMap((item) => {
    const images = item.images || {};
    const preview = images.fixed_width || images.downsized_medium || images.original;
    const original = images.original || images.downsized_medium || images.fixed_width;
    if (!item.id || !preview?.url || !original?.url) return [];
    const width = Number(original.width || preview.width);
    const height = Number(original.height || preview.height);
    return [{
      id: item.id,
      title: (item.title || '').trim() || 'GIF',
      previewUrl: preview.url,
      gifUrl: original.url,
      mp4Url: original.mp4 || images.fixed_width?.mp4 || null,
      width: Number.isFinite(width) && width > 0 ? width : 480,
      height: Number.isFinite(height) && height > 0 ? height : 270,
      author: item.user?.display_name || item.username || '',
      page: item.url || '',
    }];
  });
}

export async function searchGiphy(query, {limit = 24} = {}) {
  const apiKey = await key();
  if (!apiKey) throw Error('Configura tu clave de Giphy en Memes → GIF reales.');
  if (typeof query !== 'string' || query.length > 120) throw Error('Búsqueda de Giphy inválida');
  const term = query.trim();
  const url = new URL(`https://api.giphy.com/v1/gifs/${term ? 'search' : 'trending'}`);
  url.search = new URLSearchParams({
    api_key: apiKey,
    limit: String(Math.max(1, Math.min(50, limit))),
    rating: 'pg-13',
    lang: 'es',
    ...(term ? {q: term} : {}),
  }).toString();

  let response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(20000), redirect: 'error'});
  } catch {
    throw Error('No se pudo conectar con Giphy. Comprueba tu conexión.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw Error('Giphy rechazó la clave configurada (401/403).');
    if (response.status === 429) throw Error('Giphy limita las peticiones: espera un minuto y reintenta.');
    throw Error(`Giphy respondió HTTP ${response.status}.`);
  }
  const payload = await response.json();
  return {provider: 'Giphy', providerUrl: 'https://giphy.com', items: normalize(payload)};
}
