import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,load,save,run,python,probe} from './core.mjs';
import {faceSettings} from './retouch-settings.mjs';
export async function retouchSource(p,report){
 const settings=faceSettings(p.settings);if(!settings.faceRetouch||!Object.entries(settings).some(([k,v])=>k!=='faceRetouch'&&Math.abs(v)>0))return p.source;
 const sourceStat=await fs.stat(p.source);
 const hash=createHash('sha256').update(JSON.stringify({source:p.source,size:sourceStat.size,mtime:sourceStat.mtimeMs,settings,version:2})).digest('hex').slice(0,20),dir=path.join(ROOT,'cache','portrait-'+hash);await fs.mkdir(dir,{recursive:true});
 const output=path.join(dir,'portrait.mp4'),summary=path.join(dir,'report.json');
 try{await fs.access(summary);await probe(output);return output;}catch{}
 report('Retocando rostro: seguimiento, piel e iluminación local');
 let encoder='libx264';try{await run('ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:d=0.1','-c:v','h264_nvenc','-f','null','-']);encoder='h264_nvenc';}catch{}
 const request=path.join(dir,'request.json');await fs.writeFile(request,JSON.stringify({source:p.source,output,report:summary,settings,encoder}));await run(python,[path.join(ROOT,'workers/retouch.py'),request],{log:report});
 const info=await probe(output);if(Math.abs(info.duration-p.media.duration)>.25)throw new Error('El retoque no conserva la duración del original');
 const stats=JSON.parse(await fs.readFile(summary,'utf8')),latest=await load(p.id);latest.portrait={...stats,settings,file:output};await save(latest);report(`Retocando rostro: terminado, ${stats.framesWithFace}/${stats.frames} fotogramas con rostro`);return output;
}
