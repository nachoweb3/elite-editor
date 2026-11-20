// Catalog reused from Open Generative AI (MIT); attribution in docs/GENERATIVE-AI.md.
import {t2iModels,t2vModels} from '../vendor/open-generative-ai/packages/studio/src/models.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,atomic} from './core.mjs';
import {assertQuota,recordUsage} from './usage.mjs';

const selected=['flux-schnell','wan2.2-text-to-video'];

// The catalog is the source of truth for what each route accepts. These are the
// verified, supported subsets we expose in the integrated studio.
const modelCapabilities={
  'flux-schnell':{
    ratios:['16:9','9:16','1:1','4:3','3:4'],
    defaultRatio:'16:9',
    imageSizes:{
      '16:9':[1024,576],
      '9:16':[576,1024],
      '1:1':[768,768],
      '4:3':[1024,768],
      '3:4':[768,1024],
    },
  },
  'wan2.2-text-to-video':{
    ratios:['16:9','9:16'],
    defaultRatio:'16:9',
    durations:[5,8],
    defaultDuration:5,
    resolutions:['480p','720p'],
    defaultResolution:'720p',
    qualities:['medium','high'],
    defaultQuality:'medium',
  },
};

export const generationModels=[...t2iModels.map(m=>({...m,kind:'image'})),...t2vModels.map(m=>({...m,kind:'video'}))]
  .filter(m=>selected.includes(m.id))
  .map(m=>({...m,capabilities:modelCapabilities[m.id]}));

const secretFile=path.join(ROOT,'config/muapi.local.json'),dir=path.join(ROOT,'projects/generations');
async function secret(){if(process.env.MUAPI_API_KEY)return process.env.MUAPI_API_KEY.trim();try{return JSON.parse(await fs.readFile(secretFile,'utf8')).key||'';}catch{return '';}}
function publicCapabilities(capabilities={}){
  const {ratios,durations,resolutions,qualities,defaultRatio,defaultDuration,defaultResolution,defaultQuality}=capabilities;
  return {ratios,durations,resolutions,qualities,defaultRatio,defaultDuration,defaultResolution,defaultQuality};
}
export async function generationSettings(key){
  if(key!==undefined){if(typeof key!=='string'||key.length<10||key.length>500||/\s/.test(key))throw Error('Clave MuAPI inválida');await atomic(secretFile,{key});}
  return {configured:!!await secret(),models:generationModels.map(({id,name,kind,capabilities})=>({id,name,kind,capabilities:publicCapabilities(capabilities)}))};
}
export function generationPayload(input){
  const model=generationModels.find(m=>m.id===input.model);
  if(!model)throw Error('Modelo no admitido');
  if(typeof input.prompt!=='string'||input.prompt.trim().length<2||input.prompt.length>3000)throw Error('Escribe una descripción de 2 a 3000 caracteres');
  const capabilities=model.capabilities;
  const ratio=input.ratio||capabilities.defaultRatio;
  if(!capabilities.ratios.includes(ratio))throw Error('Formato inválido para este modelo');
  const prompt=input.prompt.trim();

  if(model.kind==='image'){
    const size=capabilities.imageSizes?.[ratio];
    if(!size)throw Error('Formato no disponible para este modelo');
    return {model,payload:{prompt,width:size[0],height:size[1],num_images:1}};
  }

  const duration=input.duration??capabilities.defaultDuration;
  if(!capabilities.durations.includes(duration))throw Error('Duración inválida para este modelo');
  const resolution=input.resolution??capabilities.defaultResolution;
  if(!capabilities.resolutions.includes(resolution))throw Error('Resolución inválida para este modelo');
  const quality=input.quality??capabilities.defaultQuality;
  if(!capabilities.qualities.includes(quality))throw Error('Calidad inválida para este modelo');
  return {model,payload:{prompt,aspect_ratio:ratio,duration,resolution,quality}};
}
async function provider(endpoint,key,body){const response=await fetch('https://api.muapi.ai/api/v1/'+endpoint,{method:body?'POST':'GET',headers:{'x-api-key':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000),redirect:'error'});if(!response.ok)throw Error(response.status===401||response.status===403?'MuAPI no acepta la clave':`MuAPI respondió HTTP ${response.status}`);return response.json();}
function outputUrl(data){const raw=data.outputs?.[0]||data.url||data.output?.url;const value=typeof raw==='string'?raw:raw?.url;if(!value)return null;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
// A generation belongs to the account that submitted it. Jobs written before
// accounts existed have no owner and are only readable by the studio owner.
const readable=(job,user)=>!!job&&(job.ownerId?job.ownerId===user?.id:user?.role==='owner');
async function jobFile(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Trabajo inválido');return path.join(dir,id+'.json');}
async function readJob(id){try{return JSON.parse(await fs.readFile(await jobFile(id),'utf8'));}catch{throw Error('Trabajo no encontrado');}}
export async function generationFileUrl(id,user=null){const job=await readJob(id);if(!readable(job,user))throw Error('Trabajo no encontrado');if(!job.url)throw Error('El resultado todavía no está disponible');return job.url;}
export async function listGenerations(user=null){await fs.mkdir(dir,{recursive:true});const files=(await fs.readdir(dir)).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f));const jobs=(await Promise.all(files.map(f=>fs.readFile(path.join(dir,f),'utf8').then(JSON.parse).catch(()=>null)))).filter(job=>readable(job,user));return jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function submitGeneration(input,user=null){const {model,payload}=generationPayload(input),key=await secret();if(!key)throw Error('Configura tu clave MuAPI en Crear con IA');await assertQuota(user,'generations',1);const job={id:randomUUID(),ownerId:user?.id||null,model:model.id,kind:model.kind,prompt:payload.prompt,status:'submitting',createdAt:new Date().toISOString(),settings:model.kind==='video'?{duration:payload.duration,resolution:payload.resolution,quality:payload.quality,ratio:payload.aspect_ratio}:{ratio:input.ratio||model.capabilities.defaultRatio}};await fs.mkdir(dir,{recursive:true});const file=path.join(dir,job.id+'.json');await atomic(file,job);try{const result=await provider(model.endpoint||model.id,key,payload);job.requestId=result.request_id||result.id;job.url=outputUrl(result);job.status=job.url?'completed':job.requestId?'pending':'unknown';}catch(e){job.status='unknown';job.error=e.message+'. No repitas la solicitud sin revisar tu historial de MuAPI: podría haberse enviado.';}await recordUsage(user,'generations',1);await atomic(file,job);return job;}
export async function refreshGeneration(id,user=null){const file=await jobFile(id),job=await readJob(id);if(!readable(job,user))throw Error('Trabajo no encontrado');if(job.status!=='pending'||!job.requestId)return job;const result=await provider('predictions/'+encodeURIComponent(job.requestId)+'/result',await secret());const status=String(result.status||'').toLowerCase();if(['completed','succeeded','success'].includes(status)){job.url=outputUrl(result);job.status=job.url?'completed':'failed';if(!job.url)job.error='El proveedor no devolvió un archivo compatible';}else if(['failed','error','cancelled','canceled'].includes(status)){job.status='failed';job.error='La generación falló. Revisa el historial del proveedor.';}await atomic(file,job);return job;}
