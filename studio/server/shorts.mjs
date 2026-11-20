import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CACHE_ROOT,OUTPUT_ROOT,SUBTITLES_ROOT,load,save,probe,run} from './core.mjs';
import {nvenc} from './engine.mjs';
import {sourceAudioFilters,sourceVideoFilters} from './source-settings.mjs';
import {sampleFaces} from './face-safe.mjs';
import {remapWords,ass,srt} from './subtitles.mjs';
import {throwIfCancelled} from './render-cache.mjs';

const MIN_SECONDS = 15;
const MAX_SECONDS = 55;
const TARGET_SECONDS = 30;
const TARGET_COUNT = 4;
const SAMPLE_BUCKET = 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const say = (report, message) => { if (report) report(message); };

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim();
}

function sentenceText(words) {
  return cleanText(words.map(word => word.word).join(' '));
}

function sentenceWords(segment) {
  if (Array.isArray(segment.words) && segment.words.length) {
    return segment.words
      .map(word => ({
        start: Number(word.start),
        end: Number(word.end),
        word: String(word.word ?? '').trim(),
      }))
      .filter(word => word.word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start);
  }
  const text = cleanText(segment.text).split(/\s+/).filter(Boolean);
  const start = Number(segment.start) || 0;
  const end = Number(segment.end) || start;
  const step = (end - start) / Math.max(1, text.length);
  return text.map((word, index) => ({start: start + index * step, end: start + (index + 1) * step, word}));
}

function approximateSentences(segment) {
  const parts = cleanText(segment.text).match(/[^.!?…]+[.!?…]*/g) || [];
  if (!parts.length) return [];
  const totalChars = parts.reduce((sum, part) => sum + Math.max(1, part.length), 0);
  let cursor = Number(segment.start) || 0;
  const span = Math.max(0.4, (Number(segment.end) || cursor) - cursor);
  return parts.map(part => {
    const text = cleanText(part);
    const length = Math.max(1, text.length);
    const duration = span * length / totalChars;
    const sentence = {
      start: cursor,
      end: Math.min(Number(segment.end) || cursor + duration, cursor + duration),
      text,
      words: text.split(/\s+/).filter(Boolean).map((word, index, list) => {
        const step = duration / Math.max(1, list.length);
        return {start: cursor + index * step, end: cursor + (index + 1) * step, word};
      }),
    };
    cursor = sentence.end;
    return sentence;
  }).filter(sentence => sentence.text && sentence.end > sentence.start);
}

