import fs from 'node:fs/promises';
import {ROOT,load} from './core.mjs';
import {profiles,readAssets,resolveRenderEncoder} from './engine.mjs';
import {artifactDownloadName} from './export-filename.mjs';
import {outputDuration} from '../shared/composition.mjs';
import {sourceCanvas, sourceDimensions} from '../shared/source-format.mjs';
import {mediaFrameRate,outputFrameRate,outputQuality,requiresExtendedColor,sourceIsUhd,sourceMedia,UNSUPPORTED_COLOR} from './render-format.mjs';

const HD_PIXELS=1920*1080;
const rounded=value=>Number(value.toFixed(1));

async function measuredExport(p,{encoder,width,height,duration,fps,quality}){
  const artifact=p.artifacts?.export;
  if(!artifact?.file||artifact.revision!==p.revision||artifact.width!==width||artifact.height!==height
    ||artifact.encoder!==encoder||Math.abs((artifact.fps||30)-fps)>.1||(artifact.quality||'balanced')!==quality
    ||!Number.isFinite(artifact.duration)||Math.abs(artifact.duration-duration)>.25)return null;
  const stat=await fs.stat(artifact.file).catch(()=>null);
  return stat?.isFile()&&stat.size>0?stat.size/1e6:null;
}

function roughEstimates({duration,width,height,encoder,clipCount,fps,quality}){
  if(!encoder||!duration)return {sizeRangeMB:null,timeRangeSeconds:null};
  const pixelLoad=width*height/HD_PIXELS*fps/30;
  // CRF/CQ has no target bitrate. Use a broad 1080p envelope and scale it
  // with pixel throughput, plus the render's 192 kb/s AAC track.
  const videoMbps=encoder==='NVENC'?[1.5,12]:[1.2,8];
  const detail=quality==='high'?1.35:1;
  const sizeRangeMB=videoMbps.map(rate=>Math.max(.1,rounded(duration*(rate*detail*pixelLoad**.8+.192)/8)));
  // Relative wall time of an uncached two-pass render at 1080p30.
  const workload=encoder==='NVENC'?[.16,.85]:[.2,2.4];
  const setup=2+.4*clipCount;
  const timeRangeSeconds=workload.map(multiplier=>Math.ceil(setup+duration*pixelLoad*multiplier));
  return {sizeRangeMB,timeRangeSeconds};
}

