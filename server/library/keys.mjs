// API keys for the library connectors. They live only in the local backend:
// environment variables win, then config/library-keys.local.json (ignored by git).
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,atomic} from '../core.mjs';

export const KEY_FILE=path.join(ROOT,'config/library-keys.local.json');
export const KEY_ENV={pexels:'PEXELS_API_KEY',pixabay:'PIXABAY_API_KEY',freesound:'FREESOUND_API_KEY',giphy:'GIPHY_API_KEY',googlefonts:'GOOGLE_FONTS_API_KEY'};
const clean=value=>String(value??'').trim().replace(/^(['"])(.*)\1$/,'$2').trim();
export const validKeyName=name=>Object.hasOwn(KEY_ENV,name);
export const validKeyValue=value=>/^[\w.:=+\/-]{8,300}$/.test(value);

async function stored(file=KEY_FILE){try{const data=JSON.parse(await fs.readFile(file,'utf8'));return data&&typeof data==='object'?data:{};}catch{return {};}}
// Pexels was already configurable through .env.local; keep that working.
async function envLocal(name){
 try{const text=await fs.readFile(path.join(ROOT,'.env.local'),'utf8'),match=new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`,'m').exec(text);return clean(match?.[1]);}catch{return '';}
}
export async function getKeys({file=KEY_FILE,env=process.env}={}){
 const saved=await stored(file),keys={};
 for(const [name,variable] of Object.entries(KEY_ENV))keys[name]=clean(env[variable])||clean(saved[name])||(name==='pexels'?await envLocal('PEXELS_API_KEY'):'');
 return keys;
}
export async function configuredKeys(options){return Object.fromEntries(Object.entries(await getKeys(options)).map(([name,value])=>[name,!!value]));}
export async function setKey(name,value,{file=KEY_FILE}={}){
 if(!validKeyName(name))throw new Error('Este proveedor no usa clave de API');
 const saved=await stored(file),text=clean(value);
 if(!text){delete saved[name];await atomic(file,saved);return {configured:false};}
 if(!validKeyValue(text))throw new Error('La clave no es válida: usa de 8 a 300 caracteres sin espacios');
 await fs.mkdir(path.dirname(file),{recursive:true});await atomic(file,{...saved,[name]:text});return {configured:true};
}