// Convert the transcript into sentence-sized units. A short must start and end
// at a real phrase boundary, never in the middle of a word or a sentence.
export function transcriptSentences(transcript = []) {
  const words = [];
  for (const segment of transcript) {
    const source = sentenceWords(segment);
    if (!source.length) {
      words.push(...approximateSentences(segment).flatMap(sentence => sentence.words));
      continue;
    }
    for (const word of source) words.push(word);
  }
  const sentences = [];
  let current = [];
  const flush = () => {
    const text = sentenceText(current);
    if (text && current.length) {
      sentences.push({
        start: current[0].start,
        end: current.at(-1).end,
        text,
        words: current,
      });
    }
    current = [];
  };
  for (const word of words) {
    if (current.length) {
      const previous = current.at(-1);
      if (word.start - previous.end > 1.5 && current.length >= 8) flush();
    }
    current.push(word);
    const endsSentence = /[.!?…]["'»”’)]?$/.test(word.word);
    // Whisper puntúa las frases; no cortamos por número de palabras porque
    // crearía hooks y momentos a mitad de una idea. El límite de 35 s solo
    // rescata transcripciones excepcionales sin ningún signo de puntuación.
    const longEnough = (current.at(-1).end - current[0].start) >= 35;
    if (endsSentence || longEnough) flush();
  }
  flush();
  return sentences.filter(sentence => sentence.end - sentence.start >= 0.4);
}

export function cleanHook(value) {
  let text = cleanText(value);
  for (let pass = 0; pass < 3; pass++) {
    const stripped = text.replace(/^(?:y\s+)?(?:es que|o sea|bueno|pues|entonces|mira|vale|hola|escucha|venga)\b[\s,;:]+/i, '').trim();
    if (stripped === text) break;
    text = stripped;
  }
  text = text.replace(/^["'«“”]+/, '').trim();
  if (!text) return '';
  if (text.length > 100) {
    const cut = text.slice(0, 100);
    const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf('; '));
    if (boundary > 28) text = cut.slice(0, boundary).trim();
    else {
      const space = cut.lastIndexOf(' ');
      text = `${cut.slice(0, space > 55 ? space : 98).trim()}…`;
    }
  }
  text = text.replace(/[,;:]$/, '').trim();
  if (!/[.!?…]$/.test(text)) text += '.';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weakHook(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (/\b(?:suscr[ií]b|me gusta|comparte|comentario|canal|s[ií]gueme|like)\b/i.test(text)) return true;
  if (/^(?:un|una|el|la|los|las|esto|eso)\b/i.test(text) && words.length < 6 && !/[¿?]/.test(text)) return true;
  return words.length < 4;
}

function hookFor(sentences, start, end, used = new Set()) {
  const inside = sentences.filter(sentence => sentence.start >= start - 0.01 && sentence.end <= end + 0.01);
  // Una pregunta breve o una frase con verbo engancha más que una muletilla
  // como «un ordenador muy bueno». No inventamos texto: elegimos otra frase
  // que ya existe dentro del mismo momento.
  for (const sentence of inside) {
    const hook = cleanHook(sentence.text);
    if (/[¿?]/.test(hook) && !weakHook(hook) && !used.has(hook.toLocaleLowerCase('es'))) {
      used.add(hook.toLocaleLowerCase('es'));
      return hook;
    }
  }
  for (const sentence of inside) {
    const hook = cleanHook(sentence.text);
    if (hook && !weakHook(hook) && !used.has(hook.toLocaleLowerCase('es'))) {
      used.add(hook.toLocaleLowerCase('es'));
      return hook;
    }
  }
  for (const sentence of inside) {
    const hook = cleanHook(sentence.text);
    if (hook) return hook;
  }
  return cleanHook(inside[0]?.text || '');
}

function candidateScore({start, end, text, wordCount}) {
  const duration = end - start;
  let score = 0;
  score -= Math.abs(duration - TARGET_SECONDS) / TARGET_SECONDS * 0.38;
  score += Math.min(0.34, (wordCount / Math.max(1, duration)) * 0.16);
  if (/[¿?]/.test(text)) score += 0.16;
  if (/[!]/.test(text)) score += 0.05;
  if (/\b(?:porque|clave|secreto|error|truco|nunca|siempre|cómo|qué|cuándo|dónde|por qué|resulta|importante)\b/i.test(text)) score += 0.11;
  if (/[.!?…]$/.test(text)) score += 0.07;
  if (start > 2) score += 0.05;
  const opening = cleanText(text).split(/[.!?…]/)[0] || '';
  if (weakHook(cleanHook(opening))) score -= 0.25;
  if (/\b(?:suscr[ií]b|me gusta|comparte|comentario|canal|s[ií]gueme|like)\b/i.test(opening)) score -= 0.35;
  return score;
}

// Every candidate starts and ends on a whole sentence; the window is the only
// thing the caller can change. Shared by the autonomous renders and by the
// Creador panel, so both rank a moment with exactly the same rules.
function collectCandidates(sentences, {minimum, maximum}) {
  const candidates = [];
  const seen = new Set();
  for (let first = 0; first < sentences.length; first++) {
    let wordCount = 0;
    for (let last = first; last < sentences.length; last++) {
      const start = sentences[first].start;
      const end = sentences[last].end;
      const span = end - start;
      if (span > maximum) break;
      wordCount += sentences[last].words.length;
      if (span < minimum) continue;
      const text = cleanText(sentences.slice(first, last + 1).map(sentence => sentence.text).join(' '));
      const key = text.toLocaleLowerCase('es');
      if (!text || seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        start,
        end,
        duration: span,
        text,
        wordCount,
        firstSentence: first,
        lastSentence: last,
        score: candidateScore({start, end, text, wordCount}),
      });
    }
  }
  return candidates;
}

function candidateReasons(candidate) {
  const reasons = [];
  const duration = candidate.end - candidate.start;
  if (/[¿?]/.test(candidate.text)) reasons.push('Abre o cierra con una pregunta');
  if (/[!]/.test(candidate.text)) reasons.push('Tiene una afirmación con fuerza');
  if (candidate.wordCount / Math.max(1, duration) >= 2.4) reasons.push('Ritmo alto, sin pausas largas');
  if (/\b(?:porque|clave|secreto|error|truco|nunca|siempre|cómo|qué|cuándo|dónde|por qué|importante|resulta)\b/i.test(candidate.text)) reasons.push('Contiene la idea clave');
  if (candidate.start > 2) reasons.push('Entra directo, sin arranque lento');
  if (!reasons.length) reasons.push('Frase completa que se entiende sola');
  return reasons.slice(0, 3);
}

// What the Creador panel needs: the best non-overlapping moments inside the
// duration the user asked for, with a readable hook and the reasons it won.
// It never trims mid-sentence and never invents text.
export function planShortCandidates(transcript, {sourceDuration = 0, min = MIN_SECONDS, max = MAX_SECONDS, count = 6} = {}) {
  const sentences = transcriptSentences(transcript);
  const duration = Math.max(Number(sourceDuration) || 0, sentences.at(-1)?.end || 0);
  if (!sentences.length) return {items: [], sentences: 0, sourceDuration: duration, range: {min, max}, fallback: false};
  let minimum = clamp(Number(min) || MIN_SECONDS, 5, 120);
  let maximum = clamp(Number(max) || MAX_SECONDS, minimum + 1, 180);
  let candidates = collectCandidates(sentences, {minimum, maximum});
  let fallback = false;
  if (!candidates.length) {
    // The recording has no phrase inside that window: try a slightly wider
    // one, then the default range and finally any complete phrase, instead of
    // returning an empty list the user cannot act on.
    fallback = true;
    const attempts = [
      [Math.max(5, minimum - 5), Math.min(180, Math.max(maximum, minimum + 30))],
      [MIN_SECONDS, MAX_SECONDS],
      [5, 180],
    ];
    for (const [low, high] of attempts) {
      const windowMin = Math.max(5, Math.min(low, high - 1));
      const windowMax = Math.max(windowMin + 1, Math.min(180, high));
      candidates = collectCandidates(sentences, {minimum: windowMin, maximum: windowMax});
      if (candidates.length) { minimum = windowMin; maximum = windowMax; break; }
    }
  }
  const wanted = clamp(Math.round(Number(count) || 6), 1, 12);
  candidates.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const candidate of candidates) {
    if (picked.length >= wanted) break;
    if (picked.some(moment => candidate.start < moment.end - 0.05 && candidate.end > moment.start + 0.05)) continue;
    picked.push(candidate);
  }
  picked.sort((a, b) => a.start - b.start);
  const usedHooks = new Set();
  const items = picked.map(candidate => ({
    start: Number(candidate.start.toFixed(3)),
    end: Number(candidate.end.toFixed(3)),
    duration: Number(candidate.duration.toFixed(3)),
    title: hookFor(sentences, candidate.start, candidate.end, usedHooks),
    text: candidate.text,
    score: Number(clamp((candidate.score + 0.5) / 1.0, 0, 1).toFixed(3)),
    reasons: candidateReasons(candidate),
  }));
  return {items, sentences: sentences.length, sourceDuration: duration, range: {min: minimum, max: maximum}, fallback};
}

export function planShortMoments(transcript, {sourceDuration = 0, count = TARGET_COUNT} = {}) {
  const sentences = transcriptSentences(transcript);
  if (!sentences.length) throw new Error('No hay una transcripción con frases para seleccionar los shorts');
  const duration = Math.max(sourceDuration, sentences.at(-1).end);
  const wanted = clamp(Math.round(count), 3, 5);

  const collect = (minimum, maximum) => collectCandidates(sentences, {minimum, maximum});

  let candidates = collect(MIN_SECONDS, MAX_SECONDS);
  if (candidates.length < wanted) candidates = collect(10, 70);
  if (!candidates.length) throw new Error('No hay momentos de al menos 10 segundos para crear shorts');

  const picked = [];
  while (picked.length < wanted && candidates.length) {
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      if (picked.some(moment => candidate.start < moment.end + 1 && candidate.end > moment.start + 1)) continue;
      const nearest = picked.length
        ? Math.min(...picked.map(moment => Math.abs(candidate.start - moment.start)))
        : duration;
      const spread = picked.length ? Math.min(0.3, nearest / Math.max(1, duration) * 0.5) : 0;
      const score = candidate.score + spread;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    picked.push(best);
  }
  picked.sort((a, b) => a.start - b.start);

  const usedHooks = new Set();
  const items = picked.map((candidate, index) => {
    const id = createHash('sha1').update(`${candidate.start.toFixed(3)}:${candidate.end.toFixed(3)}:${candidate.text}`).digest('hex').slice(0, 10);
    const hook = hookFor(sentences, candidate.start, candidate.end, usedHooks);
    return {
      id,
      index: index + 1,
      start: Number(candidate.start.toFixed(3)),
      end: Number(candidate.end.toFixed(3)),
      duration: Number(candidate.duration.toFixed(3)),
      hook: hook || cleanHook(candidate.text).slice(0, 100),
      sentence: candidate.text,
      score: Number(candidate.score.toFixed(3)),
      status: 'planned',
      reframe: null,
    };
  });
  return {items, sentences: sentences.length, sourceDuration: duration};
}

export function screenCenterFromGrid(grid, fraction = 9 / 16) {
  const rows = Array.isArray(grid) ? grid.length : 0;
  const cols = rows && Array.isArray(grid[0]) ? grid[0].length : 0;
  if (!cols) return {x: 0.5, score: 0};
  const windowSize = Math.max(1, Math.min(cols, Math.round(fraction * cols)));
  const sums = [];
  for (let start = 0; start <= cols - windowSize; start++) {
    let sum = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = start; col < start + windowSize; col++) sum += Number(grid[row]?.[col]) || 0;
    }
    sums.push({start, sum});
  }
  sums.sort((a, b) => b.sum - a.sum);
  const best = sums[0] || {start: 0, sum: 0};
  return {x: (best.start + windowSize / 2) / cols, score: best.sum / Math.max(1, rows * windowSize)};
}

