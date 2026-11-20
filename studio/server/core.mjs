import {faceDefaults,faceSettings} from './retouch-settings.mjs';
import {sourceDefaults,sourceSettings} from './source-settings.mjs';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portablePython=path.join(ROOT,'runtime/python/python.exe');
export const python=process.env.ELITE_PYTHON || (existsSync(portablePython)?portablePython:path.join(ROOT,'runtime/venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'));
export async function config(){return JSON.parse(await fs.readFile(path.join(ROOT,'config/studio.json'),'utf8'));}
export async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
export async function atomic(file,data){
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
    await fs.writeFile(temp,JSON.stringify(data,null,2),'utf8');
    for(let attempt=0;;attempt++){
      try{await fs.rename(temp,file);return;}
      catch(error){
        if(attempt>=10||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
        await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));
      }
    }
  }finally{
    await fs.unlink(temp).catch(()=>{});
  }
}
export const PROJECTS_ROOT=path.resolve(ROOT,process.env.STUDIO_PROJECTS_DIR||'projects');
export const ASSETS_FILE=path.resolve(ROOT,process.env.STUDIO_ASSETS_FILE||'config/assets.json');
export const CACHE_ROOT=path.resolve(ROOT,process.env.STUDIO_CACHE_DIR||'cache');
export const INPUT_ROOT=path.resolve(ROOT,process.env.STUDIO_INPUT_DIR||'input');
export const OUTPUT_ROOT=path.resolve(ROOT,process.env.STUDIO_OUTPUT_DIR||'output');
export const SUBTITLES_ROOT=path.resolve(ROOT,process.env.STUDIO_SUBTITLES_DIR||'subtitles');
export async function readAssets(){
  try{
    const assets=await json(ASSETS_FILE);
    if(!Array.isArray(assets))throw new Error('La biblioteca de recursos está dañada.');
    return assets;
  }catch(error){if(error.code==='ENOENT')return [];throw error;}
}
let assetQueue=Promise.resolve();
export function changeAssets(update){
  const task=assetQueue.then(async()=>{
    const next=await update(await readAssets());
    if(next)await atomic(ASSETS_FILE,next);
  });
  assetQueue=task.catch(()=>{});
  return task;
}
export function projectDir(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('ID de proyecto inválido');return path.join(PROJECTS_ROOT,id);}
export async function load(id){return json(path.join(projectDir(id),'project.json'));}
export async function save(p){p.updatedAt=new Date().toISOString();await atomic(path.join(projectDir(p.id),'project.json'),p);return p;}
export async function list(){let dirs;try{dirs=await fs.readdir(PROJECTS_ROOT);}catch(error){if(error.code==='ENOENT')return [];throw error;}const all=await Promise.all(dirs.filter(x=>/^[a-f0-9-]{36}$/.test(x)).map(x=>load(x).catch(()=>null)));return all.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function run(command,args,{cwd=ROOT,log,timeout=24*3600*1000,signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Trabajo cancelado'));return;}
    const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value);};
    const cancel=()=>{child.kill();finish(reject,new Error('Trabajo cancelado'));};
    const timer=setTimeout(()=>{child.kill();finish(reject,new Error('Tiempo máximo del proceso excedido'));},timeout);
    signal?.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',d=>{out=(out+d).slice(-8_000_000);});child.stderr.on('data',d=>{err=(err+d).slice(-300_000);if(log)log(d.toString());});
    child.on('error',e=>finish(reject,e));child.on('close',code=>{if(code===0)finish(resolve,{out,err});else finish(reject,new Error(`${path.basename(command)} (${code}): ${err.slice(-6000)}`));});
  });
}
export async function probe(file){const {out}=await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]);const p=JSON.parse(out),v=p.streams.find(s=>s.codec_type==='video');if(!v)throw new Error('El archivo no contiene vídeo');const duration=Number(p.format.duration||v.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('Duración de vídeo inválida');return {duration,width:v.width,height:v.height,fps:v.avg_frame_rate,audio:p.streams.some(s=>s.codec_type==='audio'),codec:v.codec_name};}
export const MOTIONS=['none','dolly-in','dolly-out','zoom-crash','pan-left','pan-right','tilt-up','ken-burns'];
export const defaults={...faceDefaults,...sourceDefaults,beautyAuto:true,style:'EDUCATIONAL',subtitle:'Tutorial',profile:'reels',fit:'contain',cropX:0.5,cropY:0.5,language:'es',subtitles:true,cleanAudio:true,exposure:0,contrast:1,saturation:1,transition:0,soundEffects:false,musicId:null,musicVolume:0.08,zoom:1,title:'',subtitlePosition:'bottom',encoder:'auto'};
export function validateSettings(s){const result={...defaults,...s,...faceSettings(s),...sourceSettings(s)};if(typeof result.beautyAuto!=='boolean')throw new Error('Belleza automática inválida');
  for(const [k,values] of Object.entries({style:['CINEMATIC','VIRAL','EDUCATIONAL'],subtitle:['Cinematic','Viral','Tutorial','Dark Future'],profile:['reels','tiktok','shorts','youtube','youtube4k'],fit:['contain','cover'],language:['es','en','auto'],subtitlePosition:['bottom','top'],encoder:['auto','cpu','nvenc']}))if(!values.includes(result[k]))throw new Error(`Ajuste inválido: ${k}`);
  for(const [k,min,max] of [['cropX',0,1],['cropY',0,1],['exposure',-0.15,0.15],['contrast',0.7,1.4],['saturation',0,1.5],['transition',0,0.5],['musicVolume',0,0.3],['zoom',1,1.18]])if(!Number.isFinite(result[k])||result[k]<min||result[k]>max)throw new Error(`Fuera de rango: ${k}`);
  for(const k of ['subtitles','cleanAudio','soundEffects'])if(typeof result[k]!=='boolean')throw new Error(`Ajuste inválido: ${k}`);
  if(typeof result.title!=='string'||result.title.length>120)throw new Error('Título demasiado largo');
  if(result.musicId!==null&&!/^[a-f0-9-]{36}$/.test(result.musicId))throw new Error('Recurso de música inválido');return Object.fromEntries(Object.keys(defaults).map(k=>[k,result[k]]));}
