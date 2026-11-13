import {prepareEnhancedSource} from './enhanced-source.mjs';
import {exportDiffusion} from './diffusion-bridge.mjs';
import {decorate} from './decorate.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,list,load,save} from './core.mjs';
import {analyze,render} from './engine.mjs';
import {exportToEditor} from './editor-bridge.mjs';
import {autopilot} from './autopilot.mjs';
import {planStickmen} from './stickman.mjs';
const pending=[];let active=false;
export const liveMessages=new Map();
export async function recover(){for(const p of await list()){let changed=false;for(const j of p.jobs){if(['queued','running'].includes(j.status)){j.status='interrupted';j.message='Proceso interrumpido por reinicio. Puedes volver a ejecutarlo.';changed=true;}}if(changed)await save(p);}}
export function busy(p){return p.jobs.some(j=>['queued','running'].includes(j.status));}
export async function enqueue(id,type){const p=await load(id);if(p.blank&&['analyze','autopilot','auto-review','prepare-source'].includes(type))throw new Error('El análisis automático requiere una grabación original; abre un vídeo desde la galería');if(!p.clips.length)throw new Error('Añade un vídeo al lienzo antes de procesar');if(busy(p))throw new Error('Este proyecto ya está en la cola');if(!['analyze','preview','render','editor','autopilot','diffusion','rerender','auto-review','prepare-source','stickman'].includes(type))throw new Error('Trabajo inválido');if(!['analyze','autopilot','auto-review','diffusion','rerender','prepare-source','stickman'].includes(type)&&!p.reviewed)throw new Error('Revisa y aprueba los cortes primero');const job={id:randomUUID(),type,status:'queued',message:'En cola',createdAt:new Date().toISOString()};p.jobs.push(job);p.jobs=p.jobs.slice(-50);await save(p);pending.push({id,jobId:job.id,type});void drain();return job;}
async function drain(){if(active)return;active=true;try{while(pending.length){const task=pending.shift(),log=fs.createWriteStream(path.join(ROOT,'logs',task.jobId+'.log'),{flags:'a'});let latest='Iniciando';const report=s=>{const line=String(s);log.write(line+'\n');if(/^(Detectando|Auto-Editor:|Transcripci|Transcrito |Analizando |Preparando |Retocando |Renderizando |Componiendo |La vista |Edici|Vídeo verificado|NVENC|Análisis terminado)/.test(line)){latest=line.slice(-1000);liveMessages.set(task.jobId,latest);}};
      try{let p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:'running',startedAt:new Date().toISOString()});await save(p);if(task.type==='prepare-source')await prepareEnhancedSource(task.id,report);else if(task.type==='diffusion')await exportDiffusion(task.id,report);else if(task.type==='rerender'){await render(task.id,true,report,{automatic:true});await decorate(task.id,true,report);await render(task.id,false,report,{automatic:true});await decorate(task.id,false,report);}else if(task.type==='stickman')await planStickmen(task.id,report);else if(task.type==='auto-review')await autopilot(task.id,report,{reviewOnly:true});else if(task.type==='autopilot')await autopilot(task.id,report);else if(task.type==='analyze')await analyze(task.id,report);else if(task.type==='editor')await exportToEditor(task.id,report);else {await render(task.id,task.type==='preview',report);await decorate(task.id,task.type==='preview',report);}p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:'done',message:latest,finishedAt:new Date().toISOString()});await save(p);
      }catch(e){report(e.stack||e.message);const p=await load(task.id);Object.assign(p.jobs.find(j=>j.id===task.jobId),{status:'failed',message:e.message,finishedAt:new Date().toISOString()});await save(p);}finally{liveMessages.delete(task.jobId);log.end();}}
  }finally{active=false;}}
