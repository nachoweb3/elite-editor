import fs from 'node:fs/promises';
import path from 'node:path';
import {CACHE_ROOT,config,importVideo,run} from './core.mjs';
import {assertProjectQuota,assertQuota,limitMessage,planFor,recordUsage,storageFor} from './usage.mjs';
import {COMPOSITION_FPS} from '../shared/composition.mjs';

const VIDEO_EXTENSIONS=new Set(['.mp4','.mov','.mkv','.webm']);
const MANIFEST_LIMIT=16*1024;
const GIB=1024**3;

function parseManifest(encoded){
  let manifest;
  try{manifest=JSON.parse(encoded.toString('utf8'));}
  catch{throw new Error('No se pudieron leer las partes de la grabación. Vuelve a seleccionarlas.');}
  if(!Array.isArray(manifest?.parts)||manifest.parts.length<2||manifest.parts.length>12){
    throw new Error('Selecciona entre 2 y 12 partes.');
  }
  const parts=manifest.parts.map((part,index)=>{
    const extension=typeof part?.name==='string'?path.extname(part.name).toLowerCase():'';
    if(!VIDEO_EXTENSIONS.has(extension)||!Number.isSafeInteger(part?.size)||part.size<=0){
      throw new Error(`La parte ${index+1} debe ser un vídeo MP4, MOV, MKV o WebM con contenido.`);
    }
    return {name:part.name,file:`part-${index}${extension}`,size:part.size};
  });
  const total=parts.reduce((sum,part)=>sum+part.size,0);
  if(!Number.isSafeInteger(total))throw new Error('Las partes superan el tamaño máximo de subida.');
  const base=String(manifest.name||'Grabación unida')
    .trim().replace(/\.(mp4|mov|mkv|webm)$/i,'')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ')
    .trim().slice(0,100).toWellFormed();
  return {name:`${base||'Grabación unida'}.mp4`,parts,total};
}

async function receiveParts(request,directory,authorize,signal){
  let manifest=null;
  const header=[];
  let headerSize=0,index=0,left=0,handle=null;
  try{
    for await(let chunk of request.iterator({destroyOnReturn:false})){
      signal?.throwIfAborted();
      if(!manifest){
        const separator=chunk.indexOf(10);
        const prefix=separator===-1?chunk:chunk.subarray(0,separator);
        headerSize+=prefix.length;
        if(headerSize>MANIFEST_LIMIT)throw new Error('La lista de partes supera el tamaño permitido.');
        header.push(prefix);
        if(separator===-1)continue;
        manifest=parseManifest(Buffer.concat(header,headerSize));
        await authorize(manifest.total);
        chunk=chunk.subarray(separator+1);
      }
      while(chunk.length){
        const part=manifest.parts[index];
        if(!part)throw new Error('La subida contiene datos fuera de las partes declaradas.');
        if(!handle){
          handle=await fs.open(path.join(directory,part.file),'wx');
          left=part.size;
        }
        const length=Math.min(left,chunk.length);
        await handle.writeFile(chunk.subarray(0,length));
        chunk=chunk.subarray(length);
        left-=length;
        if(left===0){await handle.close();handle=null;index++;}
      }
    }
    if(!manifest||index!==manifest.parts.length)throw new Error('La subida de las partes quedó incompleta.');
    return manifest;
  }finally{
    if(handle)await handle.close();
  }
}

async function inspect(file,directory,signal){
  const {out}=await run('ffprobe',['-v','error','-show_format','-show_streams','-show_data_hash','sha256','-of','json',file],{cwd:directory,signal,timeout:30_000});
  const {streams,format}=JSON.parse(out);
  const video=streams.find(stream=>stream.codec_type==='video'&&!stream.disposition?.attached_pic);
  const audio=streams.find(stream=>stream.codec_type==='audio');
  const duration=Number(video?.duration)||Number(format?.duration);
  if(!video?.width||!video.height||!Number.isFinite(duration)||duration<=0)throw new Error('No contiene una pista de vídeo válida.');
  const rotation=Number(video.side_data_list?.find(item=>'rotation' in item)?.rotation??0);
  const containerDuration=Number(format?.duration);
  return {video,audio,duration,concatDuration:Number.isFinite(containerDuration)&&containerDuration>0?containerDuration:duration,rotation,tracks:streams.length};
}

const streamKeys=['codec_name','codec_tag_string','profile','level','width','height','pix_fmt','field_order',
  'sample_aspect_ratio','r_frame_rate','avg_frame_rate','time_base','sample_fmt','sample_rate','channels',
  'channel_layout','color_range','color_space','color_transfer','color_primaries','extradata_hash'];
function signature(stream){
  return stream?JSON.stringify(streamKeys.map(key=>stream[key])):'';
}

function canCopy(parts){
  const first=parts[0];
  const videoSignature=signature(first.video),audioSignature=signature(first.audio);
  return parts.every(part=>part.video.codec_name==='h264'&&part.video.pix_fmt==='yuv420p'
    &&part.video.extradata_hash&&part.rotation===0
    &&(!part.audio||part.audio.codec_name==='aac'&&part.audio.extradata_hash)
    &&part.tracks===(part.audio?2:1)
    &&signature(part.video)===videoSignature&&signature(part.audio)===audioSignature);
}

