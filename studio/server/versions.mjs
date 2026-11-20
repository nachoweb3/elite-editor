import {randomUUID} from 'node:crypto';
import {load,save} from './core.mjs';

const LIMIT=12;
const summary=project=>{
  const clips=project.clips.filter(clip=>clip.enabled!==false);
  return {
    clips:clips.length,
    audioTracks:(project.audioTracks||[]).length,
    duration:Math.round(clips.reduce((total,clip)=>total+clip.end-clip.start,0)*10)/10,
  };
};
const snapshot=p=>({clips:p.clips,audioTracks:p.audioTracks||[],settings:p.settings,transcript:p.transcript,automatic:p.automatic??null});
const addVersion=(p,label,rescue=false)=>{
  p.versions=[...(p.versions||[]),{...snapshot(p),id:randomUUID(),label,createdAt:new Date().toISOString(),revision:p.revision,...(rescue?{rescue}:{})}].slice(-LIMIT);
};
const writes=new Map();
function writeVersion(id,update){
  const task=(writes.get(id)||Promise.resolve()).then(async()=>{
    const project=await load(id);
    update(project);
    return save(project);
  });
  const tail=task.catch(()=>{});
  writes.set(id,tail);
  return task.finally(()=>{if(writes.get(id)===tail)writes.delete(id);});
}
function checkRevision(p,revision){
  if(revision===undefined||revision===p.revision)return;
  const error=new Error('El montaje cambió en otra pestaña. Vuelve a abrir Versiones para ver la revisión actual.');
  error.status=409;
  throw error;
}

function describeVersions(p){
  return {
    current:{revision:p.revision,updatedAt:p.updatedAt||null,...summary(p)},
    versions:(p.versions||[]).slice().reverse().map(v=>({
      id:v.id,
      label:v.label,
      createdAt:v.createdAt,
      revision:v.revision,
      rescue:v.rescue===true,
      ...summary(v),
    })),
  };
}

export async function listVersions(id){return describeVersions(await load(id));}

export async function createVersion(id,{label,revision}={}){
  const clean=String(label||'').trim().slice(0,80)||`Versión ${new Date().toLocaleString('es-ES')}`;
  const saved=await writeVersion(id,project=>{
    checkRevision(project,revision);
    addVersion(project,clean);
  });
  return describeVersions(saved);
}

export async function restoreVersion(id,{versionId,revision}={}){
  return writeVersion(id,p=>{
    checkRevision(p,revision);
    const version=(p.versions||[]).find(v=>v.id===versionId);
    if(!version)throw new Error('Esa versión ya no existe. Recarga la lista.');
    p.history=[...(p.history||[]),{...snapshot(p),manual:p.manual===true}].slice(-20);
    addVersion(p,`Antes de restaurar «${version.label}»`.slice(0,80),true);
    p.clips=version.clips;
    p.audioTracks=version.audioTracks||[];
    p.settings=version.settings;
    if(version.transcript)p.transcript=version.transcript;
    if('automatic' in version)p.automatic=version.automatic;
    p.revision++;
    p.artifacts={};
    p.manual=true;
    p.reviewed=true;
  });
}
