import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,python,run,load,save,probe} from './core.mjs';
import {stickmanInserts,insertOverlayGraph,spliceInserts} from './stickman.mjs';
export async function decorate(id,preview,report){
 const p=await load(id),kind=preview?'preview':'export',artifact=p.artifacts[kind];if(!artifact)return;
 const cutMode=p.stickmen?.enabled===true&&p.stickmen?.mode==='cut';
 const media=(p.automatic?.direction?.media||[]).slice(0,12),inserts=await stickmanInserts(p,artifact,report);
 if(media.length||inserts.length){
  report(inserts.length?'Componiendo recursos y explicaciones con stickman':'Componiendo memes, sonidos y recursos seleccionados');
  const args=['-v','error','-y','-i',artifact.file];let graph='',video='0:v',audio='0:a',index=1;
  for(const item of media){
   const at=item.outputTime,duration=Math.min(3.5,artifact.duration-at);if(!Number.isFinite(at)||at<0||duration<=0)continue;
   const image=/\.(png|jpe?g|webp)$/i.test(item.file),sound=item.kind==='sound';
   if(image)args.push('-loop','1');args.push('-i',item.file);const source=index++;
   if(sound){graph+=`[${source}:a]atrim=duration=${Math.min(2,duration)},asetpts=PTS-STARTPTS,volume=0.16,adelay=${Math.round(at*1000)}:all=1[s${source}];[${audio}][s${source}]amix=inputs=2:duration=first:normalize=0[a${source}];`;audio=`a${source}`;continue;}
   let green=item.greenScreen,color='0x00FF00';if(green===null){try{const {out}=await run(python,[path.join(ROOT,'workers/asset_info.py'),item.file]);const info=JSON.parse(out);green=info.green;color=info.color;}catch{green=false;}}
   const width=Math.floor(artifact.width*.42/2)*2,height=Math.floor(artifact.height*.42/2)*2;
   graph+=`[${source}:v]trim=duration=${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba${green?`,colorkey=${color}:0.22:0.08`:''},setpts=PTS+${at}/TB[m${source}];[${video}][m${source}]overlay=x=W-w-20:y=H-h-30:enable='between(t,${at},${at+duration})':eof_action=pass:repeatlast=0[v${source}];`;video=`v${source}`;
   if(item.useAudio&&!image){const info=await probe(item.file);if(info.audio){graph+=`[${source}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=0.12,adelay=${Math.round(at*1000)}:all=1[ma${source}];[${audio}][ma${source}]amix=inputs=2:duration=first:normalize=0[a${source}];`;audio=`a${source}`;}}
  }
  const overlay=insertOverlayGraph(video,inserts,index,args);graph+=overlay.graph;video=overlay.video;index=overlay.index;
  graph+=`[${video}]format=yuv420p[vout];[${audio}]alimiter=limit=0.95:level=0:latency=1[aout]`;
  const dir=path.join(ROOT,'cache',randomUUID());await fs.mkdir(dir);await fs.writeFile(path.join(dir,'resources.ffgraph'),graph);
  const output=artifact.file.replace(/\.mp4$/,'-resources.mp4');args.push('-/filter_complex',path.join(dir,'resources.ffgraph'),'-map','[vout]','-map','[aout]','-t',String(artifact.duration),'-c:v',artifact.encoder==='NVENC'?'h264_nvenc':'libx264','-c:a','aac','-b:a','192k','-movflags','+faststart',output);await run('ffmpeg',args,{log:report});const info=await probe(output);if(Math.abs(info.duration-artifact.duration)>.25)throw new Error('Duración incorrecta tras añadir recursos');
  const latest=await load(id);latest.artifacts[kind]={...artifact,file:output,createdAt:new Date().toISOString()};await save(latest);
 }
 if(cutMode)await spliceInserts(id,preview,report);
}
