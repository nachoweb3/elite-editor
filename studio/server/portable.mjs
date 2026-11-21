import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ASSETS_FILE,CACHE_ROOT,INPUT_ROOT,load,save,changeAssets,json,projectDir,probe,readAssets,validateSettings,normalizeSourceParts} from './core.mjs';
import {zipDirectory,extractZip} from './zip.mjs';

const MAX_BYTES=1.5*1024**3;
const MAX_ENTRIES=500;
const MAX_MANIFEST_BYTES=12_000_000;
const VERSION=2;
const VIDEO_TYPES=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const AUDIO_TYPES=new Set(['.mp3','.wav','.m4a','.ogg','.aac','.flac','.opus']);
const slug=value=>String(value||'proyecto').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._ -]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'proyecto';
const assetIds=project=>new Set([project.settings?.musicId,...(project.audioTracks||[]).map(track=>track.assetId)].filter(Boolean));
const assetVisible=(asset,ownerId)=>!asset.ownerId||asset.ownerId===ownerId;

async function stage(prefix){
  await fs.mkdir(CACHE_ROOT,{recursive:true});
  return fs.mkdtemp(path.join(CACHE_ROOT,prefix));
}

async function regularFile(file){
  const stat=await fs.lstat(file).catch(()=>null);
  return stat?.isFile()&&stat.size>0?stat:null;
}