async function concat(files,durations,output,directory,signal){
  await fs.writeFile(path.join(directory,'parts.txt'),files.map((file,index)=>`file '${file}'\nduration ${durations[index].toFixed(6)}`).join('\n'));
  await run('ffmpeg',['-v','error','-nostdin','-y','-f','concat','-safe','1','-i','parts.txt',
    '-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',output],{cwd:directory,signal});
}

function canvas(first){
  const rotated=Math.abs(first.rotation%180)===90;
  const [width,height]=rotated?[first.video.height,first.video.width]:[first.video.width,first.video.height];
  const scale=Math.min(1,3840/Math.max(width,height),Math.sqrt(3840*2160/(width*height)));
  const even=value=>Math.max(2,Math.floor(value*scale/2)*2);
  return [even(width),even(height)];
}

async function normalizeParts(files,parts,directory,signal){
  const [width,height]=canvas(parts[0]);
  const withAudio=parts.some(part=>part.audio);
  const normalized=[];
  for(const [index,part] of parts.entries()){
    signal?.throwIfAborted();
    const output=`normalized-${index}.mp4`;
    const args=['-v','error','-nostdin','-y','-i',files[index]];
    if(withAudio&&!part.audio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
    args.push('-map',`0:${part.video.index}`);
    if(withAudio)args.push('-map',part.audio?`0:${part.audio.index}`:'1:a:0',
      '-af','aresample=48000,apad','-c:a','aac','-b:a','192k','-ac','2');
    const fit=`scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    args.push('-vf',`fps=${COMPOSITION_FPS},${fit},setsar=1,format=yuv420p`,'-t',String(part.duration),
      '-c:v','libx264','-preset','fast','-crf','20',output);
    try{await run('ffmpeg',args,{cwd:directory,signal});}
    catch(error){
      signal?.throwIfAborted();
      throw new Error(`No se pudo preparar la parte ${index+1}. Comprueba que el archivo se reproduce completo.`,{cause:error});
    }
    normalized.push(output);
  }
  return normalized;
}

async function mergeParts(files,directory,signal){
  const parts=[];
  for(const [index,file] of files.entries()){
    try{parts.push(await inspect(file,directory,signal));}
    catch(error){
      signal?.throwIfAborted();
      throw new Error(`No se pudo leer el vídeo de la parte ${index+1}.`,{cause:error});
    }
  }
  const expected=parts.reduce((sum,part)=>sum+part.duration,0);
  const tolerance=Math.max(.2,parts.length*.08);
  const output='joined.mp4';
  if(canCopy(parts)){
    try{
      const durations=parts.map(part=>part.concatDuration);
      await concat(files,durations,output,directory,signal);
      if(Math.abs((await inspect(output,directory,signal)).duration-expected)<=tolerance)return {output,durations};
    }catch{
      signal?.throwIfAborted();
    }
  }
  const normalized=await normalizeParts(files,parts,directory,signal);
  const durations=[];
  for(const file of normalized)durations.push((await inspect(file,directory,signal)).concatDuration);
  await concat(normalized,durations,output,directory,signal);
  const joined=await inspect(output,directory,signal);
  if(Math.abs(joined.duration-expected)>tolerance)throw new Error('La duración final no coincide con la suma de las partes.');
  return {output,durations};
}

async function assertStorage(user,total){
  const limit=planFor(user).limits.storageGB;
  if(limit===Infinity||await storageFor(user.id)+total/GIB<=limit)return;
  const error=new Error(await limitMessage(user,'storageGB'));
  error.status=429;
  throw error;
}

export async function importRecordingParts(request,user,{signal}={}){
  await assertProjectQuota(user);
  const maxBytes=Number((await config()).maxUploadGB)*GIB;
  if(Number(request.headers['content-length'])>maxBytes+MANIFEST_LIMIT+1){
    throw new Error('Las partes superan el tamaño máximo de subida.');
  }
  await fs.mkdir(CACHE_ROOT,{recursive:true});
  const directory=await fs.mkdtemp(path.join(CACHE_ROOT,'join-parts-'));
  try{
    const {name,parts,total}=await receiveParts(request,directory,async bytes=>{
      if(bytes>maxBytes)throw new Error('Las partes superan el tamaño máximo de subida.');
      await assertQuota(user,'uploadGB',bytes/GIB);
      await assertStorage(user,bytes);
    },signal);
    const merged=await mergeParts(parts.map(part=>part.file),directory,signal);
    const output=path.join(directory,merged.output);
    const stat=await fs.stat(output);
    signal?.throwIfAborted();
    await assertProjectQuota(user);
    await assertStorage(user,stat.size);
    await assertQuota(user,'uploadGB',total/GIB);
    signal?.throwIfAborted();
    await recordUsage(user,'uploadGB',total/GIB);
    let offset=0;
    const sourceParts=parts.map((part,index)=>{
      const start=offset;
      offset+=Number(merged.durations[index].toFixed(6));
      return {name:part.name,start,end:offset};
    });
    return await importVideo(output,name,user.id,sourceParts);
  }finally{
    await fs.rm(directory,{recursive:true,force:true,maxRetries:3});
  }
}
