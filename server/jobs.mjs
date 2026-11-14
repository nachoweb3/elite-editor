import {prepareEnhancedSource} from './enhanced-source.mjs';
import {exportDiffusion} from './diffusion-bridge.mjs';
import {decorate} from './decorate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,list,load,save,jobContext,Cancelled} from './core.mjs';
import {analyze,render} from './engine.mjs';
import {exportToEditor} from './editor-bridge.mjs';
import {autopilot} from './autopilot.mjs';
import {planStickmen} from './stickman.mjs';
const pending=[];let active=false;
const controllers=new Map();
export const liveMessages=new Map();
export const liveProgress=new Map();
export const JOB_TYPES=['analyze','preview','render','editor','autopilot','diffusion','rerender','auto-review','prepare-source','stickman'];
export async function recover(){for(const p of await list()){let changed=false;for(const j of p.jobs){if(['queued','running'].includes(j.status)){j.status='interrupted';j.message='Proceso interrumpido por reinicio. Puedes volver a ejecutarlo.';changed=true;}}if(changed)await save(p);}}
export function busy(p){return p.jobs.some(j=>['queued','running'].includes(j.status));}
export async function enqueue(id,type){const p=await load(id);if(p.blank&&['analyze','autopilot','auto-review','prepare-source'].includes(type))throw new Error('El análisis automático requiere una grabación original; abre un vídeo desde la galería');if(!p.clips.length)throw new Error('Añade un vídeo al lienzo antes de procesar');if(busy(p))throw new Error('Este proyecto ya está en la cola');if(!JOB_TYPES.includes(type))throw new Error('Trabajo inválido');if(!['analyze','autopilot','auto-review','diffusion','rerender','prepare-source','stickman'].includes(type)&&!p.reviewed)throw new Error('Revisa y aprueba los cortes primero');const job={id:randomUUID(),type,status:'queued',message:'En cola',createdAt:new Date().toISOString()};p.jobs.push(job);p.jobs=p.jobs.slice(-50);await save(p);pending.push({id,jobId:job.id,type});void drain();return job;}

export async function cancel(id,jobId){
 const p=await load(id),job=p.jobs.find(j=>j.id===jobId);if(!job)throw new Error('Trabajo no encontrado');
 if(job.status==='queued'){
  const index=pending.findIndex(t=>t.jobId===jobId);if(index>=0)pending.splice(index,1);
  Object.assign(job,{status:'cancelled',message:'Cancelado antes de empezar',finishedAt:new Date().toISOString()});await save(p);return job;
 }
 if(job.status==='running'){const controller=controllers.get(jobId);if(!controller)throw new Error('Este trabajo está terminando; espera unos segundos');controller.abort();return {...job,status:'cancelling',message:'Cancelando…'};}
 throw new Error('El trabajo ya terminó');
}

// Progress is read from what the tools already print: fragment counters, transcription
// timestamps and FFmpeg "time=". Unknown stages report an indeterminate state (null).
const STATUS=/^(Detectando|Auto-Editor:|Transcripci|Transcrito |Analizando |Preparando |Retocando |Renderizando |Componiendo |La vista |Edici|Vídeo verificado|NVENC|Análisis terminado)/;
export function progressTracker(jobId,{source,montage,parts=[]}){
 let stage='',fraction=null,expected=source,part=null;
 const publish=()=>liveProgress.set(jobId,{stage,fraction:fraction===null?null:Math.round(Math.min(.995,Math.max(0,fraction))*1000)/1000});
 const raise=v=>{if(Number.isFinite(v)&&(fraction===null||v>fraction))fraction=v;};
 return line=>{
  const text=String(line),first=text.split('\n')[0];
  if(STATUS.test(first)){
   const name=first.replace(/\d+(?:[.,]\d+)?/g,'#');
   if(!/^Transcrito /.test(first)&&name!==stage){stage=name;fraction=null;part=null;expected=/^Componiendo/.test(first)?montage:source;}
   const counter=/fragmento (\d+)\/(\d+)/.exec(first);if(counter){part={index:Number(counter[1]),count:Number(counter[2])};raise((part.index-1)/part.count);}
   const said=/^Transcrito ([\d.]+)s/.exec(first);if(said&&source)raise(Number(said[1])/source);
  }
  const times=[...text.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  if(times){
   const t=Number(times[1])*3600+Number(times[2])*60+Number(times[3]);
   // Inside "fragmento i/n" FFmpeg counts from the start of that fragment.
   if(part){const length=parts.length===part.count?parts[part.index-1]:0;if(length)raise((part.index-1+Math.min(1,t/length))/part.count);}
   else if(expected)raise(t/expected);
  }
  publish();
 };
}

async function drain(){if(active)return;active=true;try{while(pending.length){const task=pending.shift(),log=fs.createWriteStream(path.join(ROOT,'logs',task.jobId+'.log'),{flags:'a'}),controller=new AbortController();controllers.set(task.jobId,controller);let latest='Iniciando',track=()=>{};
  const report=s=>{const line=String(s);log.write(line+'\n');track(line);if(STATUS.test(line)){latest=line.slice(-1000);liveMessages.set(task.jobId,latest);}};
      try{let p=await load(task.id);const job=p.jobs.find(j=>j.id===task.jobId);if(!job||job.status!=='queued')continue;
       const parts=p.clips.filter(c=>c.enabled).map(c=>c.end-c.start);
       track=progressTracker(task.jobId,{source:Number(p.media?.duration)||0,montage:parts.reduce((a,b)=>a+b,0),parts});
       Object.assign(job,{status:'running',startedAt:new Date().toISOString()});await save(p);
       await jobContext.run({signal:controller.signal,jobId:task.jobId},async()=>{
        if(task.type==='prepare-source')await prepareEnhancedSource(task.id,report);else if(task.type==='diffusion')await exportDiffusion(task.id,report);else if(task.type==='rerender'){await render(task.id,true,report,{automatic:true});await decorate(task.id,true,report);await render(task.id,false,report,{automatic:true});await decorate(task.id,false,report);}else if(task.type==='stickman')await planStickmen(task.id,report);else if(task.type==='auto-review')await autopilot(task.id,report,{reviewOnly:true});else if(task.type==='autopilot')await autopilot(task.id,report);else if(task.type==='analyze')await analyze(task.id,report);else if(task.type==='editor')await exportToEditor(task.id,report);else {await render(task.id,task.type==='preview',report);await decorate(task.id,task.type==='preview',report);}
        if(controller.signal.aborted)throw new Cancelled();
       });
       p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:'done',message:latest,finishedAt:new Date().toISOString()});await save(p);
      }catch(e){const cancelled=controller.signal.aborted||e instanceof Cancelled;report(cancelled?'Cancelado por el usuario':e.stack||e.message);const p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:cancelled?'cancelled':'failed',message:cancelled?'Cancelado por el usuario. Puedes volver a ejecutarlo.':e.message,finishedAt:new Date().toISOString()});await save(p);}finally{controllers.delete(task.jobId);liveMessages.delete(task.jobId);liveProgress.delete(task.jobId);log.end();}}
  }finally{active=false;}}
