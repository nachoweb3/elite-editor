import {prepareEnhancedSource} from './enhanced-source.mjs';
import {exportDiffusion} from './diffusion-bridge.mjs';
import {decorate} from './decorate.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,list,load,save} from './core.mjs';
import {analyze} from './engine.mjs';
import {render} from './render-pipeline.mjs';
import {exportToEditor} from './editor-bridge.mjs';
import {autopilot} from './autopilot.mjs';
import {automationOptions} from './automation-options.mjs';
import {planStickmen} from './stickman.mjs';
import {renderShorts} from './shorts.mjs';
import {assertQuota,recordUsage} from './usage.mjs';
const pending=[];let active=false,current=null;const controllers=new Map();
const RENDER_JOBS=new Set(['preview','render','rerender','autopilot','auto-review','shorts']);
// One account cannot fill the shared queue: two active jobs are enough to work
// and the rest wait for a slot instead of starving other users.
const MAX_ACTIVE_JOBS=Number(process.env.STUDIO_MAX_ACTIVE_JOBS||2);
export const liveMessages=new Map();
export async function recover(){for(const p of await list()){let changed=false;for(const j of p.jobs){if(['queued','running'].includes(j.status)){j.status='interrupted';j.message='Proceso interrumpido por reinicio. Puedes volver a ejecutarlo.';changed=true;}}if(p.automatic?.status==='working'&&!busy(p)){p.automatic.status='failed';p.automatic.error='Proceso interrumpido por reinicio.';p.automatic.finishedAt=new Date().toISOString();changed=true;}if(p.shorts&&['queued','rendering'].includes(p.shorts.status)){p.shorts.status='interrupted';p.shorts.error='Proceso interrumpido por reinicio. Vuelve a generar los shorts.';changed=true;}if(changed)await save(p);}}
export function busy(p){return p.jobs.some(j=>['queued','running'].includes(j.status));}
// Position 1 is the job already running. The queue is intentionally serial in
// this studio, so a queued job knows exactly how many tasks are ahead of it.
export function queuePositions(){
 const positions=new Map();
 pending.forEach((task,index)=>positions.set(task.jobId,index+(current?2:1)));
 return positions;
}
export function queueStats(){
 return {running:current?{jobId:current.jobId,projectId:current.id,type:current.type}:null,pending:pending.length};
}
export function queueSnapshot(user=null){
 const positions=queuePositions();
 const tasks=user?pending.filter(task=>task.user?.id===user.id):pending.slice();
 return tasks.map(task=>({jobId:task.jobId,projectId:task.id,type:task.type,position:positions.get(task.jobId)||0}));
}
// Active jobs and minutes already promised to the queue. The reservation is
// what stops a plan from being overshot by enqueueing several renders while the
// first one has not consumed its minutes yet.
async function pendingState(user){
 if(!user)return {active:0,reserved:0};
 const projects=(await list()).filter(p=>p.ownerId===user.id);
 const jobs=projects.flatMap(p=>p.jobs||[]).filter(j=>['queued','running'].includes(j.status));
 return {active:jobs.length,reserved:jobs.reduce((sum,j)=>sum+(Number(j.minutes)||0),0)};
}
export async function cancelJob(id,jobId){
 const p=await load(id);const job=jobId?p.jobs.find(j=>j.id===jobId):p.jobs.slice().reverse().find(j=>['queued','running'].includes(j.status));if(!job)throw new Error('No hay un trabajo activo que cancelar');
 if(job.status==='queued'){const index=pending.findIndex(task=>task.jobId===job.id);if(index>=0)pending.splice(index,1);job.status='cancelled';job.message='Trabajo cancelado antes de empezar.';job.finishedAt=new Date().toISOString();await save(p);return p;}
 const controller=controllers.get(job.id);if(!controller)throw new Error('El trabajo ya no se puede cancelar');job.message='Cancelando y conservando fragmentos completados…';await save(p);controller.abort();return p;
}
export async function enqueue(id,type,options={},user=null){
  const p=await load(id);
  const automatic=type==='auto-review'||type==='autopilot';
  if(automatic)options=automationOptions(options);
  if(type==='render'&&options?.preflightRevision!==undefined&&options.preflightRevision!==p.revision){
    const error=new Error('El montaje cambió después de la comprobación. Vuelve a comprobarlo antes de exportar.');
    error.status=409;
    throw error;
  }
  const approveOnExport=type==='render'&&options?.approveAfterPreflight===true&&options.preflightRevision===p.revision;
  if(p.blank&&['analyze','autopilot','auto-review','prepare-source'].includes(type))throw new Error('El análisis automático requiere una grabación original; abre un vídeo desde la galería');
  if(!p.clips.length)throw new Error('Añade un vídeo al lienzo antes de procesar');
  if(busy(p))throw new Error('Este proyecto ya está en la cola');
  const pendingJobs=await pendingState(user);
  if(user&&pendingJobs.active>=MAX_ACTIVE_JOBS){const error=new Error(`Ya tienes ${MAX_ACTIVE_JOBS} trabajos en cola. Espera a que termine uno antes de enviar otro.`);error.status=429;throw error;}
  if(!['analyze','preview','render','editor','autopilot','diffusion','rerender','auto-review','prepare-source','stickman','shorts'].includes(type))throw new Error('Trabajo inválido');
  if(!['analyze','autopilot','auto-review','diffusion','rerender','prepare-source','stickman','shorts'].includes(type)&&!p.reviewed&&!approveOnExport)throw new Error('Revisa y aprueba los cortes primero');
  const measured=p.clips.filter(c=>c.enabled).reduce((sum,c)=>sum+Math.max(0,c.end-c.start),0)||Number(p.media.duration)||0;
  const minutes=type==='shorts'?Math.max(.5,measured/60*.5):Math.max(.1,measured/60);
  if(RENDER_JOBS.has(type))await assertQuota(user,'renderMinutes',minutes+pendingJobs.reserved);
  if(options&&typeof options==='object'){
    if(typeof options.subtitles==='boolean')p.settings.subtitles=options.subtitles;
    if(typeof options.subtitlePosition==='string'&&['top','bottom'].includes(options.subtitlePosition))p.settings.subtitlePosition=options.subtitlePosition;
    if(typeof options.subtitle==='string')p.settings.subtitle=options.subtitle;
    if(typeof options.memes==='boolean')p.settings.autoMemes=options.memes;
    if(typeof options.music==='boolean'&&!options.music)p.settings.musicId=null;
    if(typeof options.beauty==='boolean')p.settings.beautyAuto=options.beauty;
  }
  const job={id:randomUUID(),type,status:'queued',message:'En cola',createdAt:new Date().toISOString(),...(RENDER_JOBS.has(type)?{minutes}:{}),...(automatic?{options}:{})};
  if(approveOnExport)p.reviewed=true;
  p.jobs.push(job);p.jobs=p.jobs.slice(-50);await save(p);
  pending.push({id,jobId:job.id,type,options,user,minutes});void drain();return job;
}
async function drain(){
 if(active)return;active=true;
 try{
  while(pending.length){
   const task=pending.shift();current=task;
   const log=fs.createWriteStream(path.join(ROOT,'logs',task.jobId+'.log'),{flags:'a'});let latest='Iniciando';
   const report=s=>{const line=String(s);log.write(line+'\n');if(/^(\[cmd\]|\[agente\]|\[cache\]|Meme en |Meme omitido|Detectando|Auto-Editor:|Transcripci|Transcrito |Analizando |Preparando |Retocando |Renderizando |Componiendo |La vista |Edici|Vídeo verificado|NVENC|Análisis terminado)/.test(line)){latest=line.slice(-1000);liveMessages.set(task.jobId,latest);}};
   const controller=new AbortController();controllers.set(task.jobId,controller);const signal=controller.signal;
   try{
    let p=await load(task.id);const pendingJob=p.jobs.find(j=>j.id===task.jobId);if(!pendingJob||['cancelled','interrupted'].includes(pendingJob.status)){report('Trabajo cancelado antes de empezar');continue;}Object.assign(pendingJob,{status:'running',startedAt:new Date().toISOString()});await save(p);report(`[agente] Tarea ${task.type} iniciada`);
    if(task.type==='prepare-source')await prepareEnhancedSource(task.id,report);
    else if(task.type==='shorts')await renderShorts(task.id,report,{signal});
    else if(task.type==='diffusion')await exportDiffusion(task.id,report);
    else if(task.type==='rerender'){await render(task.id,true,report,{automatic:true,signal});await decorate(task.id,true,report,{signal});await render(task.id,false,report,{automatic:true,signal});await decorate(task.id,false,report,{signal});}
    else if(task.type==='stickman')await planStickmen(task.id,report);
    else if(task.type==='auto-review')await autopilot(task.id,report,{reviewOnly:true,signal,options:task.options});
    else if(task.type==='autopilot')await autopilot(task.id,report,{signal,options:task.options});
    else if(task.type==='analyze')await analyze(task.id,report);
    else if(task.type==='editor')await exportToEditor(task.id,report);
    else {await render(task.id,task.type==='preview',report,{signal});await decorate(task.id,task.type==='preview',report,{signal});}
    if(signal.aborted)throw new Error('Trabajo cancelado');
    p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:'done',message:latest,finishedAt:new Date().toISOString()});await save(p);
    if(RENDER_JOBS.has(task.type))await recordUsage(task.user,'renderMinutes',task.minutes);
   }catch(e){
    report(e.stack||e.message);const p=await load(task.id),cancelled=signal.aborted;
    if(cancelled&&p.automatic?.status==='working'){p.automatic.status='review';p.automatic.error='';p.automatic.finishedAt=new Date().toISOString();}
    else if(p.automatic?.status==='working'){p.automatic.status='failed';p.automatic.error=e.message;p.automatic.finishedAt=new Date().toISOString();}
    Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:cancelled?'cancelled':'failed',message:cancelled?'Trabajo cancelado. Los fragmentos completados quedan en caché para reanudar.':e.message,finishedAt:new Date().toISOString()});await save(p);
   }finally{controllers.delete(task.jobId);liveMessages.delete(task.jobId);log.end();current=null;}
  }
 }finally{active=false;}
}