function isMainFace(face) {
  if (!face || !Number.isFinite(face.x) || !Number.isFinite(face.y) || !Number.isFinite(face.w) || !Number.isFinite(face.h)) return false;
  const area = face.w * face.h;
  if (area < 0.007) return false;
  const centerX = face.x + face.w / 2;
  const centerY = face.y + face.h / 2;
  // Las webcams de reacción viven en la esquina inferior. Seguir esa cara
  // convertiría el short en un primer plano de la reacción, no del contenido.
  if (centerY > 0.62 && (centerX < 0.32 || centerX > 0.68)) return false;
  return true;
}

function bucketFacePath(sample, short, width) {
  const source = Array.isArray(sample?.samples) ? sample.samples : [];
  const valid = source
    .filter(entry => entry && isMainFace(entry.face))
    .map(entry => ({
      t: clamp(Number(entry.t) - short.start, 0, short.duration),
      x: clamp(entry.face.x + entry.face.w / 2, 0, 1),
      y: clamp(entry.face.y + entry.face.h / 2, 0, 1),
    }))
    .filter(entry => Number.isFinite(entry.t) && Number.isFinite(entry.x));
  const required = Math.max(3, Math.ceil(source.length * 0.2));
  if (valid.length < required) return null;
  const buckets = new Map();
  for (const entry of valid) {
    const bucket = Math.floor(entry.t / SAMPLE_BUCKET);
    const current = buckets.get(bucket) || {x: 0, y: 0, count: 0};
    current.x += entry.x;
    current.y += entry.y;
    current.count++;
    buckets.set(bucket, current);
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, value]) => ({
      t: clamp(bucket * SAMPLE_BUCKET + SAMPLE_BUCKET / 2, 0, short.duration),
      x: clamp(value.x / value.count * width, 0, width),
      y: clamp(value.y / value.count, 0, 1),
    }));
  if (!points.length) return null;
  points[0].t = 0;
  points[points.length - 1].t = short.duration;
  const smoothed = points.map((point, index) => {
    const around = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
    return {
      ...point,
      x: around.reduce((sum, entry) => sum + entry.x, 0) / around.length,
      y: around.reduce((sum, entry) => sum + entry.y, 0) / around.length,
    };
  });
  return smoothed;
}

