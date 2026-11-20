import fs from 'node:fs/promises';
import {ROOT} from './core.mjs';
import {profiles,readAssets,resolveRenderEncoder} from './engine.mjs';
import {artifactDownloadName} from './export-filename.mjs';
import {COMPOSITION_FPS,outputDuration} from '../shared/composition.mjs';

const HD_PIXELS=1920*1080;
const rounded=value=>Number(value.toFixed(1));

async function measuredExport(p,{encoder,width,height,duration}){
  const artifact=p.artifacts?.export;
  if(!artifact?.file||artifact.revision!==p.revision||artifact.width!==width||artifact.height!==height
    ||artifact.encoder!==encoder||!Number.isFinite(artifact.duration)||Math.abs(artifact.duration-duration)>.25)return null;
  const stat=await fs.stat(artifact.file).catch(()=>null);
  return stat?.isFile()&&stat.size>0?stat.size/1e6:null;
}

function roughEstimates({duration,width,height,encoder,clipCount}){
  if(!encoder||!duration)return {sizeRangeMB:null,timeRangeSeconds:null};
  const pixelLoad=width*height/HD_PIXELS*COMPOSITION_FPS/30;
  // CRF/CQ has no target bitrate. Use a broad 1080p envelope and scale it
  // with pixel throughput, plus the render's 192 kb/s AAC track.
  const videoMbps=encoder==='NVENC'?[1.5,12]:[1.2,8];
  const sizeRangeMB=videoMbps.map(rate=>Math.max(.1,rounded(duration*(rate*pixelLoad**.8+.192)/8)));
  // Relative wall time of an uncached two-pass render at 1080p30.
  const workload=encoder==='NVENC'?[.16,.85]:[.2,2.4];
  const setup=2+.4*clipCount;
  const timeRangeSeconds=workload.map(multiplier=>Math.ceil(setup+duration*pixelLoad*multiplier));
  return {sizeRangeMB,timeRangeSeconds};
}

export async function exportPreflight(p){
  const profile=profiles[p.settings?.profile]?p.settings.profile:'youtube';
  const [width,height]=profiles[profile];
  const clips=p.clips.filter(c=>c.enabled);
  const duration=outputDuration({clips});
  const requestedEncoder=p.settings?.encoder||'auto';
  const [encoder,sourceOk,assets,freeBytes]=await Promise.all([
    resolveRenderEncoder(requestedEncoder),
    fs.stat(p.source).then(stat=>stat.isFile(),()=>false),
    readAssets(),
    fs.statfs(ROOT).then(stat=>stat.bavail*stat.bsize,()=>null),
  ]);

  const checks=[];
  const add=(level,label,detail)=>checks.push({level,label,detail});
  if(!clips.length)add('error','Sin clips activos','Activa al menos un fragmento del montaje antes de exportar.');
  else if(!duration)add('error','Duración cero','El montaje no tiene ningún tramo que renderizar.');
  const longest=Math.max(p.media?.width||0,p.media?.height||0);
  if(profile==='youtube4k'&&longest&&longest<3840)add('error','4K sin origen 4K',`Tu grabación es ${p.media.width}×${p.media.height}. Exporta 1080p o cambia de perfil.`);
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

  const {sizeRangeMB,timeRangeSeconds}=roughEstimates({duration,width,height,encoder,clipCount:clips.length});
  const measuredSizeMB=encoder?await measuredExport(p,{encoder,width,height,duration}):null;
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
    fps:COMPOSITION_FPS,
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
