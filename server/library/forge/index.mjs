// ASSET FORGE orchestrator: runs the pack generators (each writes original, CC0 files to
// library/forge/<pack>) and indexes the results in the library with their provenance.
// Pack modules are loaded lazily so a missing or broken one never takes the server down.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ingest} from '../ingest.mjs';

export const PACK_IDS=['sounds','luts','visuals','svg','creators'];
export const PACK_INFO={
 sounds:{title:'Sonidos y música originales',description:'Efectos, ambientes y bases musicales sintetizados con FFmpeg.'},
 luts:{title:'Looks de color (LUT)',description:'Looks .cube aplicables al render del motor.'},
 visuals:{title:'Fondos y overlays',description:'Fondos, viñetas, marcos, grano y luces generados por código.'},
 svg:{title:'Stickers SVG',description:'Flechas, marcas, bocadillos e insignias vectoriales.'},
 creators:{title:'Pack para creadores',description:'Pantallas finales, zonas seguras, tercios inferiores y marcos de miniatura.'},
};
let running=null;

async function loadPack(id){
 if(!PACK_IDS.includes(id))throw Object.assign(new Error('Pack desconocido'),{status:400});
 try{return await import(`./${id}.mjs`);}catch{return null;}
}
const countFor=(store,id)=>{let n=0;for(const item of store.items.values())if(item.sources?.some(s=>s.sourceKey?.startsWith(`forge:${id}:`)))n++;return n;};

export async function forgeStatus({store}){
 await store.load();
 const packs=[];
 for(const id of PACK_IDS){
  const mod=await loadPack(id),count=countFor(store,id);
  packs.push({id,title:mod?.PACK?.title||PACK_INFO[id].title,description:mod?.PACK?.description||PACK_INFO[id].description,count,generated:count>0,available:!!mod});
 }
 return {packs,running:running||null};
}

export async function runForge(id,{store,force=false,log=()=>{},dir}={}){
 if(running)throw Object.assign(new Error(`Ya se está generando el pack «${running}»; espera a que termine`),{status:409});
 const mod=await loadPack(id);
 if(!mod?.generate)throw Object.assign(new Error('Este pack todavía no está disponible'),{status:501});
 running=id;
 try{
  await store.load();
  const out=dir||path.join(store.dir,'forge',id);
  await fs.mkdir(out,{recursive:true});
  const result=await mod.generate({dir:out,force,log});
  const failed=[...(result.failed||[])];let ingested=0,duplicates=0;
  for(const item of result.items||[]){
   try{
    const buffer=await fs.readFile(item.file);
    const {duplicate}=await ingest(buffer,{title:item.title,tags:item.tags,category:item.category,hint:item.description,connector:'forge',connectorName:'ASSET FORGE',sourceKey:`forge:${id}:${item.id}`,
     author:'Elite Editor',licenseId:'CC0-1.0',generated:true},{store});
    duplicate?duplicates++:ingested++;
   }catch(e){failed.push({id:item.id,error:String(e.message||e).slice(0,200)});}
  }
  // Sound packs also register in the editor's sound registry so they appear in the Sonidos tab.
  if(typeof mod.registerSounds==='function'){try{await mod.registerSounds(result.items||[]);}catch(e){failed.push({id:'registro-sonidos',error:String(e.message||e)});}}
  return {made:result.made||0,total:result.total||0,ingested,duplicates,failed};
 }finally{running=null;}
}