export async function exportPreflight(p){
  const profile=profiles[p.settings?.profile]?p.settings.profile:'source';
  const clips=p.clips.filter(c=>c.enabled);
  const duration=outputDuration({clips});
  const requestedEncoder=p.settings?.encoder||'auto';
  const ids=[...new Set(clips.map(clip=>clip.sourceId||p.id))];
  const [encoder,sourceOk,assets,freeBytes,sources]=await Promise.all([
    resolveRenderEncoder(requestedEncoder),
    fs.stat(p.source).then(stat=>stat.isFile(),()=>false),
    readAssets(),
    fs.statfs(ROOT).then(stat=>stat.bavail*stat.bsize,()=>null),
    Promise.all(ids.map(id=>id===p.id?p:load(id).then(source=>!source.ownerId||source.ownerId===p.ownerId?source:null,()=>null))),
  ]);
  const mediaSources=await Promise.all(sources.filter(Boolean).map(sourceMedia));
  const [width,height]=profiles[profile]||sourceCanvas(p.media,mediaSources);
  const fps=outputFrameRate(p.settings,mediaSources);
  const quality=outputQuality(p.settings);
  const sourceMaxFps=Math.max(0,...mediaSources.map(mediaFrameRate));
  const reducesResolution=mediaSources.some(media=>{
    const [w,h]=sourceDimensions(media);
    return w>width||h>height;
  });
  const reducesFrameRate=sourceMaxFps>fps+.1;

  const checks=[];
  const add=(level,label,detail)=>checks.push({level,label,detail});
  if(!clips.length)add('error','Sin clips activos','Activa al menos un fragmento del montaje antes de exportar.');
  else if(!duration)add('error','Duración cero','El montaje no tiene ningún tramo que renderizar.');
  const hasUhd=mediaSources.some(sourceIsUhd);
  if(profile.endsWith('4k')&&!hasUhd)add('error','4K sin origen 4K','Para exportar en 4K, al menos un clip necesita una grabación original de 3840 × 2160 o 2160 × 3840.');
  if(mediaSources.some(requiresExtendedColor))add('error','HDR o profundidad de color incompatible',UNSUPPORTED_COLOR);
  if(width*height>3840*2160||fps>60)add('warn','Formato exigente',`La salida de ${width} × ${height} a ${Number(fps.toFixed(2))} fps requiere un codificador y un reproductor compatibles.`);
  if(reducesResolution)
    add('warn','Reducción de resolución',`El formato de ${width} × ${height} puede reducir el detalle de uno o más clips. Elige «Como el original» para mantenerlo.`);
  if(reducesFrameRate)add('warn','Menos fotogramas por segundo',`La fuente llega a ${Number(sourceMaxFps.toFixed(2))} fps y la salida está a ${Number(fps.toFixed(2))} fps.`);
  if(!p.blank&&!sourceOk)add('error','Falta el vídeo original','El archivo de origen ya no está en su ruta. Reimporta el vídeo o restaura el archivo.');
  const missingAudio=(p.audioTracks||[]).filter(t=>!assets.some(a=>a.id===t.assetId&&!a.trashedAt));
  if(missingAudio.length)add('warn','Audio no disponible',missingAudio.length===1
    ?'Una pista de la línea de audio ya no está en la biblioteca y se omitirá.'
    :`${missingAudio.length} pistas de la línea de audio ya no están en la biblioteca y se omitirán.`);
  if(p.settings?.subtitles&&!p.transcript?.length)add('warn','Sin transcripción','Los subtítulos no se quemarán porque el proyecto no tiene texto. Analiza el vídeo primero si los quieres.');
  if(duration>20*60)add('warn','Exportación larga',`Son ${Math.round(duration/60)} minutos de salida. Puedes cancelar y reanudar sin perder lo ya renderizado.`);
  if((p.shorts?.items||[]).every(s=>s.status!=='ready')&&p.shorts?.status==='rendering')add('warn','Shorts en curso','El render compite por la GPU con los shorts que se están creando.');
  if(!encoder)add('error','NVENC no disponible','Este equipo no supera la prueba de codificación. Selecciona Automático o CPU.');
  else if(encoder==='NVENC')add('ok','Aceleración NVENC',requestedEncoder==='auto'
    ?'La GPU codificará H.264. El modo automático puede pasar a CPU si falla al codificar un fragmento.'
    :'La GPU codificará H.264 con el motor seleccionado.');
  else add('ok','Render por CPU',requestedEncoder==='cpu'
    ?'Se usará la CPU según el ajuste que elegiste.'
    :'El modo automático usará la CPU porque NVENC no está disponible.');

  const {sizeRangeMB,timeRangeSeconds}=roughEstimates({duration,width,height,encoder,clipCount:clips.length,fps,quality});
  const measuredSizeMB=encoder?await measuredExport(p,{encoder,width,height,duration,fps,quality}):null;
  // Fragments and the final MP4 may coexist during rendering. Warn based on
  // the measured size or low end of the estimate, using the same byte units.
  const estimatedMinimumMB=measuredSizeMB??sizeRangeMB?.[0];
  const freeGB=freeBytes===null?null:rounded(freeBytes/1e9);
  if(freeBytes!==null&&estimatedMinimumMB&&freeBytes<2*estimatedMinimumMB*1e6){
    add('warn','Poco espacio libre',`Quedan ${freeGB} GB. Libera espacio para el MP4 y los fragmentos temporales.`);
  }
  const last=(p.jobs||[]).findLast(job=>job.type==='render');
  return {
    ok:!checks.some(c=>c.level==='error'),
    revision:p.revision,
    profile,
    width,
    height,
    fps:Number(fps.toFixed(2)),
    quality,
    reducesQuality:reducesResolution||reducesFrameRate,
    encoder,
    duration:rounded(duration),
    sizeMB:measuredSizeMB??(sizeRangeMB?rounded((sizeRangeMB[0]+sizeRangeMB[1])/2):null),
    sizeRangeMB,
    measuredSizeMB,
    freeGB,
    minutes:timeRangeSeconds?rounded((timeRangeSeconds[0]+timeRangeSeconds[1])/120):null,
    timeRangeSeconds,
    checks,
    resumable:!!last&&['failed','interrupted','cancelled'].includes(last.status),
    lastJob:last?{id:last.id,status:last.status,message:last.message||''}:null,
    name:artifactDownloadName(p,'export','.mp4'),
  };
}
