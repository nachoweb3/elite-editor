import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './core.mjs';

async function key(){
  if(process.env.PEXELS_API_KEY)return process.env.PEXELS_API_KEY.trim();
  try{const text=await fs.readFile(path.join(ROOT,'.env.local'),'utf8');const match=text.match(/^\s*PEXELS_API_KEY\s*=\s*(.*?)\s*$/m);return (match?.[1]||'').replace(/^(['"])(.*)\1$/,'$2').trim();}catch{return '';}
}
export async function pexelsStatus(){return {configured:!!await key()};}
export async function searchPexels(query,{kind='video',orientation='landscape',limit=5}={}){
  const secret=await key();if(!secret)throw new Error('Falta configurar la clave de Pexels en .env.local');
  if(typeof query!=='string'||!query.trim()||query.length>160)throw new Error('Búsqueda de Pexels inválida');
  const url=new URL(kind==='photo'?'https://api.pexels.com/v1/search':'https://api.pexels.com/v1/videos/search');
  url.search=new URLSearchParams({query:query.trim(),orientation:orientation==='portrait'?'portrait':'landscape',per_page:String(Math.max(1,Math.min(10,limit)))}).toString();
  let response;try{response=await fetch(url,{headers:{Authorization:secret},signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new Error('No se pudo conectar con Pexels. Comprueba tu conexión.');}
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Pexels no acepta la clave configurada.':response.status===429?'Se ha alcanzado el límite de consultas de Pexels.':`Pexels respondió con HTTP ${response.status}.`);
  const data=await response.json();
  return {provider:'Pexels',providerUrl:'https://www.pexels.com',items:kind==='photo'?(data.photos||[]).map(p=>({id:p.id,kind:'photo',page:p.url,author:p.photographer,authorUrl:p.photographer_url,description:p.alt||'',preview:p.src.medium,download:p.src.large2x,width:p.width,height:p.height})):(data.videos||[]).map(v=>{
    const files=(v.video_files||[]).filter(f=>f.file_type==='video/mp4'&&f.width<=1920).sort((a,b)=>b.width-a.width);
    return {id:v.id,kind:'video',page:v.url,author:v.user?.name||'Pexels',authorUrl:v.user?.url||'https://www.pexels.com',description:v.url.split('/').filter(Boolean).at(-1)?.replace(/-/g,' ')||'',preview:v.image,download:files[0]?.link,width:v.width,height:v.height,duration:v.duration};
  }).filter(v=>v.download)};
}
