import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,list,load,save,atomic,json,defaults,projectDir} from './core.mjs';
export async function newProject({name='Proyecto sin título',profile='youtube'}={}){
 if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('Escribe un nombre de hasta 120 caracteres');
 if(!['youtube','reels'].includes(profile))throw Error('Formato no válido');
 const id=randomUUID();await fs.mkdir(projectDir(id),{recursive:true});
 return save({id,name:name.trim(),blank:true,source:null,createdAt:new Date().toISOString(),media:{duration:0,width:profile==='youtube'?1920:1080,height:profile==='youtube'?1080:1920,audio:false},settings:{...defaults,profile,subtitlePosition:'top'},clips:[],audioTracks:[],transcript:[],analysis:null,reviewed:true,revision:0,artifacts:{},jobs:[]});
}
export async function gallery(){
 const [projects,assets]=await Promise.all([list(),json(path.join(ROOT,'config/assets.json'))]);
 return [...projects.map(p=>({id:p.id,type:'project',kind:p.blank?'project':'video',name:p.name,duration:p.blank?p.clips.reduce((n,c)=>n+c.end-c.start,0):p.media.duration,trashedAt:p.trashedAt||null,url:p.blank?null:`/api/projects/${p.id}/media`,uses:projects.filter(x=>x.id!==p.id&&x.clips.some(c=>c.sourceId===p.id)).length})),...assets.map(a=>({id:a.id,type:'asset',kind:a.kind,name:a.name,duration:a.duration||0,license:a.license,author:a.author,pack:a.pack,category:a.category||(a.pack==='kenney-music-jingles'?'Jingles':a.pack==='music-shadow'?'Ambiente':({click:'Clics',confirmation:'Confirmaciones',error:'Avisos',glitch:'Digital',question:'Preguntas',switch:'Cambios',pluck:'Acentos',bong:'Acentos'}[a.name?.split('_')[0]]|| (a.kind==='music'?'Musica':'Otros sonidos'))),trashedAt:a.trashedAt||null,url:`/api/asset?id=${a.id}`,image:/\.(png|jpe?g|webp)$/i.test(a.file),uses:projects.filter(p=>p.settings.musicId===a.id||p.audioTracks?.some(t=>t.assetId===a.id)).length}))];
}
let changeQueue=Promise.resolve();
export function changeGallery(body){const task=changeQueue.then(async()=>{
 if(!['trash','restore'].includes(body.action)||!['asset','project'].includes(body.type))throw Error('Acción no válida');
 const trashedAt=body.action==='trash'?new Date().toISOString():null;
 if(body.type==='project'){const p=await load(body.id);if(p.jobs.some(j=>['running','queued'].includes(j.status)))throw Error('Espera a que termine este proyecto');p.trashedAt=trashedAt;await save(p);}
 else {const file=path.join(ROOT,'config/assets.json'),assets=await json(file),a=assets.find(a=>a.id===body.id);if(!a)throw Error('Recurso no encontrado');a.trashedAt=trashedAt;await atomic(file,assets);}
 return {ok:true};
 });changeQueue=task.catch(()=>{});return task;}
