import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,load,save,probe,run,projectDir} from './core.mjs';
import {frameFilter,motionFilter,profiles,resolveRenderEncoder,readAssets} from './engine.mjs';
import {buildComposition,COMPOSITION_FPS} from '../shared/composition.mjs';
import {sourceAudioFilters} from './source-settings.mjs';
import {mixTracks} from './audio-tracks.mjs';
import {retouchSource} from './retouch.mjs';
import {srt,ass} from './subtitles.mjs';
import {cacheFile,cachePath,compositeKey,copyAtomic,fingerPrint,linkOrCopy,partKey,throwIfCancelled} from './render-cache.mjs';

// Cached render pipeline. Each cut/effect combination is a content-addressed
// fragment; the final composition is cached separately and can be reused when
// only overlays or an already-cached fragment changed. Cancellation leaves the
// completed fragments on disk so a retry resumes instead of starting over.
export async function render(id, preview, report, {automatic = false, signal} = {}) {
  throwIfCancelled(signal);
  const project = await load(id);
  if (!project.reviewed && !automatic) throw new Error('Revisa y aprueba los cortes antes de renderizar');
  const settings = project.settings;
  const encoder = await resolveRenderEncoder(settings.encoder);
  if (!encoder) throw new Error('NVENC no supera la prueba real en este equipo');
  const sources = new Map();
  const sourceIds = [...new Set(project.clips.filter(c => c.enabled).map(c => c.sourceId || id))];
  for (const sourceId of sourceIds) {
    const owner = sourceId === id ? project : await load(sourceId);
    if (owner.ownerId && owner.ownerId !== project.ownerId) throw new Error('Fuente no disponible para este proyecto');
    sources.set(sourceId, {
      project: owner,
      file: await retouchSource({...owner, settings: project.settings}, report, {signal}),
    });
    throwIfCancelled(signal);
  }
  const clips = project.clips.filter(c => c.enabled);
  if (!clips.length) throw new Error('No hay fragmentos activados');
  const composition = buildComposition(project, {sources: [...sources.values()].map(source => source.project)});
  const [fullWidth, fullHeight, folder] = profiles[settings.profile];
  if (settings.profile === 'youtube4k' && Math.max(project.media.width, project.media.height) < 3840) {
    throw new Error('El material original no tiene resolución 4K');
  }
  const [width, height] = preview
    ? fullWidth > fullHeight ? [640, 360] : [360, 640]
    : [fullWidth, fullHeight];
  const duration = composition.duration;
  const tag = randomUUID();
  const dir = path.join(ROOT, 'cache', tag);
  await fs.mkdir(dir, {recursive: true});
  report(`[cmd] ffmpeg · ${preview ? 'vista previa' : 'calidad final'} · ${clips.length} cortes · ${width}x${height}`);

  const words = composition.words;
  const assPath = path.join(dir, 'captions.ass');
  await fs.writeFile(assPath, ass(words, settings, width, height, duration), 'utf8');
  await fs.writeFile(path.join(dir, 'captions.srt'), srt(words), 'utf8');

  let hardware = encoder === 'NVENC';
  const encoderArgs = () => hardware
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-threads', '8'];
  const files = [];
  const partKeys = [];

  for (let index = 0; index < clips.length; index++) {
    throwIfCancelled(signal);
    const clip = clips[index];
    const resolved = sources.get(clip.sourceId || id);
    const source = resolved.file;
    const hasAudio = resolved.project.media.audio;
    const length = clip.end - clip.start;
    const target = path.join(dir, `part-${index}.mp4`);
    report(`Renderizando ${preview ? 'vista previa' : 'calidad final'}: fragmento ${index + 1}/${clips.length}`);

    const transition = composition.timeline[index]?.transition;
    let filter = frameFilter(settings, width, height)
      + motionFilter(clip.motion, width, height, length)
      + `,fps=${COMPOSITION_FPS},format=yuv420p`;
    if (transition?.in) {
      const {type, duration: fadeIn} = transition.in;
      if (type === 'slide') {
        filter += `,pad=iw*2:ih:iw:0:color=black,crop=iw/2:ih:x='min(iw/2,iw/2*t/${fadeIn})':y=0`;
      } else {
        filter += `,fade=t=in:st=0:d=${fadeIn}:color=${type === 'fadewhite' ? 'white' : 'black'}`;
      }
    }
    if (transition?.out) {
      filter += `,fade=t=out:st=${length - transition.out.duration}:d=${transition.out.duration}:color=black`;
    }

    const sourcePrint = await fingerPrint(source) || source;
    let key = partKey({
      source: sourcePrint,
      clip,
      preview,
      width,
      height,
      filter,
      hasAudio,
      encoderVersion: hardware ? 'NVENC' : 'CPU',
    });
    let cached = await cacheFile('parts', key);
    if (cached) {
      report(`[cache] Fragmento ${index + 1}/${clips.length} reutilizado`);
      await linkOrCopy(cached.file, target);
    } else {
      const input = ['-hide_banner', '-nostdin', '-y', '-ss', String(clip.start), '-i', source];
      if (!hasAudio) input.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      const args = [
        ...input,
        '-t', String(length),
        '-map', '0:v:0',
        '-map', hasAudio ? '0:a:0' : '1:a:0',
        '-vf', filter,
        '-af', 'aresample=48000,asetpts=PTS-STARTPTS',
        ...encoderArgs(),
        '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
        target,
      ];
      try {
        await run('ffmpeg', args, {log: report, signal});
      } catch (error) {
        if (hardware && settings.encoder === 'auto' && !signal?.aborted) {
          hardware = false;
          report('NVENC falló durante el render. Reintentando con CPU.');
          key = partKey({
            source: sourcePrint,
            clip,
            preview,
            width,
            height,
            filter,
            hasAudio,
            encoderVersion: 'CPU',
          });
          const retry = [
            ...input,
            '-t', String(length),
            '-map', '0:v:0',
            '-map', hasAudio ? '0:a:0' : '1:a:0',
            '-vf', filter,
            '-af', 'aresample=48000,asetpts=PTS-STARTPTS',
            ...encoderArgs(),
            '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
            target,
          ];
          await run('ffmpeg', retry, {log: report, signal});
        } else {
          throw error;
        }
      }
      throwIfCancelled(signal);
      await copyAtomic(target, await cachePath('parts', key));
    }
    files.push(target);
    partKeys.push(key);
  }

  throwIfCancelled(signal);
  await fs.writeFile(path.join(dir, 'concat.txt'), files.map(file => `file '${path.basename(file)}'`).join('\n'));
  report('Componiendo subtítulos, marca y mezcla de audio');
  const outDir = path.join(ROOT, 'output', preview ? 'previews' : folder);
  const base = `${id}-${project.revision}-${tag.slice(0, 8)}`;
  const output = path.join(outDir, base + '.mp4');
  const assets = await readAssets();
  const plannedAudio = composition.audio || [];
  const musicPlan = plannedAudio.find(event => event.type === 'music') || null;
  const music = musicPlan ? assets.find(asset => asset.id === musicPlan.assetId && asset.kind === 'music') : null;
  if (musicPlan && !music) throw new Error('Música seleccionada no disponible');
  const tracks = await Promise.all((project.audioTracks || []).map(async track => {
    const asset = assets.find(candidate => candidate.id === track.assetId && ['sound', 'music'].includes(candidate.kind));
    return {...track, asset: asset ? await fingerPrint(asset.file) : null};
  }));
  const composite = compositeKey({
    parts: partKeys,
    words,
    settings,
    duration,
    width,
    height,
    music: music ? await fingerPrint(music.file) : null,
    tracks,
    preview,
    title: settings.title,
    soundEffects: settings.soundEffects,
    audioPlan: plannedAudio,
    assets: assets.filter(asset => asset.kind === 'sound' || asset.kind === 'music').map(asset => ({id: asset.id, file: asset.file})),
  });
  const cachedComposite = await cacheFile('composites', composite);
  let media;
  if (cachedComposite) {
    report('[cache] Composición final reutilizada; solo se copia el resultado');
    await copyAtomic(cachedComposite.file, output);
    media = await probe(output);
  } else {
    const args = ['-hide_banner', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt'];
    let graph = '[0:a]asetpts=PTS-STARTPTS,' + (sourceAudioFilters(settings).join(',') || 'anull') + '[voice];';
    let audio = 'voice';
    let inputIndex = 1;
    if (musicPlan && music) {
      args.push('-stream_loop', '-1', '-i', music.file);
      graph += `[voice]asplit=2[main][side];[${inputIndex++}:a]volume=${musicPlan.volume}${musicPlan.fadeIn ? `,afade=t=in:st=0:d=${musicPlan.fadeIn}` : ''}${musicPlan.fadeOut ? `,afade=t=out:st=${Math.max(0, musicPlan.duration - musicPlan.fadeOut)}:d=${musicPlan.fadeOut}` : ''}[bed];[bed][side]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=400[duck];[main][duck]amix=inputs=2:duration=first:normalize=0[mix];`;
      audio = 'mix';
    }
    const plannedTracks = plannedAudio
    .filter(event => event.type === 'track')
    .map(event => ({
      id: event.trackId || event.id,
      assetId: event.assetId,
      name: event.name,
      at: event.at,
      sourceIn: event.sourceIn,
      duration: event.duration,
      volume: event.volume,
      fadeIn: event.fadeIn || 0,
      fadeOut: event.fadeOut || 0,
      muted: false,
    }));
    const whooshes = plannedAudio.filter(event => event.type === 'sound-effect');
    if (whooshes.length) {
      args.push('-i', path.join(ROOT, 'sound_effects/soft-whoosh.wav'));
      const count = whooshes.length;
      graph += `[${inputIndex++}:a]volume=0.13,asplit=${count}${Array.from({length: count}, (_, i) => `[fx${i}]`).join('')};`;
      const delayed = [];
      whooshes.forEach((effect, i) => {
        graph += `[fx${i}]adelay=${Math.round(effect.at * 1000)}:all=1[d${i}];`;
        delayed.push(`[d${i}]`);
      });
      graph += `[${audio}]${delayed.join('')}amix=inputs=${count + 1}:duration=first:normalize=0[withfx];`;
      audio = 'withfx';
    }
    const manualMix = mixTracks(plannedTracks, assets, duration, args, inputIndex, audio);
    graph += manualMix.graph;
    audio = manualMix.audio;
    graph += `[${audio}]alimiter=limit=0.95:level=0:latency=1[aout];[0:v]setpts=PTS-STARTPTS,ass=filename=captions.ass[vout]`;
    await fs.writeFile(path.join(dir, 'final.ffgraph'), graph);
    const rendered = path.join(dir, 'final.mp4');
    args.push('-/filter_complex', 'final.ffgraph', '-map', '[vout]', '-map', '[aout]', '-t', String(duration), ...encoderArgs(), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', rendered);
    await run('ffmpeg', args, {cwd: dir, log: report, signal});
    throwIfCancelled(signal);
    media = await probe(rendered);
    if (Math.abs(media.duration - duration) > 0.25) throw new Error('La duración renderizada no coincide con la línea de tiempo');
    await copyAtomic(rendered, await cachePath('composites', composite));
    await copyAtomic(rendered, output);
  }
  if (Math.abs(media.duration - duration) > 0.25) throw new Error('La duración renderizada no coincide con la línea de tiempo');
  const captions = path.join(ROOT, 'subtitles', base);
  await fs.copyFile(assPath, captions + '.ass');
  await fs.copyFile(path.join(dir, 'captions.srt'), captions + '.srt');
  const latest = await load(id);
  latest.artifacts[preview ? 'preview' : 'export'] = {
    file: output,
    composition: composite,
    revision: project.revision,
    width,
    height,
    fps: COMPOSITION_FPS,
    duration: media.duration,
    encoder: hardware ? 'NVENC' : 'CPU',
    srt: captions + '.srt',
    ass: captions + '.ass',
    createdAt: new Date().toISOString(),
  };
  await save(latest);
  report('Vídeo verificado y disponible');
  return latest;
}
