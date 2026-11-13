import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ROOT,load,save,run,probe} from './core.mjs';
import {retouchSource} from './retouch.mjs';
import {faceSettings} from './retouch-settings.mjs';

// Enhance the full source, never the assembled edit: existing trim offsets stay valid.
export async function prepareEnhancedSource(id,report=()=>{}){
 const p=await load(id);if(p.blank||!p.source)throw Error('Esta función necesita una grabación original');
 const stat=await fs.stat(p.source),settings={...faceSettings(p.settings),cleanAudio:p.settings.cleanAudio===true};
 const key=createHash('sha256').update(JSON.stringify({source:p.source,size:stat.size,mtime:stat.mtimeMs,settings,version:1})).digest('hex').slice(0,24);
 const dir=path.join(ROOT,'cache/enhanced-sources');await fs.mkdir(dir,{recursive:true});const output=path.join(dir,key+'.mp4');
 let media;try{media=await probe(output);if(Math.abs(media.duration-p.media.duration)>.1)media=null;}catch{}
 if(!media){const input=await retouchSource(p,report),temp=path.join(dir,key+'-'+randomUUID()+'.mp4');
  try{report('Preparando original mejorado: conservando cortes y tiempos');const info=await probe(input);
   const args=['-hide_banner','-nostdin','-y','-i',input,'-map','0:v:0','-map','0:a:0?','-c:v',info.codec==='h264'?'copy':'libx264'];
   if(info.codec!=='h264')args.push('-preset','fast','-crf','18','-pix_fmt','yuv420p');
   if(info.audio){if(settings.cleanAudio)args.push('-af','highpass=f=75,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','192k');else args.push('-c:a','aac','-b:a','192k');}
   args.push('-movflags','+faststart',temp);await run('ffmpeg',args,{log:report});media=await probe(temp);
   if(Math.abs(media.duration-p.media.duration)>.1||media.width!==p.media.width||media.height!==p.media.height)throw Error('La mejora alteró los tiempos o las dimensiones; se ha conservado el original');
   await fs.rename(temp,output);
  }finally{await fs.unlink(temp).catch(()=>{});}
 }
 const latest=await load(id);if(latest.revision!==p.revision)throw Error('Los ajustes cambiaron durante la preparación. Vuelve a prepararlo.');
 latest.artifacts.enhancedSource={file:output,key,revision:p.revision,settings,media,createdAt:new Date().toISOString()};await save(latest);report('Preparando original mejorado: listo para aplicar en la timeline');return latest.artifacts.enhancedSource;
}
