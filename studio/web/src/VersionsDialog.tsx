import {useEffect,useState} from 'react';
import {DialogHeader,Modal} from './Modal';
import {clock} from './timeline';
import type {Project} from './types';

type MontageSummary={clips:number;audioTracks:number;duration:number};
type Version=MontageSummary&{id:string;label:string;createdAt:string;revision:number;rescue?:boolean};
type Versions={current:MontageSummary&{revision:number;updatedAt:string|null};versions:Version[]};
const date=(value:string)=>new Date(value).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const summary=({duration,clips,audioTracks}:MontageSummary)=>
  `${clock(duration)} · ${clips} ${clips===1?'clip':'clips'} · ${audioTracks} ${audioTracks===1?'pista de audio':'pistas de audio'}`;

export function VersionsDialog({api,projectId,beforeWrite,onClose,onRestored}:{
  api:<T>(route:string,data?:unknown)=>Promise<T>;
  projectId:string;
  beforeWrite:()=>Promise<number>;
  onClose:()=>void;
  onRestored:(project:Project)=>void;
}){
  const [data,setData]=useState<Versions|null>(null),[label,setLabel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmId,setConfirmId]=useState('');
  const [retry,setRetry]=useState(0),[status,setStatus]=useState('');
  const route=`/projects/${projectId}/versions`;
  useEffect(()=>{
    let active=true;
    api<Versions>(route)
      .then(value=>{if(active)setData(value);})
      .catch(e=>{if(active)setError((e as Error).message);});
    return()=>{active=false;};
  },[api,route,retry]);
  async function run(action:(revision:number)=>Promise<void>){
    setBusy(true);
    setError('');
    setStatus('');
    try{await action(await beforeWrite());}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  const save=()=>run(async revision=>{
    const next=await api<Versions>(route,{label:label.trim()||undefined,revision});
    setData(next);
    setLabel('');
    setStatus(`Versión «${next.versions[0]?.label||'Sin nombre'}» guardada.`);
  });
  const restore=(version:Version)=>run(async revision=>{
    const result=await api<{restored:Project;versions:Versions}>(route,{versionId:version.id,revision});
    setData(result.versions);
    setConfirmId('');
    onRestored(result.restored);
  });
  const close=()=>{if(!busy)onClose();};
  return <Modal titleId="versions-title" onClose={close} wide busy={busy}>
    <DialogHeader titleId="versions-title" kicker="VERSIONES" title="Volver a un punto anterior" onClose={close}
      description="Una versión guarda cortes, audio, transcripción y ajustes. Se conservan las 12 últimas."/>
    <form className="versions-new" onSubmit={e=>{e.preventDefault();if(!busy&&data)void save();}}>
      <label htmlFor="version-label">Nombre de esta versión</label>
      <input id="version-label" value={label} disabled={busy} maxLength={80} placeholder="Antes de quitar la introducción" onChange={e=>setLabel(e.target.value)}/>
      <button type="submit" disabled={busy||!data}>Guardar versión</button>
    </form>
    {error?<p role="alert">{error}</p>:null}
    {status?<p role="status">{status}</p>:null}
    {data?<p><b>Último montaje guardado</b> · {summary(data.current)}</p>:null}
    {!data?error?<button type="button" onClick={()=>{setError('');setRetry(value=>value+1);}}>Reintentar</button>:<p role="status">Cargando versiones…</p>:<ul className="versions-list">
      {!data.versions.length?<li className="versions-empty">Todavía no has guardado versiones. El autoguardado conserva tu trabajo, pero una versión con nombre es un punto al que volver.</li>:null}
      {data.versions.map(version=><li key={version.id}>
        <div>
          <b>{version.label}</b>
          <span>{date(version.createdAt)} · {summary(version)}{version.rescue?' · Copia automática':''}</span>
        </div>
        {confirmId===version.id
          ?<span className="versions-confirm"><button type="button" disabled={busy} onClick={()=>void restore(version)}>Sí, restaurar</button><button type="button" disabled={busy} onClick={()=>setConfirmId('')}>Cancelar</button></span>
          :<button type="button" disabled={busy} onClick={()=>setConfirmId(version.id)}>Restaurar</button>}
      </li>)}
    </ul>}
    <p className="versions-note">Al restaurar, se guarda una copia automática del montaje actual en esta lista.</p>
  </Modal>;
}
