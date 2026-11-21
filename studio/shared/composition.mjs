// One source of truth for the live monitor and the rendered file.
// Both Remotion and the FFmpeg pipeline build their work from this plan:
// clips, transitions, captions, overlay geometry/chroma and audio events.
import {outputFrameRate, sourceCanvas} from './source-format.mjs';
import {CLIP_TRANSITIONS,isClipTransition} from './transitions.mjs';

export const COMPOSITION_VERSION = 1;
export const COMPOSITION_FPS = 30;

const PROFILE_SIZES = {
  reels: [1080, 1920],
  reels4k: [2160, 3840],
  tiktok: [1080, 1920],
  shorts: [1080, 1920],
  youtube: [1920, 1080],
  youtube4k: [3840, 2160],
};

const OVERLAY_KINDS = new Set(['meme', 'pexels']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function outputDuration(project) {
  if (!project || !Array.isArray(project.clips)) return 0;
  return project.clips
    .filter(clip => clip.enabled !== false)
    .reduce((total, clip) => total + Math.max(0, number(clip.end) - number(clip.start)), 0);
}

export function normalizeChromaColor(value) {
  if (typeof value !== 'string') return '0x00FF00';
  const raw = value.trim().toLowerCase();
  const named = {green: '0x00FF00', blue: '0x0000FF', black: '0x000000', white: '0xFFFFFF'};
  if (named[raw]) return named[raw];
  const hex = raw.replace(/^#/, '').replace(/^0x/, '');
  return /^[0-9a-f]{6}$/.test(hex) ? `0x${hex.toUpperCase()}` : '0x00FF00';
}

// `enabled: null` means "not known yet": the preview leaves the media untouched
// and the server may detect a green background before rendering.
export function chromaFor(item = {}) {
  const custom = item.chroma && typeof item.chroma === 'object' ? item.chroma : {};
  const enabled = typeof custom.enabled === 'boolean'
    ? custom.enabled
    : item.greenScreen === true
      ? true
      : item.greenScreen === false
        ? false
        : null;
  return {
    enabled,
    color: normalizeChromaColor(custom.color ?? item.chromaColor),
    similarity: clamp(custom.similarity ?? item.chromaSimilarity ?? 0.22, 0.01, 1),
    blend: clamp(custom.blend ?? item.chromaBlend ?? 0.08, 0.01, 1),
  };
}

// The transition plan is deliberately metadata-only. Remotion animates it with
// CSS and FFmpeg translates it into filters, but both read the same type and
// duration from here.
export function transitionFor(clip, index, count, settings = {}, fps = COMPOSITION_FPS) {
  const length = Math.max(1 / fps, number(clip?.end) - number(clip?.start));
  if(length<=1/fps)return {in:null,out:null};
  const globalDuration = clamp(settings.transition, 0, 3);
  const fade = globalDuration ? Math.min(globalDuration, length / 3) : 0;
  const requested = clip?.transitionIn;
  let enter = null;
  if (isClipTransition(requested)) {
    enter = {
      type: requested,
      duration: Math.min(CLIP_TRANSITIONS[requested].duration, length / 2),
    };
  } else if (index > 0 && fade > 0) {
    enter = {type: 'fadeblack', duration: fade};
  }
  const leave = fade > 0 && index < count - 1
    ? {type: 'fadeblack', duration: fade}
    : null;
  return {in: enter, out: leave};
}

function defaultSourceUrl(project, sourceId) {
  if (sourceId && sourceId !== project.id) return `/api/projects/${sourceId}/proxy`;
  return `/api/projects/${project.id}/media`;
}

function defaultAssetUrl(assetId) {
  return `/api/asset?id=${encodeURIComponent(assetId)}`;
}

function transcriptMap(project, options = {}) {
  const map = new Map();
  map.set(project.id, Array.isArray(project.transcript) ? project.transcript : []);
  if (Array.isArray(options.sources)) {
    for (const source of options.sources) {
      if (source?.id) map.set(source.id, Array.isArray(source.transcript) ? source.transcript : []);
    }
  } else if (options.transcripts && typeof options.transcripts === 'object') {
    for (const [id, transcript] of Object.entries(options.transcripts)) {
      map.set(id, Array.isArray(transcript) ? transcript : []);
    }
  }
  return map;
}

export function buildComposition(project, options = {}) {
  if (!project) throw new Error('No hay proyecto para componer');
  const settings = project.settings || {};
  const sourceUrl = typeof options.sourceUrl === 'function'
    ? (sourceId) => options.sourceUrl(sourceId, project)
    : (sourceId) => defaultSourceUrl(project, sourceId);
  const assetUrl = typeof options.assetUrl === 'function'
    ? (assetId) => options.assetUrl(assetId, project)
    : defaultAssetUrl;
  const clips = Array.isArray(project.clips) ? project.clips.filter(clip => clip.enabled !== false) : [];
  const sources = new Map((options.sources || []).map(source => [source.id, source.media]));
  sources.set(project.id,project.media);
  const sourceMedia = [...new Set(clips.map(clip=>clip.sourceId||project.id))].map(id=>sources.get(id)).filter(Boolean);
  if (!sourceMedia.length && project.media) sourceMedia.push(project.media);
  const fps = outputFrameRate(settings,sourceMedia);
  const transcripts = transcriptMap(project, options);
  const timeline = [];
  const words = [];
  let fromFrames = 0;
  let fromSeconds = 0;

  clips.forEach((clip, index) => {
    const start = Math.max(0, number(clip.start));
    const end = Math.max(start + 1 / fps, number(clip.end));
    const duration = end - start;
    const frames = Math.max(1, Math.round((fromSeconds + duration) * fps) - fromFrames);
    const sourceId = clip.sourceId || project.id;
    const ownerTranscript = transcripts.get(sourceId) || [];
    const transition = transitionFor(clip, index, clips.length, settings, fps);
    const item = {
      index,
      id: clip.id || `clip-${index}`,
      sourceId,
      sourceName: clip.sourceName || (sourceId === project.id ? project.name : ''),
      start,
      end,
      from: fromSeconds,
      fromFrames,
      duration,
      frames,
      src: sourceUrl(sourceId),
      transition,
      motion: clip.motion || 'none',
      video: {
        fit: settings.fit === 'cover' ? 'cover' : 'contain',
        cropX: clamp(settings.cropX ?? 0.5, 0, 1),
        cropY: clamp(settings.cropY ?? 0.5, 0, 1),
        zoom: Math.max(1, number(settings.zoom, 1)),
        exposure: number(settings.exposure),
        contrast: number(settings.contrast, 1),
        saturation: number(settings.saturation, 1),
      },
    };
    for (const segment of ownerTranscript) {
      const segmentWords = Array.isArray(segment.words) && segment.words.length
        ? segment.words
        : [{word: segment.text, start: segment.start, end: segment.end}];
      for (const word of segmentWords) {
        const a = Math.max(word.start, clip.start);
        const b = Math.min(word.end, clip.end);
        if (!(b > a) || !String(word.word || '').trim()) continue;
        words.push({
          ...word,
          start: (a - clip.start) + fromSeconds,
          end: (b - clip.start) + fromSeconds,
        });
      }
    }
    timeline.push(item);
    fromFrames += frames;
    fromSeconds += duration;
  });

  const duration = timeline.reduce((total, clip) => total + clip.duration, 0);
  const media = Array.isArray(project.automatic?.direction?.media)
    ? project.automatic.direction.media
    : [];
  const visuals = [];
  const audio = [];

  media.forEach((item, index) => {
    if (!item || item.status === 'rejected' || (!item.file && !item.resourceId)) return;
    const at = Math.max(0, number(item.outputTime));
    if (at >= duration - 1 / fps) return;
    const requestedDuration = number(item.duration, item.kind === 'sound' ? 2 : 3.2);
    const itemDuration = Math.max(0.1, Math.min(Math.max(0.1, requestedDuration), duration - at));
    const kind = item.kind || '';
    const src = item.file ? `/api/projects/${project.id}/live?i=${index}` : assetUrl(item.resourceId);
    const image = /\.(png|jpe?g|webp|gif)$/i.test(item.file || item.name || '');
    const volume = item.volume === undefined || item.volume === null
      ? (kind === 'sound' ? 0.16 : 0.12)
      : clamp(item.volume, 0, 2);

    if (kind === 'sound') {
      audio.push({
        id: `media-audio-${index}`,
        type: 'media-sound',
        mediaIndex: index,
        kind,
        src,
        at,
        duration: itemDuration,
        volume,
        sourceIn: 0,
      });
      return;
    }
    if (!OVERLAY_KINDS.has(kind)) return;
    visuals.push({
      id: `media-visual-${index}`,
      index,
      kind,
      src,
      at,
      duration: itemDuration,
      placement: item.placement ? {...item.placement} : null,
      image,
      chroma: chromaFor(item),
      useAudio: item.useAudio === true,
      volume,
      name: item.name || '',
    });
    if (item.useAudio === true && !image) {
      audio.push({
        id: `media-audio-${index}`,
        type: 'media-overlay',
        mediaIndex: index,
        kind,
        src,
        at,
        duration: itemDuration,
        volume,
        sourceIn: 0,
      });
    }
  });

  if (settings.musicId && duration > 0) {
    audio.push({
      id: 'music',
      type: 'music',
      src: assetUrl(settings.musicId),
      assetId: settings.musicId,
      at: 0,
      duration,
      sourceIn: 0,
      volume: clamp(settings.musicVolume === undefined ? 0.12 : settings.musicVolume, 0, 2),
      loop: true,
      duck: true,
    });
  }

  if (settings.soundEffects === true && timeline.length > 1) {
    let at = 0;
    for (let index = 0; index < timeline.length - 1; index++) {
      at += timeline[index].duration;
      audio.push({
        id: `whoosh-${index}`,
        type: 'sound-effect',
        src: '/api/sound-effects/soft-whoosh.wav',
        at,
        duration: 0.35,
        sourceIn: 0,
        volume: 0.13,
      });
    }
  }

  for (const [index, track] of (Array.isArray(project.audioTracks) ? project.audioTracks : []).entries()) {
    if (track.muted === true || number(track.volume) <= 0) continue;
    const at = Math.max(0, number(track.at));
    if (at >= duration) continue;
    const trackDuration = Math.max(0.001, Math.min(number(track.duration, 1), duration - at));
    audio.push({
      id: `track-${track.id || index}`,
      type: 'track',
      trackId: track.id,
      assetId: track.assetId,
      name: track.name || track.kind || 'Audio',
      src: assetUrl(track.assetId),
      at,
      duration: trackDuration,
      sourceIn: Math.max(0, number(track.sourceIn)),
      volume: clamp(track.volume, 0, 2),
      fadeIn: Math.min(clamp(track.fadeIn, 0, 3), trackDuration / 2),
      fadeOut: Math.min(clamp(track.fadeOut, 0, 3), trackDuration / 2),
    });
  }

  const [width, height] = PROFILE_SIZES[settings.profile] || sourceCanvas(project.media,sourceMedia);
  return {
    version: COMPOSITION_VERSION,
    fps,
    width,
    height,
    profile: settings.profile || 'reels',
    duration,
    timeline,
    words,
    visuals,
    audio,
    captions: {
      enabled: settings.subtitles === true,
      template: settings.subtitle || 'Tutorial',
      position: settings.subtitlePosition || 'bottom',
      title: settings.title || '',
    },
  };
}
