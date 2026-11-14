// HTTP surface of the media library, mounted by server/index.mjs under /api/library/.
// Mutating routes are already protected by the session token check in index.mjs.
import path from 'node:path';
import fs from 'node:fs/promises';
import {library,LIBRARY_DIR} from './store.mjs';
import {describeConnectors,connectorById} from './connectors/index.mjs';
import {getKeys,configuredKeys,setKey,validKeyName} from './keys.mjs';
import {unifiedSearch,publicLocal} from './search.mjs';
import {downloadResult,importFile,importFromUrl,syncBundled,fetchThumb} from './ingest.mjs';
import {forgeStatus,runForge,PACK_IDS} from './forge/index.mjs';

const IMPORT_LIMIT=200*1024*1024;
let bundled=null;
const ensureBundled=()=>bundled??=syncBundled({store:library}).catch(()=>({added:0,total:0}));
const flag=value=>value==='1'||value==='true';

async function rawBody(req,limit=IMPORT_LIMIT){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Archivo demasiado grande'),{status:413});chunks.push(chunk);}
 return Buffer.concat(chunks);
}

/** Returns true when the request was handled. `ctx` = {req,res,u,method,body,send,sendText,file}. */
export async function libraryRoute(ctx){
 const {req,res,u,method,body,send,sendText,file}=ctx;
 if(!u.pathname.startsWith('/api/library/'))return false;
 const route=u.pathname.slice('/api/library/'.length),q=u.searchParams;
 try{
  await library.load();await ensureBundled();
  if(route==='status'&&method==='GET'){
   const [configured,forge]=await Promise.all([configuredKeys(),forgeStatus({store:library})]);
   send(res,{connectors:describeConnectors({configured}),stats:library.stats(),forge:{packs:forge.packs}});return true;
  }
  if(route==='search'&&method==='GET'){
   const result=await unifiedSearch({q:q.get('q')||'',kind:q.get('kind')||'all',scope:q.get('scope')||'all',connectorIds:(q.get('connectors')||'').split(',').filter(Boolean),page:Math.max(1,Number(q.get('page'))||1),
    commercialOnly:flag(q.get('commercial')),category:q.get('category')||undefined},{store:library});
   send(res,result);return true;
  }
  if(route==='thumb'&&method==='GET'){
   const {buffer,type}=await fetchThumb(q.get('url')||'');
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});res.end(buffer);return true;
  }
  if(route.startsWith('file/')&&['GET','HEAD'].includes(method)){
   const item=library.get(route.slice(5));if(!item){send(res,{error:'Recurso no encontrado'},404);return true;}
   res.setHeader('Content-Security-Policy','sandbox');res.setHeader('X-Content-Type-Options','nosniff');
   await file(req,res,library.absolute(item),q.get('download')==='1');return true;
  }
  if(route==='download'&&method==='POST'){const b=await body(req);send(res,await downloadResult(b.key,{ack:b.ack===true,query:String(b.query||'').slice(0,200)},{store:library}));return true;}
  if(route==='import'&&method==='POST'){
   const buffer=await rawBody(req);
   send(res,await importFile(buffer,{name:path.basename(q.get('name')||'archivo'),licenseId:q.get('license')||'',author:(q.get('author')||'').slice(0,160),source:q.get('source')||'',title:(q.get('title')||'').slice(0,160),
    tags:(q.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,24),connector:q.get('connector')||'manual'},{store:library}),201);return true;
  }
  if(route==='import-url'&&method==='POST'){
   const b=await body(req);
   send(res,await importFromUrl({url:b.url,licenseId:b.license,author:String(b.author||'').slice(0,160),title:String(b.title||'').slice(0,160),tags:Array.isArray(b.tags)?b.tags.map(String).slice(0,24):[],connector:connectorById(b.connector)?b.connector:'manual'},{store:library}),201);return true;
  }
  if(route==='keys'&&method==='POST'){
   const b=await body(req);if(!validKeyName(b.connector))throw new Error('Este proveedor no usa clave de API');
   send(res,await setKey(b.connector,b.key));return true;
  }
  if(route==='remove'&&method==='POST'){await library.remove((await body(req)).id);send(res,{ok:true});return true;}
  if(route==='forge'&&method==='GET'){send(res,await forgeStatus({store:library}));return true;}
  if(route==='forge'&&method==='POST'){
   const b=await body(req);if(!PACK_IDS.includes(b.pack))throw new Error('Pack desconocido');
   send(res,await runForge(b.pack,{store:library,force:b.force===true}));return true;
  }
  if(route==='luts'&&method==='GET'){
   const mod=await import('./forge/luts.mjs').catch(()=>null);
   send(res,{luts:mod?(await mod.listLuts()).map(l=>({stem:l.stem,title:l.title,description:l.description,preview:`/api/library/lut-preview/${l.stem}`})):[]});return true;
  }
  if(route.startsWith('lut-preview/')&&['GET','HEAD'].includes(method)){
   const stem=route.slice('lut-preview/'.length);
   if(!/^[a-z0-9-]{2,40}$/.test(stem)){send(res,{error:'Look no válido'},404);return true;}
   const target=path.join(LIBRARY_DIR,'forge','luts',stem+'.jpg');
   if(!await fs.stat(target).then(s=>s.isFile(),()=>false)){send(res,{error:'Vista previa no disponible'},404);return true;}
   await file(req,res,target);return true;
  }
  if(route==='credits'&&method==='GET'){
   const lines=library.credits({all:flag(q.get('all'))}),text=lines.length?lines.join('\n')+'\n':'Aún no hay recursos que exijan atribución.\n';
   sendText(res,text,'creditos-elite-editor.txt','text/plain; charset=utf-8');return true;
  }
  send(res,{error:'Ruta no encontrada'},404);return true;
 }catch(e){
  if(res.headersSent){res.destroy();return true;}
  send(res,{error:e.message},e.status||400);return true;
 }
}