function staticFacePath(sample, short, width) {
  const faces = Array.isArray(sample?.faces) ? sample.faces.filter(isMainFace) : [];
  if (!faces.length) return null;
  const x = faces.reduce((sum, face) => sum + face.x + face.w / 2, 0) / faces.length;
  return [{t: 0, x: x * width, y: 0.5}, {t: short.duration, x: x * width, y: 0.5}];
}

function linearExpression(points, maximum, key) {
  const values = points.map(point => Number(point[key])).filter(Number.isFinite);
  if (!values.length) return '0';
  if (Math.max(...values) - Math.min(...values) < 1.5) return String(Math.round(values[0]));
  let expression = String(Math.round(points.at(-1)[key]));
  for (let index = points.length - 1; index > 0; index--) {
    const before = points[index - 1];
    const after = points[index];
    const span = Math.max(0.001, after.t - before.t);
    const start = Math.round(before[key]);
    const end = Math.round(after[key]);
    const piece = start === end
      ? String(start)
      : `(${start}+(${end - start})*max(0,min(1,(t-${before.t.toFixed(2)})/${span.toFixed(2)})))`;
    expression = `if(lt(t,${after.t.toFixed(2)}),${piece},${expression})`;
  }
  return `min(max(${expression},0),${Math.round(Math.max(0, maximum))})`;
}

