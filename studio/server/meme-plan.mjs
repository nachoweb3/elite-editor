import {catalogue} from './director.mjs';
import {fetchInternetMeme} from './meme-source.mjs';

const RULES = [
  {re: /(advertencia|cuidado|modificar|parte del trato|puede modificar)/i, meme: 'ESTO NO ERA PARTE', query: 'this is fine meme', sound: 'pop', reason: 'Aviso con humor sobre lo que puede tocar el agente.'},
  {re: /(ocult|secreto|poder|santo grial|no solamente)/i, meme: 'poder absoluto', query: 'mind blown meme', sound: 'Illuminati Confirmed', reason: 'Describe funciones ocultas o poder extra.'},
  {re: /(no me interesa|pagar|cr[eé]ditos|nube|cloud|suscrip)/i, meme: '', query: 'nope meme', sound: 'Nope sound effect', reason: 'Rechazo claro al plan de pago o a la nube.'},
  {re: /(problema|error|no funciona|lento|complic|se atasca)/i, meme: 'Algo anda mal', query: 'this is fine meme', sound: 'Awkward Pause', reason: 'Fricción real: algo va lento o falla.'},
  {re: /(descarg|instal|f[aá]cil|listo|en un clic)/i, meme: 'Acaso no lo viste venir', query: 'mind blown meme', sound: 'Reveal Sound Effect', reason: 'El proceso se resuelve de forma sorprendentemente simple.'},
  {re: /(ram|procesador|m[aá]quina|gordo|brutal|incre[ií]ble|potente)/i, meme: 'viene lo shido', query: 'bruh meme', sound: 'OMG meme', reason: 'Presume de hardware o de un modelo grande.'},
  {re: /(hostinger|patrocina|barato|servidor|alquilar)/i, meme: '', query: 'bruh meme', sound: 'Bruh Sound Effect', reason: 'Momento de guiño comercial o de coste.'},
  {re: /(agenda|construye|crea|programa|recordatorios)/i, meme: 'a caray eso si me intereza', query: 'typing meme', sound: 'punch', reason: 'Empieza una demostración práctica.'},
];

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

function findAsset(list, needle) {
  if (!needle) return null;
  const term = normalize(needle);
  return list.find(asset => normalize(asset.name).includes(term) || normalize(asset.description).includes(term)) || null;
}

function outputAt(sourceTime, clips, sourceId) {
  let out = 0;
  for (const clip of clips) {
    if ((clip.sourceId || sourceId) === sourceId && sourceTime >= clip.start && sourceTime < clip.end) {
      return out + sourceTime - clip.start;
    }
    out += clip.end - clip.start;
  }
  return null;
}

export async function planMemes({transcript, clips, sourceId, duration}) {
  const assets = await catalogue();
  const memes = assets.filter(asset => asset.kind === 'meme');
  const sounds = assets.filter(asset => asset.kind === 'sound');
  const media = [];
  const decisions = [];
  const used = new Set();
  let onlineFetch = 0;

  for (const segment of transcript || []) {
    if (media.filter(item => item.kind === 'meme').length >= 6) break;
    const text = String(segment.text || '');
    const rule = RULES.find(candidate => candidate.re.test(text));
    if (!rule) continue;
    const time = Number(segment.start);
    if (!Number.isFinite(time) || time < 1 || time > duration - 2) continue;

    let outputTime = outputAt(time, clips, sourceId);
    if (outputTime === null && segment.words?.length) {
      const word = segment.words.find(w => outputAt(w.start, clips, sourceId) !== null);
      if (word) outputTime = outputAt(word.start, clips, sourceId);
    }
    if (outputTime === null) continue;

    let meme = findAsset(memes, rule.meme);
    if (!meme && onlineFetch < 1 && rule.query) {
      try {
        meme = await fetchInternetMeme(rule.query);
        memes.push(meme);
        onlineFetch++;
        decisions.push({label: 'Meme online', detail: `${meme.description} · ${meme.provider}${meme.license ? ' · ' + meme.license : ''}${meme.author ? ' · ' + meme.author : ''}`});
      } catch { meme = null; }
    }
    if (meme && !used.has(meme.file)) {
      const visual = media.filter(item => item.kind === 'meme');
      if (!visual.some(item => Math.abs(item.outputTime - outputTime) < 45)) {
        media.push({
          kind: 'meme', name: meme.name, description: meme.description, file: meme.file,
          sourceId, at: time, outputTime, duration: 3.2,
          greenScreen: meme.greenScreen, useAudio: false, reason: rule.reason,
          provider: meme.provider, source: meme.source, author: meme.author, page: meme.page,
          license: meme.license, licenseUrl: meme.licenseUrl, attribution: meme.attribution,
        });
        used.add(meme.file);
        decisions.push({label: 'Meme', detail: `${meme.name} en ${outputTime.toFixed(0)} s · ${rule.reason}`});
      }
    }

    const sound = findAsset(sounds, rule.sound);
    if (sound && !used.has(sound.file)) {
      const audio = media.filter(item => item.kind === 'sound');
      if (!audio.some(item => Math.abs(item.outputTime - outputTime) < 25)) {
        media.push({
          kind: 'sound', name: sound.name, description: sound.description, file: sound.file,
          sourceId, at: time, outputTime, duration: 2,
          greenScreen: null, useAudio: true, reason: rule.reason,
        });
        used.add(sound.file);
        decisions.push({label: 'Efecto', detail: `${sound.name} en ${outputTime.toFixed(0)} s`});
      }
    }
  }

  const credits = [...new Set(media.map(item => item.attribution).filter(Boolean))];
  return {media, decisions, credits};
}