async function archiveFile(staging,relative,folder){
  if(typeof relative!=='string'||relative.includes('\\'))return null;
  const parts=relative.split('/');
  if(parts.length!==2||parts[0]!==folder||!parts[1]||/[<>:"|?*\x00-\x1F]/.test(parts[1])||/^\.\.?$/.test(parts[1]))return null;
  const dir=path.join(staging,folder);
  if(!(await fs.lstat(dir).catch(()=>null))?.isDirectory())return null;
  const file=path.join(dir,parts[1]);
  return await regularFile(file)?file:null;
}

async function manifest(staging,name,optional=false){
  const file=path.join(staging,name);
  const stat=await regularFile(file);
  if(!stat&&optional&&!(await fs.lstat(file).catch(()=>null)))return [];
  if(!stat||stat.size>MAX_MANIFEST_BYTES)throw new Error('El paquete no tiene un '+name+' válido.');
  return json(file).catch(()=>{throw new Error('El paquete no tiene un '+name+' válido.');});
}

// Files owned by the original machine are never carried as absolute paths.
function portableDirection(automatic){
  if(!automatic||typeof automatic!=='object')return undefined;
  const {direction,...state}=automatic;
  return {
    ...state,
    status:state.status==='working'?'review':state.status,
    ...(direction?{direction:{
      ...direction,
      media:Array.isArray(direction.media)?direction.media.filter(item=>item&&typeof item==='object').map(({file,...item})=>item):[],
    }}:{}),
  };
}

export async function packageProject(id){
  const p=await load(id);
  for(const sourceId of new Set(p.clips.map(clip=>clip.sourceId).filter(sourceId=>sourceId&&sourceId!==id))){
    // A duplicated project can point at another project backed by the same file.
    const reference=await load(sourceId).catch(()=>null);
    if(!p.source||!reference||reference.ownerId!==p.ownerId||reference.source!==p.source){
      throw new Error('Este montaje usa vídeos de otros proyectos. El paquete admite un solo vídeo original. Exporta un MP4 para llevarte el montaje completo.');
    }
  }
  const staging=await stage('package-');
  const target=path.join(CACHE_ROOT,'packages',randomUUID()+'.zip');
  let completed=false;
  try{
    let bytes=0;
    async function copy(file,relative,missingMessage){
      const stat=file?await regularFile(file):null;
      if(!stat)throw new Error(missingMessage);
      bytes+=stat.size;
      if(bytes>MAX_BYTES)throw new Error('El paquete supera 1,5 GB. Copia la carpeta del proyecto a mano.');
      const dest=path.join(staging,relative);
      await fs.mkdir(path.dirname(dest),{recursive:true});
      await fs.copyFile(file,dest);
    }
    const source=p.source?'media/'+path.basename(p.source):null;
    if(!p.blank||source)await copy(p.source,source,'El vídeo original no está disponible. No se puede crear el paquete.');
    const ids=assetIds(p);
    const assets=ids.size?await readAssets():[];
    const used=[];
    const names=new Set();
    for(const id of ids){
      const asset=assets.find(item=>item.id===id&&assetVisible(item,p.ownerId));
      if(!asset?.file||!AUDIO_TYPES.has(path.extname(asset.file).toLowerCase())||!Number.isFinite(asset.duration)||asset.duration<=0){
        throw new Error('Falta un audio del montaje. Vuelve a importarlo o quítalo antes de crear el paquete.');
      }
      const base=path.basename(asset.file);
      const name=names.has(base.toLowerCase())?randomUUID()+path.extname(base):base;
      names.add(name.toLowerCase());
      const file='assets/'+name;
      await copy(asset.file,file,'Falta el archivo de audio «'+(asset.name||base)+'».');
      used.push({id:asset.id,name:asset.name,kind:asset.kind,duration:asset.duration,license:asset.license||'',tags:asset.tags||[],file});
    }
    const {composition, enhancedSource, ...data}=p;
    const exported={
      ...data,
      packageVersion:VERSION,
      source,
      clips:p.clips.map(clip=>({...clip,sourceId:id})),
      automatic:portableDirection(p.automatic),
      artifacts:{},
      jobs:[],
      history:[],
      versions:[],
      shorts:undefined,
      trashedAt:null,
      ownerId:null,
      exportedAt:new Date().toISOString(),
      exportedWith:'NACHO WEB3 · Elite Editor',
    };
    const documents={
      'project.json':JSON.stringify(exported,null,2),
      'assets.json':JSON.stringify(used,null,2),
      'LEEME.txt':[
        'Paquete de proyecto de Elite Editor · NACHO WEB3',
        '',
        'Incluye el montaje (project.json), el vídeo original en media/ y el audio usado en assets/.',
        'Los renders, los shorts y el historial se pueden volver a generar en el equipo de destino.',
        '',
        'Para abrirlo: Estudio → Galería multimedia → Importar paquete (.zip).',
        ''
      ].join('\n'),
    };
    for(const [name,text] of Object.entries(documents)){
      const length=Buffer.byteLength(text);
      if(length>MAX_MANIFEST_BYTES)throw new Error('Los datos del proyecto son demasiado grandes para un paquete portable.');
      bytes+=length;
      if(bytes>MAX_BYTES)throw new Error('El paquete supera 1,5 GB. Copia la carpeta del proyecto a mano.');
      await fs.writeFile(path.join(staging,name),text,'utf8');
    }
    await zipDirectory(staging,target);
    completed=true;
    return {path:target,name:slug(p.name)+'.zip'};
  }finally{
    if(!completed)await fs.unlink(target).catch(()=>{});
    await fs.rm(staging,{recursive:true,force:true});
  }
}

export async function importPackage(zipPath,user){
  const staging=await stage('import-');
  const id=randomUUID();
  const dir=projectDir(id);
  const copied=[];
  let created=false,completed=false;
  try{
    await extractZip(zipPath,staging,{maxBytes:MAX_BYTES,maxEntries:MAX_ENTRIES});
    const raw=await manifest(staging,'project.json');
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.clips)||raw.clips.length>5000||
      raw.clips.some(clip=>!clip||!Number.isFinite(clip.start)||!Number.isFinite(clip.end)||clip.start<0||clip.end<=clip.start)){
      throw new Error('El paquete está dañado: el proyecto no tiene clips válidos.');
    }
    if(raw.packageVersion!==undefined&&raw.packageVersion!==VERSION){
      throw new Error('El paquete corresponde a una versión de Elite Editor no compatible.');
    }
    if(raw.audioTracks!==undefined&&(!Array.isArray(raw.audioTracks)||raw.audioTracks.length>64||raw.audioTracks.some(track=>!track||typeof track.assetId!=='string'))){
      throw new Error('El paquete tiene pistas de audio inválidas.');
    }
    const settings=validateSettings(raw.settings||{});
    const oldId=raw.id;
    const original=await archiveFile(staging,raw.source,'media');
    let source=null,media={duration:0,width:(settings.profile==='source'||settings.profile.startsWith('youtube'))?1920:1080,height:(settings.profile==='source'||settings.profile.startsWith('youtube'))?1080:1920,audio:false};
    const copies=[];
    if(original&&VIDEO_TYPES.has(path.extname(original).toLowerCase())){
      source=path.join(INPUT_ROOT,id+path.extname(original).toLowerCase());
      media=await probe(original).catch(()=>{throw new Error('El vídeo original del paquete está dañado o no se puede leer con FFmpeg.');});
      copies.push([original,source]);
    }else if(raw.blank!==true||raw.source){
      throw new Error('El paquete no incluye un vídeo original válido. Pide un paquete completo al equipo de origen.');
    }

    // Versiones anteriores podían referir fuentes del mismo estudio por ID.
    const legacySources=new Map();
    for(const sourceId of new Set(raw.clips.map(clip=>clip.sourceId).filter(sourceId=>sourceId&&sourceId!==oldId))){
      const legacy=typeof sourceId==='string'?await load(sourceId).catch(()=>null):null;
      if(!legacy||legacy.ownerId!==user.id||legacy.trashedAt||!legacy.source||!await regularFile(legacy.source)){
        throw new Error('Este paquete antiguo usa vídeos de otros proyectos. Ábrelo en el estudio de origen, con los vídeos aún en la galería.');
      }
      legacySources.set(sourceId,legacy);
    }
    if(!source&&raw.clips.some(clip=>!legacySources.has(clip.sourceId))){
      throw new Error('El paquete tiene clips que no incluyen un vídeo de origen.');
    }
    const mediaName=String(raw.name||'Vídeo importado');
    const clips=raw.clips.map((clip,index)=>{
      const legacy=legacySources.get(clip.sourceId);
      const duration=legacy?.media?.duration||media.duration;
      const start=Math.min(clip.start,duration),end=Math.min(clip.end,duration);
      if(end<=start)throw new Error('El clip '+(index+1)+' queda fuera del vídeo incluido en el paquete.');
      return {
        ...clip,
        sourceId:legacy?.id||id,
        sourceName:legacy?.name||mediaName,
        sourceDuration:duration,
        start,end,
        enabled:clip.enabled!==false,
        transitionIn:clip.transitionIn||'none',
        motion:clip.motion||'none',
      };
    });
    if(!clips.length&&source){
      clips.push({id:randomUUID(),sourceId:id,sourceName:mediaName,sourceDuration:media.duration,start:0,end:media.duration,enabled:true,transitionIn:'none',motion:'none',reason:'Importado desde un paquete'});
    }

    const assets=await manifest(staging,'assets.json',true);
    if(!Array.isArray(assets)||assets.some(asset=>!asset||typeof asset.id!=='string')){
      throw new Error('El paquete tiene un inventario de audio inválido.');
    }
    const byId=new Map(assets.map(asset=>[asset.id,asset]));
    if(raw.packageVersion===VERSION&&byId.size!==assets.length){
      throw new Error('El paquete tiene audios duplicados en el inventario.');
    }
    const tracks=raw.audioTracks||[];
    const entries=[];
    const remap=new Map();
    for(const oldAssetId of assetIds({settings,audioTracks:tracks})){
      const item=byId.get(oldAssetId);
      if(!item){
        // Los paquetes antiguos no incluían la música de fondo configurada.
        if(raw.packageVersion===undefined&&oldAssetId===settings.musicId&&!tracks.some(track=>track.assetId===oldAssetId))continue;
        throw new Error('Falta un audio en el paquete. Pide un paquete completo al equipo de origen.');
      }
      const file=await archiveFile(staging,item.file,'assets');
      const ext=file&&path.extname(file).toLowerCase();
      if(!file||!AUDIO_TYPES.has(ext)||!Number.isFinite(item.duration)||item.duration<=0){
        throw new Error('No se puede leer el audio «'+String(item.name||'Importado')+'» del paquete.');
      }
      const assetId=randomUUID();
      const destination=path.join(INPUT_ROOT,'assets',assetId+ext);
      entries.push({
        id:assetId,name:typeof item.name==='string'?item.name:'Audio importado',kind:item.kind==='music'?'music':'sound',
        duration:item.duration,license:typeof item.license==='string'&&item.license?item.license:'Incluido en el paquete',
        tags:Array.isArray(item.tags)?item.tags.filter(tag=>typeof tag==='string'):[],file:destination,ownerId:user.id,
      });
      remap.set(oldAssetId,assetId);
      copies.push([file,destination]);
    }
    if(settings.musicId){
      const local=remap.has(settings.musicId)?null:(await readAssets()).find(asset=>asset.id===settings.musicId&&assetVisible(asset,user.id));
      settings.musicId=remap.get(settings.musicId)||local?.id||null;
    }
    const {composition,enhancedSource,packageVersion,...data}=raw;
    const project={
      ...data,
      id,
      name:mediaName.replace(/\s*\(importado\)$/,'').slice(0,100)+' (importado)',
      ownerId:user.id,
      blank:raw.blank===true&&!source,
      source,media,settings,clips,
      sourceParts:normalizeSourceParts(raw.sourceParts,media.duration),
      transcript:Array.isArray(raw.transcript)?raw.transcript:[],
      automatic:portableDirection(raw.automatic),
      audioTracks:tracks.map(track=>({...track,assetId:remap.get(track.assetId)})),
      createdAt:new Date().toISOString(),
      revision:0,
      jobs:[],
      artifacts:{},
      history:[],
      versions:[],
      shorts:undefined,
      trashedAt:null,
      exportedAt:undefined,
      exportedWith:undefined,
    };
    for(const [from,to] of copies){
      await fs.mkdir(path.dirname(to),{recursive:true});
      copied.push(to);
      await fs.copyFile(from,to);
    }
    await fs.mkdir(path.dirname(dir),{recursive:true});
    await fs.mkdir(dir);
    created=true;
    const saved=await save(project);
    if(entries.length){
      await fs.mkdir(path.dirname(ASSETS_FILE),{recursive:true});
      await changeAssets(existing=>[...existing,...entries]);
    }
    completed=true;
    return {project:saved,audio:remap.size};
  }finally{
    if(!completed){
      await Promise.all(copied.map(file=>fs.unlink(file).catch(()=>{})));
      if(created){
        await fs.unlink(path.join(dir,'project.json')).catch(()=>{});
        await fs.rmdir(dir).catch(()=>{});
      }
    }
    await fs.rm(staging,{recursive:true,force:true});
  }
}
