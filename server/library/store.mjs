// Local library index: one JSON index plus content-addressed files.
// Files live in library/files/<kind>/<aa>/<sha256>.<ext> (outside git); the index keeps
// provenance and licence for every item. Identical bytes are stored once (dedupe by hash)
// and every place an asset was found is remembered in `sources`.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,atomic} from '../core.mjs';
import {expandQuery,plainText} from './glossary.mjs';

export const LIBRARY_DIR=path.join(ROOT,'library');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
export const hashBuffer=sha256;

export class LibraryStore{
 constructor(dir=LIBRARY_DIR){this.dir=dir;this.items=new Map();this.byHash=new Map();this.bySource=new Map();this.loaded=null;this.queue=Promise.resolve();}
 get indexFile(){return path.join(this.dir,'index.json');}
 async load(){
  return this.loaded??=(async()=>{
   try{const data=JSON.parse(await fs.readFile(this.indexFile,'utf8'));for(const item of data.items||[])this.#put(item);}
   catch(e){if(e.code!=='ENOENT')throw new Error('library/index.json está dañado: '+e.message);}
  })();
 }
 #put(item){
  this.items.set(item.id,item);this.byHash.set(item.hash,item.id);
  for(const source of item.sources||[])if(source.sourceKey)this.bySource.set(source.sourceKey,item.id);
 }
 save(){
  this.queue=this.queue.then(async()=>{await fs.mkdir(this.dir,{recursive:true});await atomic(this.indexFile,{version:1,items:[...this.items.values()]});});
  return this.queue;
 }
 absolute(item){return item.external?path.join(ROOT,item.file):path.join(this.dir,item.file);}
 ownedBySource(sourceKey){return this.bySource.get(sourceKey)||null;}
 get(id){return this.items.get(id)||null;}

 /** Stores new bytes, or merges provenance when the same bytes are already here. */
 async add({buffer,ext,kind,title,category,tags=[],license,source,attribution='',width=0,height=0,duration=0,hasAlpha=false,generated=false,personal=false}){
  await this.load();
  const hash=sha256(buffer),existing=this.byHash.get(hash);
  if(existing){
   const item=this.items.get(existing);
   const known=(item.sources||[]).some(s=>s.sourceKey&&s.sourceKey===source?.sourceKey);
   if(source&&!known){item.sources=[...(item.sources||[]),source];if(source.sourceKey)this.bySource.set(source.sourceKey,item.id);await this.save();}
   return {item,duplicate:true};
  }
  const relative=path.posix.join('files',kind,hash.slice(0,2),`${hash}.${ext}`),absolute=path.join(this.dir,...relative.split('/'));
  await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,buffer);
  const item={id:'lib_'+hash.slice(0,16),hash,file:relative,external:false,ext,kind,category,title:String(title||'Sin título').slice(0,160),tags,size:buffer.length,width,height,duration,hasAlpha,
   license,attribution,sources:source?[source]:[],generated,personal,addedAt:new Date().toISOString()};
  this.#put(item);await this.save();return {item,duplicate:false};
 }

 /** Indexes a file that already ships with the project (not copied; referenced by path). */
 async addReference({file,hash,kind,ext,title,category,tags=[],license,source,attribution='',duration=0,size=0,generated=false}){
  await this.load();
  if(this.byHash.has(hash)){const item=this.items.get(this.byHash.get(hash));return {item,duplicate:true};}
  const item={id:'lib_'+hash.slice(0,16),hash,file,external:true,ext,kind,category,title,tags,size,width:0,height:0,duration,hasAlpha:false,license,attribution,sources:source?[source]:[],generated,personal:false,addedAt:new Date().toISOString()};
  this.#put(item);await this.save();return {item,duplicate:false};
 }

 async remove(id){
  await this.load();const item=this.items.get(id);if(!item)throw new Error('Recurso no encontrado');
  if(item.external)throw new Error('Los recursos incluidos con Elite Editor no se pueden eliminar desde la biblioteca');
  this.items.delete(id);this.byHash.delete(item.hash);
  for(const source of item.sources||[])if(this.bySource.get(source.sourceKey)===id)this.bySource.delete(source.sourceKey);
  await fs.unlink(this.absolute(item)).catch(()=>{});await this.save();return item;
 }

 /** Every word must match (in Spanish or English); title and tags weigh more than the rest. */
 search(query='',{kind,category,commercialOnly=false,generated,limit=60,offset=0}={}){
  const expanded=query.trim()?expandQuery(query):null;
  const scored=[];
  for(const item of this.items.values()){
   if(kind&&kind!=='all'&&item.kind!==kind)continue;
   if(category&&item.category!==category)continue;
   if(commercialOnly&&!item.license?.commercial)continue;
   if(generated!==undefined&&item.generated!==generated)continue;
   let score=1;
   if(expanded){
    const title=plainText(item.title),tags=plainText((item.tags||[]).join(' ')),rest=plainText(`${item.category} ${(item.sources||[]).map(s=>`${s.connector} ${s.author||''}`).join(' ')} ${item.license?.name||''}`);
    score=0;
    for(const group of expanded.groups){
     let best=0;for(const term of group){if(title.includes(term))best=Math.max(best,3);else if(tags.includes(term))best=Math.max(best,2);else if(rest.includes(term))best=Math.max(best,1);}
     if(!best){score=0;break;}score+=best;
    }
    if(!score)continue;
   }
   scored.push([score,item]);
  }
  scored.sort((a,b)=>b[0]-a[0]||String(b[1].addedAt).localeCompare(String(a[1].addedAt)));
  return {items:scored.slice(offset,offset+limit).map(([,item])=>item),total:scored.length};
 }

 stats(){
  const byKind={},byConnector={};let bytes=0,generated=0;
  for(const item of this.items.values()){
   byKind[item.kind]=(byKind[item.kind]||0)+1;bytes+=item.external?0:item.size;if(item.generated)generated++;
   const connector=item.sources?.[0]?.connector||'manual';byConnector[connector]=(byConnector[connector]||0)+1;
  }
  return {items:this.items.size,bytes,generated,byKind,byConnector};
 }

 /** Credit lines for every stored item that asks for attribution. */
 credits({all=false}={}){
  return [...this.items.values()].filter(i=>all||i.license?.attribution).sort((a,b)=>a.title.localeCompare(b.title)).map(i=>i.attribution||`«${i.title}» — ${i.license?.name||'licencia no verificada'}`);
 }
}

export const library=new LibraryStore();
