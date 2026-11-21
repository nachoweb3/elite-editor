import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,python,run,load,save,probe} from './core.mjs';
import {stickmanInserts,insertOverlayGraph,spliceInserts} from './stickman.mjs';
import {placementsForArtifact} from './face-safe.mjs';
import {buildComposition} from '../shared/composition.mjs';
import {cacheFile,cachePath,copyAtomic,overlayKey,fingerPrint,throwIfCancelled} from './render-cache.mjs';
import {outputQuality,videoEncodingArgs} from './render-format.mjs';
const cropCache=new Map();
export async function decorate(id,preview,report,{signal}={}){
 throwIfCancelled(signal);
 const p=await load(id),kind=preview?'preview':'export',artifact=p.artifacts[kind];if(!artifact)return;
 const cutMode=p.stickmen?.enabled===true&&p.stickmen?.mode==='cut';
 const composition=buildComposition(p),visuals=composition.visuals,plannedAudio=composition.audio;
 const media=(p.automatic?.direction?.media||[]).slice(0,12),inserts=await stickmanInserts(p,artifact,report);
 let placements=new Map();
 const needsPlacement=media.some(item=>['meme','pexels'].includes(item.kind)&&item.status!=='rejected'&&!item.placement);
 if(needsPlacement){
  try{placements=await placementsForArtifact(p,artifact,report,{signal});}
  catch(error){if(signal?.aborted)throw error;report('No se pudo analizar caras; los memes se omiten para no tapar a nadie: '+error.message);for(let i=0;i<media.length;i++)if(['meme','pexels'].includes(media[i].kind))placements.set(i,null);}
 }
 const visualInserts=visuals.some(visual=>media[visual.index]?.file&&(visual.placement||placements.get(visual.index)));
 const audioInserts=plannedAudio.some(event=>event.type==='media-sound'&&media[event.mediaIndex]?.file);
 if(visualInserts||audioInserts||inserts.length){
  const cacheMedia=media.map(({placement,...item})=>item);
  const key=overlayKey({artifact:artifact.composition?{composition:artifact.composition}:await fingerPrint(artifact.file),media:cacheMedia,visuals,audio:plannedAudio,placements,inserts,width:artifact.width,height:artifact.height});
  const cached=await cacheFile('overlays',key);
  const output=artifact.file.replace(/\.mp4$/,'-resources.mp4');
  if(cached){
   report('[cache] Composición de recursos reutilizada');
   await copyAtomic(cached.file,output);
   const latest=await load(id);
   if(latest.automatic?.direction?.media)for(const [mediaIndex,placement] of placements){const item=latest.automatic.direction.media[mediaIndex];if(item&&['meme','pexels'].includes(item.kind)&&!item.placement)item.placement=placement;}
   latest.artifacts[kind]={...artifact,file:output,createdAt:new Date().toISOString()};await save(latest);if(cutMode)await spliceInserts(id,preview,report);return;
  }
  report(inserts.length?'Componiendo recursos y explicaciones con stickman':'Componiendo memes, sonidos y recursos seleccionados');
  const args=['-v','error','-y','-i',artifact.file];let graph='',video='0:v',audio='0:a',index=1;
  for(const visual of visuals){
   const mediaIndex=visual.index,item=media[mediaIndex];if(!item)continue;
   const placement=visual.placement||placements.get(mediaIndex);if(!placement)continue;const at=visual.at,duration=visual.duration,image=visual.image,volume=visual.volume;
   if(image)args.push('-loop','1');args.push('-i',item.file);const source=index++;
   let green=visual.chroma.enabled===true,color=visual.chroma.color;if(visual.chroma.enabled===null){try{const {out}=await run(python,[path.join(ROOT,'workers/asset_info.py'),item.file]);const info=JSON.parse(out);green=info.green;color=info.color;}catch{green=false;}}
   let crop='';if(!image){try{if(!cropCache.has(item.file)){const info=await probe(item.file),{err}=await run('ffmpeg',['-hide_banner','-ss','0.2','-i',item.file,'-vf','cropdetect=24:2:0','-frames:v','12','-f','null','-']),matches=[...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)],last=matches.at(-1);let value='';if(last){const [w,h,x,y]=last.slice(1).map(Number);if(w>=info.width*.55&&h>=info.height*.55&&(w<info.width*.98||h<info.height*.98))value=`crop=${w}:${h}:${x}:${y},`;}cropCache.set(item.file,value);}crop=cropCache.get(item.file)||'';}catch{crop='';}}
   const width=Math.floor(artifact.width*placement.w/2)*2,height=Math.floor(artifact.height*placement.h/2)*2,x=Math.round(artifact.width*placement.x),yBottom=Math.round(artifact.height*(placement.y+placement.h));
   graph+=`[${source}:v]${crop}trim=duration=${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba${green?`,colorkey=${color}:${visual.chroma.similarity}:${visual.chroma.blend}`:''},setpts=PTS+${at}/TB[m${source}];[${video}][m${source}]overlay=x=${x}:y=${yBottom}-h:enable='between(t,${at},${at+duration})':eof_action=pass:repeatlast=0[v${source}];`;video=`v${source}`;
   const audioPlan=plannedAudio.find(event=>event.type==='media-overlay'&&event.mediaIndex===mediaIndex);
   if(audioPlan&&!image){const info=await probe(item.file);if(info.audio){graph+=`[${source}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${audioPlan.volume},adelay=${Math.round(at*1000)}:all=1[ma${source}];[${audio}][ma${source}]amix=inputs=2:duration=first:normalize=0[a${source}];`;audio=`a${source}`;}}
  }
  for(const event of plannedAudio.filter(event=>event.type==='media-sound')){
   const item=media[event.mediaIndex];if(!item?.file)continue;args.push('-i',item.file);const source=index++;
   graph+=`[${source}:a]atrim=duration=${event.duration},asetpts=PTS-STARTPTS,volume=${event.volume},adelay=${Math.round(event.at*1000)}:all=1[s${source}];[${audio}][s${source}]amix=inputs=2:duration=first:normalize=0[a${source}];`;audio=`a${source}`;
  }
  const overlay=insertOverlayGraph(video,inserts,index,args);graph+=overlay.graph;video=overlay.video;index=overlay.index;
  graph+=`[${video}]format=yuv420p[vout];[${audio}]alimiter=limit=0.95:level=0:latency=1[aout]`;
  const dir=path.join(ROOT,'cache',randomUUID());await fs.mkdir(dir);await fs.writeFile(path.join(dir,'resources.ffgraph'),graph);
  const rendered=path.join(dir,'resources.mp4');args.push('-/filter_complex',path.join(dir,'resources.ffgraph'),'-map','[vout]','-map','[aout]','-t',String(artifact.duration),...videoEncodingArgs(artifact.encoder==='NVENC',artifact.quality||outputQuality(p.settings)),'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',rendered);await run('ffmpeg',args,{log:report,signal});throwIfCancelled(signal);const info=await probe(rendered);if(Math.abs(info.duration-artifact.duration)>.25)throw new Error('Duración incorrecta tras añadir recursos');const cacheTarget=await cachePath('overlays',key);await copyAtomic(rendered,cacheTarget);await copyAtomic(rendered,output);
  const latest=await load(id);
  if(latest.automatic?.direction?.media)for(const [mediaIndex,placement] of placements){const item=latest.automatic.direction.media[mediaIndex];if(item&&['meme','pexels'].includes(item.kind)&&!item.placement)item.placement=placement;}
  latest.artifacts[kind]={...artifact,file:output,createdAt:new Date().toISOString()};await save(latest);
 }
 if(cutMode)await spliceInserts(id,preview,report);
}
