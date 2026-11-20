import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,load,save,run,python,probe} from './core.mjs';
import {faceSettings} from './retouch-settings.mjs';
export async function retouchSource(p,report,{signal}={}){
 const settings=faceSettings(p.settings);if(!settings.faceRetouch||!Object.entries(settings).some(([k,v])=>k!=='faceRetouch'&&Math.abs(v)>0))return p.source;
 const sourceStat=await fs.stat(p.source);
 const hash=createHash('sha256').update(JSON.stringify({source:p.source,size:sourceStat.size,mtime:sourceStat.mtimeMs,settings,version:5})).digest('hex').slice(0,20),dir=path.join(ROOT,'cache','portrait-'+hash);await fs.mkdir(dir,{recursive:true});
 const output=path.join(dir,'portrait.mp4'),summary=path.join(dir,'report.json');
 try{await fs.access(summary);await probe(output);return output;}catch{}
 if(!await fs.access(path.join(ROOT,'models','face_landmarker.task')).then(()=>true,()=>false)){
  report('Retocando rostro: omitido. Instala el modelo facial opcional para activar este efecto.');
  return p.source;
 }
 report('Retocando rostro: proporciones por landmarks, piel e iluminación local');
 let encoder='libx264';try{await run('ffmpeg',['-v','error','-f','lavfi','-i','color=s=640x360:d=0.15','-c:v','h264_nvenc','-f','null','-'],{timeout:20000,signal});encoder='h264_nvenc';}catch(error){if(signal?.aborted)throw error;}
 const request=path.join(dir,'request.json');await fs.writeFile(request,JSON.stringify({source:p.source,output,report:summary,settings,encoder,maxFps:30,detectWidth:640}));await run(python,[path.join(ROOT,'workers/retouch.py'),request],{log:report,signal});
 const info=await probe(output);if(Math.abs(info.duration-p.media.duration)>.25)throw new Error('El retoque no conserva la duración del original');
 const stats=JSON.parse(await fs.readFile(summary,'utf8')),latest=await load(p.id);latest.portrait={...stats,settings,file:output};await save(latest);report(`Retocando rostro: terminado, ${stats.framesWithFace}/${stats.frames} fotogramas con rostro`);return output;
}
