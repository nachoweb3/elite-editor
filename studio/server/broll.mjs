import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ROOT,probe,run} from './core.mjs';
import {sourceToOutput} from './director.mjs';
import {searchPexels} from './pexels.mjs';

const MAX_BYTES=24*1024*1024;
const visualSubjects=[
  [/\b(bitcoin|blockchain|cadena de bloques)\b/i,'bitcoin cryptocurrency network'],
  [/\b(solana|ethereum|cripto|criptomoneda|criptomonedas|web3|memecoin[s]?)\b/i,'cryptocurrency digital tokens'],
  [/\b(trading|cotizacion|velas japonesas|mercado financiero|bolsa de valores)\b/i,'stock market candlestick chart'],
  [/\b(centro de datos|servidores|servidor informatico)\b/i,'data center server racks'],
  [/\b(inteligencia artificial|modelo de lenguaje|red neuronal|robotica)\b/i,'artificial intelligence data center'],
  [/\b(subagentes|agentes de ia|programacion|codex|claude|chatgpt|codigo fuente)\b/i,'software developer coding'],
  [/\b(editor de video|editores de video|edicion de video|editar videos|linea de tiempo|timeline|montaje de video)\b/i,'video editing studio'],
  [/\b(subtitulos|transcribir|transcripcion|audio de la grabacion)\b/i,'microphone recording studio'],
  [/\b(ciberseguridad|phishing|gestor de contrasenas|autenticacion)\b/i,'computer cybersecurity lock'],
  [/\b(videojuegos|mando|consola de videojuegos)\b/i,'video game controller'],
  [/\b(aeropuerto|avion|vuelo comercial)\b/i,'airplane airport runway'],
  [/\b(oceano|playa|olas del mar)\b/i,'ocean waves coastline'],
  [/\b(montana|cordillera|senderismo)\b/i,'mountain hiking landscape'],
  [/\b(bosque|arboles|selva)\b/i,'forest trees landscape'],
  [/\b(trafico urbano|rascacielos|horizonte de la ciudad)\b/i,'city skyline urban traffic'],
  [/\b(horno|cocinar|receta|ingredientes)\b/i,'food cooking kitchen ingredients'],
  [/\b(gimnasio|mancuernas|entrenamiento de fuerza)\b/i,'gym strength training dumbbells'],
  [/\b(estudio de grabacion|microfono|podcast)\b/i,'podcast microphone studio'],
];
const normalized=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const stockHosts=new Set(['videos.pexels.com','images.pexels.com','video-files.pexels.com']);

export function brollCandidates(project,stockRequests=[]){
  const clips=project.clips||[];
  const duration=clips.reduce((sum,clip)=>sum+(clip.enabled?clip.end-clip.start:0),0);
  const matching=[];
  const add=(at,query,reason)=>{
    if(typeof query!=='string'||!query.trim()||query.length>100)return;
    const outputTime=sourceToOutput(at,clips);
    if(outputTime===null||outputTime<1.5||outputTime>duration-3)return;
    const isScreen=project.analysis?.scenes?.some(scene=>/screen|tutorial|slides|pantalla/i.test(scene.type)&&scene.start<=at&&scene.end>=at);
    if(!isScreen)matching.push({query:query.trim(),outputTime,reason});
  };
  for(const event of stockRequests)add(event.at,event.query,event.reason);
  for(const segment of project.transcript||[]){
    const subject=visualSubjects.find(([pattern])=>pattern.test(normalized(segment.text)));
    if(subject)add((segment.start+segment.end)/2,subject[1],'Apoyo visual relacionado con el tema de este tramo.');
  }
  const chosen=[];
  for(const item of matching.sort((a,b)=>a.outputTime-b.outputTime)){
    if(chosen.some(other=>other.query===item.query||Math.abs(other.outputTime-item.outputTime)<13))continue;
    chosen.push(item);
    if(chosen.length>=4)break;
  }
  return chosen;
}

async function cacheStock(item,signal){
  const url=new URL(item.download);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!stockHosts.has(url.hostname))return null;
  const isVideo=item.kind==='video';
  const dir=path.join(ROOT,'input','assets');
  await fsp.mkdir(dir,{recursive:true});
  const file=path.join(dir,`pexels-${Number(item.id)}-${randomUUID()}.${isVideo?'mp4':'jpg'}`);
  const deadline=AbortSignal.timeout(18000);
  const downloadSignal=signal?AbortSignal.any([signal,deadline]):deadline;
  const response=await fetch(url,{signal:downloadSignal,redirect:'error'});
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>MAX_BYTES){
    await response.body?.cancel();
    return null;
  }
  let bytes=0;
  const limit=new Transform({transform(chunk,_encoding,callback){
    bytes+=chunk.length;
    if(bytes>MAX_BYTES)callback(new Error('El recurso supera el tamaño permitido.'));
    else callback(null,chunk);
  }});
  try{
    await pipeline(Readable.fromWeb(response.body),limit,fs.createWriteStream(file,{flags:'wx'}),{signal:downloadSignal});
    if(isVideo){
      const info=await probe(file);
      if(info.duration<1.5)throw new Error('El recurso de vídeo es demasiado corto.');
      return {file,duration:Math.min(3.2,info.duration)};
    }
    const {out}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',file],{timeout:5000,signal});
    if(!/^\d+,\d+/.test(out.trim()))throw new Error('El recurso no contiene imagen.');
    return {file,duration:3.2};
  }catch(error){
    await fsp.unlink(file).catch(()=>{});
    throw error;
  }
}

export async function planBroll(project,stockRequests,report,{signal}={}){
  const candidates=brollCandidates(project,stockRequests);
  const orientation=project.settings.profile.startsWith('youtube')?'landscape':'portrait';
  const media=[],used=new Set();
  for(const candidate of candidates){
    signal?.throwIfAborted();
    report(`Analizando vídeo de apoyo de Pexels (${media.length+1}/${candidates.length})`);
    for(const kind of ['video','photo']){
      try{
        const {items}=await searchPexels(candidate.query,{kind,orientation,limit:3,maxEdge:1280,signal});
        const selection=items.find(item=>item.download&&!used.has(item.id)&&(kind==='photo'||item.duration>=2));
        if(!selection)continue;
        const cached=await cacheStock(selection,signal);
        if(!cached)continue;
        used.add(selection.id);
        media.push({...candidate,...cached,kind:'pexels',type:'pexels',name:selection.description||'Apoyo visual de Pexels',description:selection.description,
          provider:'Pexels',license:'Licencia de Pexels',licenseUrl:'https://www.pexels.com/license/',
          author:selection.author,page:selection.page,greenScreen:false,useAudio:false,status:'accepted',
          attribution:`${selection.author} · Pexels · ${selection.page}`});
        break;
      }catch(error){
        signal?.throwIfAborted();
        project.analysis.warnings.push(`Pexels: ${error.message}`);
        if(/no acepta la clave|límite de consultas|Falta configurar/.test(error.message))return media;
      }
    }
  }
  return media;
}