export function validateTimeline(clips,duration){if(!Array.isArray(clips)||!clips.length||clips.length>5000)throw new Error('Se necesitan entre 1 y 5000 fragmentos');let previous=0;return clips.map((c,i)=>{if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<previous-0.001||c.start<0||c.end>duration+0.001||c.end-c.start<0.05||typeof c.enabled!=='boolean')throw new Error(`Fragmento ${i+1} inválido: revisa tiempos, orden y duración`);previous=c.end;return {id:String(i),start:c.start,end:c.end,enabled:c.enabled,reason:String(c.reason||'Manual').slice(0,500)};});}
export async function importVideo(source,name,ownerId=null){
  const id=randomUUID(),dir=projectDir(id);
  const dest=path.join(INPUT_ROOT,'raw_videos',id+path.extname(name).toLowerCase());
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.mkdir(path.dirname(dir),{recursive:true});
  await fs.mkdir(dir);
  try{
    await fs.copyFile(source,dest,fs.constants.COPYFILE_EXCL);
    const media=await probe(dest);
    return await save({id,name:path.basename(name),ownerId,createdAt:new Date().toISOString(),source:dest,media,settings:{...defaults},clips:[{id:'0',start:0,end:media.duration,enabled:true,reason:'Original completo'}],transcript:[],analysis:null,reviewed:false,revision:0,artifacts:{},jobs:[]});
  }catch(error){
    if(error.code!=='EEXIST')await fs.unlink(dest).catch(()=>{});
    await fs.rmdir(dir).catch(()=>{});
    throw error;
  }
}
export function parseSilences(log,duration){const intervals=[];let start=null;for(const m of log.matchAll(/silence_(start|end):\s*([\d.]+)/g)){if(m[1]==='start')start=Number(m[2]);else if(start!==null){intervals.push({start,end:Math.min(duration,Number(m[2]))});start=null;}}if(start!==null)intervals.push({start,end:duration});return intervals;}
export const MIN_KEPT_FRAGMENT=0.35;
export function proposedClips(silences,duration,padding=0.18){let pos=0;const clips=[];for(const s of silences){const end=Math.min(duration,s.start+padding);if(s.start>pos&&end-pos>=MIN_KEPT_FRAGMENT)clips.push({start:pos,end});pos=Math.max(pos,s.end>=duration?duration:s.end-padding);}if(duration-pos>=MIN_KEPT_FRAGMENT)clips.push({start:pos,end:duration});if(!clips.length)return [{id:'0',start:0,end:duration,enabled:true,reason:'No se detectó voz clara; se conserva la grabación completa para revisión'}];return clips.map((c,i)=>({...c,id:String(i),enabled:true,reason:'Propuesta por silencio acústico; confirmar que no falta contenido'}));}
