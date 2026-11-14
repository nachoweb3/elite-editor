// Everything that enters the library goes through ingest(): the bytes decide the type,
// unsafe SVG is refused, media is probed, files are classified and the licence and
// provenance are recorded. Identical bytes are stored once (dedupe by SHA-256).
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,run,readAssets} from '../core.mjs';
import {fetchBytes,assertPublicHttps} from './net.mjs';
import {sniff,checkSvg,classify} from './classify.mjs';
import {readZip,extractEntry} from './zip.mjs';
import {LICENSES,licenseRecord,attributionLine} from './licenses.mjs';
import {getResult} from './search.mjs';
import {connectorById} from './connectors/index.mjs';
import {hashBuffer} from './store.mjs';

const MB=1024*1024;
export const KIND_LIMITS={image:60*MB,audio:100*MB,video:500*MB,font:12*MB,lut:8*MB,lottie:8*MB};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const ALPHA=/^(rgba|bgra|argb|abgr|yuva|ya8|ya16|gbrap|gbrapf|rgba64|bgra64)/;

/** Reads dimensions, duration and alpha with ffprobe; a probe failure never blocks storage. */
export async function probeBuffer(buffer,ext,tempDir=path.join(ROOT,'cache')){
 await fs.mkdir(tempDir,{recursive:true});
 const file=path.join(tempDir,`probe-${randomUUID()}.${ext}`);
 try{
  await fs.writeFile(file,buffer);
  const info=JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{signal:null,timeout:30000})).out);
  const video=(info.streams||[]).find(s=>s.codec_type==='video');
  const duration=Number(info.format?.duration);
  return {width:Number(video?.width)||0,height:Number(video?.height)||0,duration:Number.isFinite(duration)&&duration>0?duration:0,hasAlpha:ALPHA.test(video?.pix_fmt||'')};
 }catch{return {width:0,height:0,duration:0,hasAlpha:false};}
 finally{await fs.unlink(file).catch(()=>{});}
}
function svgSize(buffer){
 const text=buffer.toString('utf8',0,2000),box=/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
 return box?{width:Math.round(Number(box[1])),height:Math.round(Number(box[2]))}:{width:0,height:0};
}

/** meta: {title,author,authorUrl,connector,connectorName,sourceKey,sourceUrl,downloadUrl,query,tags,licenseId,licenseNote,kind,category,hint,generated,personal} */
export async function ingest(buffer,meta={},{store,expect}={}){
 const sniffed=sniff(buffer);
 if(!sniffed||sniffed.kind==='archive')throw fail('Formato de archivo no reconocido o no admitido');
 if(expect?.length&&!expect.includes(sniffed.kind))throw fail('El archivo recibido no es del tipo esperado');
 if(buffer.length>(KIND_LIMITS[sniffed.kind]||50*MB))throw fail('El archivo supera el tamaño máximo permitido para su tipo');
 if(sniffed.ext==='svg')checkSvg(buffer);
 const kind=meta.kind==='texture'&&sniffed.kind==='image'?'texture':sniffed.kind;
 const probe=['image','video','audio','texture'].includes(kind)?(sniffed.ext==='svg'?{...svgSize(buffer),duration:0,hasAlpha:true}:await probeBuffer(buffer,sniffed.ext)):{width:0,height:0,duration:0,hasAlpha:false};
 const classified=classify({kind:kind==='texture'?'texture':sniffed.kind,ext:sniffed.ext,title:meta.title||'',tags:meta.tags||[],hint:meta.hint||'',width:probe.width,height:probe.height,duration:probe.duration,alpha:probe.hasAlpha});
 const license=licenseRecord(meta.licenseId||'Unknown',meta.licenseNote?{notes:meta.licenseNote}:{});
 const title=String(meta.title||'Sin título').replace(/\s+/g,' ').trim().slice(0,160)||'Sin título';
 const attribution=attributionLine({title,author:meta.author,license,connectorName:meta.connectorName,sourceUrl:meta.sourceUrl});
 const source={connector:meta.connector||'manual',connectorName:meta.connectorName||'',sourceKey:meta.sourceKey||'',sourceUrl:meta.sourceUrl||'',downloadUrl:meta.downloadUrl||'',author:meta.author||'',authorUrl:meta.authorUrl||'',query:meta.query||'',fetchedAt:new Date().toISOString()};
 return store.add({buffer,ext:sniffed.ext,kind,title,category:meta.category||classified.category,tags:classified.tags,license,source,attribution,width:probe.width,height:probe.height,duration:probe.duration,hasAlpha:probe.hasAlpha,generated:!!meta.generated,personal:!!meta.personal});
}

