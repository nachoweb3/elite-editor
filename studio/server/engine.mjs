import {sourceVideoFilters} from './source-settings.mjs';
import {sanitizeTranscript,fillerIntervals,removeIntervals} from './dialogue-clean.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,python,run,config,load,save,projectDir,json,parseSilences,MIN_KEPT_FRAGMENT,proposedClips,readAssets as readAssetRegistry} from './core.mjs';
import {ass} from './subtitles.mjs';
import {proposeWithAutoEditor,autoEditor} from './editor-bridge.mjs';
export function resolveCutPlan({silences,duration,autoClips=null,hasAudio,transcriptionComplete,transcript=[],padding=.18}){
  const full={id:'0',start:0,end:duration,enabled:true,reason:'Sin voz detectada: se conserva la grabación completa para revisión'};
  if(hasAudio&&!transcriptionComplete)return {clips:[full],engine:'ffmpeg',fullRecording:true,fallback:false,reason:'transcription-incomplete'};
  if(hasAudio&&transcript.length===0)return {clips:[full],engine:'ffmpeg',fullRecording:true,fallback:false,reason:'no-speech'};
  const auto=Array.isArray(autoClips)?autoClips.filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end-c.start>=MIN_KEPT_FRAGMENT):[];
  const total=clips=>clips.reduce((sum,clip)=>sum+clip.end-clip.start,0);
  const acoustic=proposedClips(silences,duration,padding);
  const autoKept=auto.length?total(auto):duration;
  const acousticKept=total(acoustic);
  const useAuto=Boolean(auto.length&&autoKept<duration-.35);
  const fallback=Boolean(auto.length&&!useAuto&&acousticKept<duration-.35);
  return {clips:useAuto?auto:acoustic,engine:useAuto?'auto-editor':'ffmpeg',fullRecording:false,fallback,reason:useAuto?'auto-editor':fallback?'auto-editor-no-cuts':'silence-detector'};
}
export const profiles={reels:[1080,1920,'reels'],reels4k:[2160,3840,'reels'],tiktok:[1080,1920,'reels'],shorts:[1080,1920,'shorts'],youtube:[1920,1080,'youtube'],youtube4k:[3840,2160,'youtube']};
let encoderPromise;
export async function nvenc(){return encoderPromise??=(async()=>{try{await run('ffmpeg',['-v','error','-f','lavfi','-i','color=s=640x360:d=0.15','-c:v','h264_nvenc','-f','null','-'],{timeout:20000});return true;}catch{return false;}})();}
export async function resolveRenderEncoder(requested, probeEncoder = nvenc) {
  if (requested === 'cpu') return 'CPU';
  if (await probeEncoder()) return 'NVENC';
  return requested === 'nvenc' ? null : 'CPU';
}
export async function doctor(){const checks={node:process.version,python:false,ffmpeg:false,ffprobe:false,nvenc:await nvenc(),model:false};for(const cmd of ['ffmpeg','ffprobe'])try{checks[cmd]=(await run(cmd,['-version'])).out.split('\n')[0];}catch(e){checks[cmd]=e.message;}try{checks.python=(await run(python,['-c','import sys, faster_whisper, cv2, scenedetect; print(sys.version)'])).out.trim();}catch(e){checks.python=e.message;}try{await fs.access(path.join(ROOT,'models',(await config()).model,'model.bin'));checks.model=true;}catch{}return checks;}
export async function analyze(id,report){let p=await load(id);const cfg=await config(),dir=projectDir(id),audio=path.join(dir,'audio.wav');report('Detectando silencios y preparando audio');const warnings=[];let silences=[];
  if(p.media.audio){report(`[cmd] ffmpeg -af silencedetect=noise=${cfg.silenceDb}dB:d=${cfg.silenceMin} · audio de la fuente`);const r=await run('ffmpeg',['-hide_banner','-nostdin','-i',p.source,'-map','0:a:0','-af',`silencedetect=noise=${cfg.silenceDb}dB:d=${cfg.silenceMin}`,'-f','null','-'],{log:report});silences=parseSilences(r.err,p.media.duration);await run('ffmpeg',['-v','error','-nostdin','-n','-i',p.source,'-map','0:a:0','-ar','16000','-ac','1',audio]).catch(async e=>{try{await fs.access(audio);}catch{throw e;}});}
  let autoClips=null; if(p.media.audio){report('Auto-Editor: proponiendo primera pasada');report('[cmd] auto-editor · propuesta de cortes por nivel de audio');try{autoClips=await proposeWithAutoEditor(p,cfg,report);}catch(e){if(/Timeline is empty|no encontró fragmentos activos/i.test(e.message))report('[agente] Auto-Editor no propuso cortes; usando el detector de silencios de FFmpeg');else warnings.push('Auto-Editor no disponible; propuesta FFmpeg como alternativa: '+e.message);}} const transcriptFile=path.join(dir,'transcript.json');let transcript=[];let transcriptionComplete=!p.media.audio;if(p.media.audio){report('Transcripción local por palabra');report('[cmd] python workers/transcribe.py · Whisper local con timestamps por palabra');const req=path.join(dir,'transcribe-request.json');await fs.writeFile(req,JSON.stringify({audio,language:p.settings.language,output:transcriptFile}));try{await run(python,[path.join(ROOT,'workers/transcribe.py'),req],{log:report});transcript=sanitizeTranscript((await json(transcriptFile)).segments);transcriptionComplete=true;if(!transcript.length)warnings.push('No se detectó voz en el audio; se conserva la grabación completa y no se generan subtítulos.');}catch(e){warnings.push('Transcripción no disponible: '+e.message);}}
  report('Detectando cambios visuales');let scenes=[];try{const f=path.join(dir,'scenes.json');report('[cmd] python workers/visual.py · escenas, rostros y luminosidad');await run(python,[path.join(ROOT,'workers/visual.py'),p.source,f],{log:report});scenes=await json(f);}catch(e){warnings.push('Análisis visual no disponible: '+e.message);}
  const vocabulary={trading:/trading|gráfico|precio|mercado|chart/i,tutorial:/paso|clic|click|configur|tutorial|instal/i,presentation:/presentación|diapositiva|slide/i,demonstration:/demostr|prueba|probar|funciona/i};
  for(const scene of scenes){const text=transcript.filter(s=>s.end>scene.start&&s.start<scene.end).map(s=>s.text).join(' ');scene.suggestions=Object.entries(vocabulary).filter(([,re])=>re.test(text)).map(([type])=>({type,confidence:0.45,reason:'Palabras del discurso; confirmar visualmente'}));}
  const plan=resolveCutPlan({silences,duration:p.media.duration,autoClips,hasAudio:p.media.audio,transcriptionComplete,transcript,padding:cfg.speechPadding});
  plan.clips=removeIntervals(plan.clips,fillerIntervals(transcript));
  if(plan.fallback)report('[agente] Auto-Editor no propuso cortes; aplico el detector de silencios de FFmpeg');
  if(plan.reason==='transcription-incomplete')warnings.push('La transcripción no terminó; se conserva la grabación completa para no perder contenido. Puedes reintentar el análisis.');
  p=await load(id);p.transcript=transcript;p.analysis={silences,scenes,warnings,completedAt:new Date().toISOString(),model:cfg.model,cutEngine:plan.engine,transcriptionComplete};p.clips=plan.clips;p.reviewed=false;p.revision++;p.artifacts={};await save(p);report(warnings.length?'Análisis terminado con avisos':'Análisis terminado');return p;
}
export function frameFilter(s,w,h){let f=s.fit==='cover'?`scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${s.cropX}:(ih-oh)*${s.cropY}`:`scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x08090D`;
  if(s.zoom>1)f+=`,scale=trunc(iw*${s.zoom}/2)*2:trunc(ih*${s.zoom}/2)*2:flags=lanczos,crop=${w}:${h}:(iw-ow)*${s.cropX}:(ih-oh)*${s.cropY}`;return f+`,setsar=1,eq=brightness=${s.exposure}:contrast=${s.contrast}:saturation=${s.saturation}`+(sourceVideoFilters(s).length?','+sourceVideoFilters(s).join(','):'');}