export function buildReframe({width, height, short, sample}) {
  if (!width || !height) throw new Error('No se conocen las dimensiones de la grabación');
  const ratio = 9 / 16;
  const sourceRatio = width / height;
  const cropW = sourceRatio > ratio ? Math.max(2, Math.round(height * ratio / 2) * 2) : width;
  const cropH = sourceRatio < ratio ? Math.max(2, Math.round(width / ratio / 2) * 2) : height;
  const screen = screenCenterFromGrid(sample?.grid, cropW / width);
  const facePath = bucketFacePath(sample, short, width) || staticFacePath(sample, short, width);
  const maxX = Math.max(0, width - cropW);
  const maxY = Math.max(0, height - cropH);
  const points = facePath || [
    {t: 0, x: screen.x * width, y: 0.5},
    {t: short.duration, x: screen.x * width, y: 0.5},
  ];
  const framePoints = points.map(point => ({
    t: clamp(point.t, 0, short.duration),
    x: clamp(point.x - cropW / 2, 0, maxX),
    y: clamp(point.y * height - cropH / 2, 0, maxY),
    focusX: clamp(point.x, 0, width),
    focusY: clamp(point.y, 0, 1),
  })).sort((a, b) => a.t - b.t);
  if (!framePoints.length) framePoints.push({t: 0, x: maxX / 2, y: maxY / 2, focusX: width / 2, focusY: 0.5});
  framePoints[0].t = 0;
  framePoints[framePoints.length - 1].t = short.duration;
  const xExpression = linearExpression(framePoints, maxX, 'x').replace(/"/g, '');
  const yExpression = linearExpression(framePoints, maxY, 'y').replace(/"/g, '');
  const cropFilter = `crop=w=${cropW}:h=${cropH}:x='${xExpression}':y='${yExpression}'`;
  return {
    mode: facePath ? 'face' : 'screen',
    cropW,
    cropH,
    xExpression,
    yExpression,
    cropFilter,
    keyframes: framePoints.map(point => ({
      t: Number(point.t.toFixed(2)),
      x: Math.round(point.x),
      y: Math.round(point.y),
    })),
  };
}

async function resolveShortSource(project) {
  let owner = project;
  const sourceId = project.clips?.find(clip => clip.enabled && clip.sourceId)?.sourceId;
  if ((!project.transcript?.length || !project.source) && sourceId) {
    const candidate = await load(sourceId);
    if (candidate.transcript?.length || !project.transcript?.length) owner = candidate;
  }
  if (!owner.source) owner = project;
  if (!owner.source) throw new Error('La grabación original ya no está disponible');
  if (!owner.transcript?.length) throw new Error('Este proyecto no tiene transcripción; analiza la grabación antes de crear shorts');
  return owner;
}

function encoderArgs(hardware) {
  return hardware
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-threads', '8'];
}

async function renderOne(project, owner, short, report, {signal} = {}) {
  throwIfCancelled(signal);
  const sayShort = message => say(report, message);
  const duration = Math.max(0.1, short.duration);
  const dir = path.join(CACHE_ROOT, `short-${project.id}-${short.id}`);
  await fs.mkdir(dir, {recursive: true});
  const assPath = path.join(dir, 'captions.ass');
  const srtPath = path.join(dir, 'captions.srt');
  const settings = {
    ...project.settings,
    profile: 'shorts',
    fit: 'cover',
    cropX: 0.5,
    cropY: 0.5,
    subtitles: true,
    subtitle: project.settings.subtitle || 'Viral',
    subtitlePosition: 'bottom',
    title: short.hook,
    musicId: null,
    musicVolume: 0,
    soundEffects: false,
    transition: 0,
    zoom: 1,
  };
  const words = remapWords(owner.transcript, [{id: 'short', start: short.start, end: short.end, enabled: true}]);
  if (!words.length) throw new Error(`El short ${short.index} no contiene palabras para subtitular`);
  await fs.writeFile(assPath, ass(words, settings, 1080, 1920, duration), 'utf8');
  await fs.writeFile(srtPath, srt(words), 'utf8');

  sayShort(`Detectando caras y contenido del short ${short.index}/${project.shorts.count}`);
  let sample = {samples: [], faces: [], grid: null};
  try {
    const ranges = await sampleFaces(owner.source, [{start: short.start, end: short.end}], report, {signal});
    sample = ranges[0] || sample;
    if (!Array.isArray(sample.samples)) sample.samples = [];
  } catch (error) {
    if (signal?.aborted) throw error;
    sayShort(`No se pudo seguir la cara del short ${short.index}; se usa el centro de la pantalla: ${error.message}`);
  }
  throwIfCancelled(signal);
  const reframe = buildReframe({
    width: Number(owner.media.width),
    height: Number(owner.media.height),
    short: {...short, duration},
    sample,
  });
  sayShort(`Reencuadre ${reframe.mode === 'face' ? 'siguiendo la cara' : 'siguiendo la pantalla'} · ${reframe.cropW}x${reframe.cropH} → 1080x1920`);

  const filters = [
    reframe.cropFilter,
    'scale=1080:1920:flags=lanczos',
    'setsar=1',
    `eq=brightness=${settings.exposure}:contrast=${settings.contrast}:saturation=${settings.saturation}`,
    ...sourceVideoFilters(settings),
    'fps=30',
    'format=yuv420p',
    'ass=filename=captions.ass',
  ].filter(Boolean);
  const audioFilters = ['aresample=48000', 'asetpts=PTS-STARTPTS', ...sourceAudioFilters(settings)];
  const input = ['-hide_banner', '-nostdin', '-y', '-ss', String(short.start), '-i', owner.source];
  if (!owner.media.audio) input.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const baseArgs = [
    ...input,
    '-t', String(duration),
    '-map', '0:v:0',
    '-map', owner.media.audio ? '0:a:0' : '1:a:0',
    '-vf', filters.join(','),
    '-af', audioFilters.join(','),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-ar', '48000',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ];
  let hardware = settings.encoder !== 'cpu' && await nvenc();
  if (settings.encoder === 'nvenc' && !hardware) throw new Error('NVENC no supera la prueba real en este equipo');
  const outputDir = path.join(OUTPUT_ROOT, 'shorts', project.id);
  await fs.mkdir(outputDir, {recursive: true});
  const output = path.join(outputDir, `short-${String(short.index).padStart(2, '0')}-${short.id}.mp4`);
  sayShort(`Renderizando short ${short.index}/${project.shorts.count} · ${short.start.toFixed(1)}s → ${short.end.toFixed(1)}s`);
  const encode = async (useHardware) => {
    await run('ffmpeg', [...baseArgs, ...encoderArgs(useHardware), output], {cwd: dir, log: report, signal});
  };
  try {
    await encode(hardware);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (hardware && settings.encoder === 'auto') {
      hardware = false;
      sayShort(`NVENC falló en el short ${short.index}; reintentando con CPU`);
      await encode(false);
    } else throw error;
  }
  const media = await probe(output);
  if (Math.round(media.width) !== 1080 || Math.round(media.height) !== 1920) {
    throw new Error(`El short ${short.index} no se exportó en 1080x1920`);
  }
  if (Math.abs(media.duration - duration) > 0.35) throw new Error(`La duración del short ${short.index} no coincide con el momento elegido`);
  const captionsDir = path.join(SUBTITLES_ROOT, 'shorts', project.id);
  await fs.mkdir(captionsDir, {recursive: true});
  const captionBase = `short-${String(short.index).padStart(2, '0')}-${short.id}`;
  const finalSrt = path.join(captionsDir, `${captionBase}.srt`);
  const finalAss = path.join(captionsDir, `${captionBase}.ass`);
  await fs.copyFile(srtPath, finalSrt);
  await fs.copyFile(assPath, finalAss);
  sayShort(`Short ${short.index} listo · ${short.hook}`);
  return {
    ...short,
    status: 'ready',
    file: output,
    srt: finalSrt,
    ass: finalAss,
    width: 1080,
    height: 1920,
    duration: media.duration,
    encoder: hardware ? 'NVENC' : 'CPU',
    reframe: {
      mode: reframe.mode,
      cropW: reframe.cropW,
      cropH: reframe.cropH,
      keyframes: reframe.keyframes.length,
    },
    renderedAt: new Date().toISOString(),
  };
}

export async function renderShorts(id, report, {signal} = {}) {
  let project = await load(id);
  try {
    const owner = await resolveShortSource(project);
    const plan = planShortMoments(owner.transcript, {
      sourceDuration: Number(owner.media.duration) || 0,
      count: TARGET_COUNT,
    });
    project.shorts = {
      status: 'rendering',
      sourceId: owner.id,
      sourceName: owner.name,
      generatedAt: new Date().toISOString(),
      count: plan.items.length,
      items: plan.items,
      sentences: plan.sentences,
    };
    await save(project);
    say(report, `Shorts: ${plan.items.length} momentos autónomos seleccionados`);
    for (let index = 0; index < project.shorts.items.length; index++) {
      throwIfCancelled(signal);
      project = await load(id);
      const item = project.shorts.items[index];
      item.status = 'rendering';
      item.error = '';
      await save(project);
      const rendered = await renderOne(project, owner, item, report, {signal});
      project = await load(id);
      project.shorts.items[index] = rendered;
      await save(project);
    }
    project = await load(id);
    project.shorts.status = 'ready';
    project.shorts.error = '';
    project.shorts.renderedAt = new Date().toISOString();
    await save(project);
    say(report, `${project.shorts.count} shorts verticales listos con su propio hook`);
    return project;
  } catch (error) {
    const latest = await load(id).catch(() => project);
    if (!latest.shorts) latest.shorts = {status: 'failed', count: 0, items: []};
    latest.shorts.status = signal?.aborted ? 'cancelled' : 'failed';
    latest.shorts.error = error.message;
    latest.shorts.finishedAt = new Date().toISOString();
    await save(latest).catch(() => {});
    throw error;
  }
}