/** Downloads a search result the user picked. Only results the backend itself returned can be fetched. */
export async function downloadResult(key,{ack=false,query=''}={},{store,fetcher=fetchBytes,deps,lookup=getResult,connectors=connectorById}={}){
 const item=lookup(String(key));
 if(!item)throw fail('El resultado ha caducado: repite la búsqueda',410);
 const connector=connectors(item.connector);
 if(!connector)throw fail('Proveedor desconocido');
 if(item.canDownload===false||!item._download)throw fail('Este recurso no se puede descargar automáticamente: ábrelo en su sitio e impórtalo');
 if(connector.requiresAck&&!ack)throw fail(connector.requiresAck,428);
 const owned=store.ownedBySource(item.key);
 if(owned&&store.get(owned))return {item:store.get(owned),duplicate:true};
 let plan=item._download;
 if(connector.resolveDownload)plan=await connector.resolveDownload(item,deps);
 const {buffer:raw}=await fetcher(plan.url,{maxBytes:plan.maxBytes,accept:plan.accept,host:plan.host});
 let buffer=raw;
 if(plan.extract){
  const entries=readZip(raw),entry=plan.extract(entries);
  if(!entry)throw fail('El archivo comprimido no contiene la imagen esperada');
  buffer=extractEntry(raw,entry);
 }
 return ingest(buffer,{title:item.title,author:item.author,authorUrl:item.authorUrl,connector:item.connector,connectorName:connector.name,sourceKey:item.key,sourceUrl:item.sourceUrl,downloadUrl:plan.url,query,
  tags:item.tags,licenseId:item.license?.id,licenseNote:item.license?.notes,kind:item.kind},{store,expect:expectFor(item.kind)});
}
const expectFor=kind=>kind==='image'||kind==='texture'?['image']:kind==='video'?['video']:kind==='audio'?['audio']:kind==='font'?['font']:undefined;

/** A file the user brought: licence is mandatory and recorded as given. */
export async function importFile(buffer,{name='archivo',licenseId,author='',source='',title='',tags=[],connector='manual'}={},{store}={}){
 if(!licenseId||!Object.hasOwn(LICENSES,licenseId))throw fail('Elige la licencia del archivo (si no la conoces, «Licencia no verificada»)');
 if(source){try{await assertPublicHttps(source);}catch{throw fail('La URL de origen debe ser una dirección https pública');}}
 const base=String(name).replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').trim();
 const info=connectorById(connector);
 return ingest(buffer,{title:title||base,author,connector:info?info.id:'manual',connectorName:info?.name||'Importación manual',sourceKey:'',sourceUrl:source,licenseId,tags,personal:licenseId==='Personal'},{store});
}
/** Imports a direct file link (e.g. a generation you made elsewhere). Public https only, size capped. */
export async function importFromUrl({url,licenseId,author='',title='',tags=[],connector='manual'},{store,fetcher=fetchBytes}={}){
 if(!licenseId||!Object.hasOwn(LICENSES,licenseId))throw fail('Elige la licencia del archivo');
 await assertPublicHttps(url).catch(e=>{throw fail(e.message);});
 const {buffer}=await fetcher(url,{maxBytes:KIND_LIMITS.video});
 const base=decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1)||'archivo').replace(/\.[a-z0-9]+$/i,'');
 return ingest(buffer,{title:title||base,author,connector,sourceKey:'',sourceUrl:'',downloadUrl:url,licenseId,tags,personal:licenseId==='Personal'},{store});
}

/** Indexes files that ship with Elite (Kenney sounds, Elite SFX…) without copying them. */
export async function syncBundled({store,assets}={}){
 await store.load();
 const list=assets??await readAssets();let added=0;
 for(const asset of list){
  if(asset.trashedAt||!asset.file)continue;
  const sourceKey='bundled:'+asset.id;
  if(store.ownedBySource(sourceKey))continue;
  let buffer;try{buffer=await fs.readFile(asset.file);}catch{continue;}
  const relative=path.relative(ROOT,asset.file).split(path.sep).join('/');
  if(relative.startsWith('..')||path.isAbsolute(relative))continue;
  const sniffed=sniff(buffer);if(!sniffed)continue;
  const pack=String(asset.pack||''),connector=pack.startsWith('kenney')?'kenney':pack==='elite-sfx'?'forge':'bundled';
  const license=licenseRecord(Object.hasOwn(LICENSES,asset.license)?asset.license:'Unknown');
  const title=String(asset.name||'Sin título').replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ');
  const tags=[pack,asset.category,asset.kind==='music'?'music':'sound'].filter(Boolean);
  const classified=classify({kind:sniffed.kind,ext:sniffed.ext,title,tags,duration:Number(asset.duration)||0});
  const source={connector,connectorName:connector==='kenney'?'Kenney':connector==='forge'?'ASSET FORGE':'Incluido',sourceKey,sourceUrl:asset.source||'',downloadUrl:'',author:asset.author||'',authorUrl:'',query:'',fetchedAt:new Date().toISOString()};
  const {duplicate}=await store.addReference({file:relative,hash:hashBuffer(buffer),kind:sniffed.kind,ext:sniffed.ext,title,category:asset.category||classified.category,tags:classified.tags,license,source,
   attribution:attributionLine({title,author:asset.author,license,connectorName:source.connectorName,sourceUrl:asset.source}),duration:Number(asset.duration)||0,size:buffer.length,generated:connector==='forge'});
  if(!duplicate)added++;
 }
 return {added,total:list.length};
}

/** Proxy for remote preview images: public https only, images only, small. Keeps the user's IP off provider CDNs. */
const thumbCache=new Map();
export async function fetchThumb(url,{fetcher=fetchBytes}={}){
 const hit=thumbCache.get(url);if(hit)return hit;
 const {buffer,type}=await fetcher(url,{maxBytes:4*MB,accept:/^image\/(png|jpe?g|webp|gif|avif)/,timeout:15000});
 const sniffed=sniff(buffer);
 if(!sniffed||sniffed.kind!=='image'||sniffed.ext==='svg')throw fail('La miniatura no es una imagen válida');
 const value={buffer,type:sniffed.mime||type};
 thumbCache.set(url,value);if(thumbCache.size>300)thumbCache.delete(thumbCache.keys().next().value);
 return value;
}