export function motionFilter(motion,w,h,length,fps=30){
  if(!motion||motion==='none')return '';
  const frames=Math.max(2,Math.round(length*fps));
  const zoompan=(z,x,y)=>`,zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${w}x${h}:fps=${fps}`;
  const centreX='(iw-iw/zoom)/2',centreY='(ih-ih/zoom)/2',travel=`on/${frames}`;
  switch(motion){
    case 'dolly-in':return zoompan(`1+0.08*${travel}`,centreX,centreY);
    case 'dolly-out':return zoompan(`1.08-0.08*${travel}`,centreX,centreY);
    case 'zoom-crash':return zoompan(`1+0.18*${travel}`,centreX,centreY);
    case 'pan-left':return zoompan('1.1',`(iw-iw/zoom)*(1-${travel})`,centreY);
    case 'pan-right':return zoompan('1.1',`(iw-iw/zoom)*${travel}`,centreY);
    case 'tilt-up':return zoompan('1.1',centreX,`(ih-ih/zoom)*(1-${travel})`);
    case 'ken-burns':return zoompan(`1+0.07*${travel}`,`(iw-iw/zoom)*(0.5+0.35*${travel})`,centreY);
    default:return '';
  }
}
export async function render(...args){return (await import('./render-pipeline.mjs')).render(...args);}
export async function readAssets(){return readAssetRegistry().catch(()=>[]);}
export async function thumbnail(id,time,title){const p=await load(id);if(!Number.isFinite(time)||time<0||time>p.media.duration)throw new Error('Tiempo inválido');const dir=path.join(ROOT,'cache',randomUUID());await fs.mkdir(dir);await fs.writeFile(path.join(dir,'cover.ass'),ass([],{...p.settings,subtitles:false,title:String(title).slice(0,120)},1080,1920,5));const output=path.join(ROOT,'thumbnails',`${id}-${randomUUID()}.jpg`);await run('ffmpeg',['-v','error','-ss',String(time),'-i',p.source,'-vf',frameFilter({...p.settings,fit:'contain',zoom:1},1080,1920)+',ass=filename=cover.ass','-frames:v','1','-update','1',output],{cwd:dir});p.artifacts.thumbnail={file:output};await save(p);return p;}
