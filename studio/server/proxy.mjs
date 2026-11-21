import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ROOT,config,run} from './core.mjs';
import {requiresExtendedColor,sourceMedia,UNSUPPORTED_COLOR} from './render-format.mjs';

const pending=new Map();
const uploadExtensions=new Set(['.mp4','.m4v','.mov','.webm','.mkv','.avi','.wmv','.flv','.mpg','.mpeg','.3gp','.ts','.ogv']);
const browserEncoding=['-map','0:v:0','-map','0:a?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-fps_mode','passthrough',
  '-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','192k','-movflags','+faststart'];

// Receives a browser-imported video and returns a temporary compatible copy.
// The caller must delete the returned file after streaming it.
export async function uploadedProxy({req,name}){
  const ext=path.extname(path.basename(name||'video.mp4')).toLowerCase();
  if(!uploadExtensions.has(ext))throw Error('Formato de vídeo no admitido para el proxy');
  const uploadDir=path.join(ROOT,'cache','proxy-uploads');
  const proxyDir=path.join(ROOT,'cache','proxies');
  await fsp.mkdir(uploadDir,{recursive:true});
  await fsp.mkdir(proxyDir,{recursive:true});
  const source=path.join(uploadDir,`${randomUUID()}${ext}`);
  const target=path.join(proxyDir,`manual-${randomUUID()}.mp4`);
  const limit=(await config()).maxUploadGB*1024**3;
  let size=0;
  try{
    await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>limit?new Error('Archivo demasiado grande'):null,chunk);}}),fs.createWriteStream(source,{flags:'wx'}));
    if(!size)throw Error('El vídeo está vacío');
    if(requiresExtendedColor(await sourceMedia({source})))throw Error(UNSUPPORTED_COLOR);
    await run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',source,...browserEncoding,target]);
    const stat=await fsp.stat(target);
    if(!stat.size)throw Error('El proxy quedó vacío');
    return target;
  }catch(error){
    await fsp.unlink(target).catch(()=>{});
    throw error;
  }finally{
    await fsp.unlink(source).catch(()=>{});
  }
}

// Compatible media streams straight from the original. Other containers get
// a browser-compatible copy at the same dimensions and cadence.
export async function projectProxy(p){
  if(!p.source)throw Error('El proyecto no tiene un vídeo original');
  const extension=path.extname(p.source).toLowerCase();
  if(extension==='.mp4'&&p.media?.codec==='h264'
    ||extension==='.webm'&&['vp8','vp9','av1'].includes(p.media?.codec))return p.source;
  if(requiresExtendedColor(await sourceMedia(p)))return p.source;
  const stat=await fsp.stat(p.source);
  const key=createHash('sha1').update(`native:${p.id}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0,16);
  const dir=path.join(ROOT,'cache','proxies');
  const target=path.join(dir,`${p.id}-${key}.mp4`);
  try{const existing=await fsp.stat(target);if(existing.size>0)return target;}catch{}
  const current=pending.get(target);
  if(current)return current;
  const job=(async()=>{
    await fsp.mkdir(dir,{recursive:true});
    const temp=target+'.part.mp4';
    try{
      await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',p.source,...browserEncoding,temp]);
      const result=await fsp.stat(temp);
      if(!result.size)throw Error('El proxy quedó vacío');
      await fsp.rename(temp,target);
      return target;
    }finally{
      await fsp.unlink(temp).catch(()=>{});
      pending.delete(target);
    }
  })();
  pending.set(target,job);
  return job;
}
