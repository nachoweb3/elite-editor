import {useEffect,useState} from 'react';
import {DialogHeader,Modal} from './Modal';
import {clock} from './timeline';
import type {Settings} from './types';

type Check={level:'ok'|'warn'|'error';label:string;detail:string};
type ExportSettings=Pick<Settings,'encoder'|'profile'|'frameRate'|'exportQuality'>;
export type Preflight={
  ok:boolean;revision:number;width:number;height:number;fps:number;duration:number;
  encoder:'CPU'|'NVENC'|null;sizeRangeMB:[number,number]|null;measuredSizeMB:number|null;
  freeGB:number|null;timeRangeSeconds:[number,number]|null;checks:Check[];
  reducesQuality?:boolean;
  resumable:boolean;lastJob:{id:string;status:string;message:string}|null;name:string;
};

const LEVEL:Record<Check['level'],string>={ok:'✓',warn:'!',error:'✕'};
const plural=(count:number,singular:string,plural:string)=>`${count} ${count===1?singular:plural}`;
const decimal=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
function measuredSize(mb:number){
  if(mb<.001)return `${decimal.format(mb*1e6)} B`;
  if(mb<1)return `${decimal.format(mb*1e3)} kB`;
  return `${decimal.format(mb)} MB`;
}
const seconds=(value:number)=>value<60?`${value} s`:`${clock(value)} min`;
const JOB_STATUS:Record<string,string>={failed:'fallido',interrupted:'interrumpido',cancelled:'cancelado'};

export function ExportDialog({api,project,busy,onClose,onExport,onSettingsChange}:{
  api:<T>(route:string,data?:unknown)=>Promise<T>;
  project:{id:string;revision:number;settings:ExportSettings};
  busy:boolean;
  onClose:()=>void;
  onExport:(revision:number)=>Promise<void>;
  onSettingsChange:(change:Partial<ExportSettings>)=>Promise<void>;
}){
  const [attempt,setAttempt]=useState(0);
  const [response,setResponse]=useState<{key:string;data?:Preflight;error?:string}|null>(null);
  const [operation,setOperation]=useState<'export'|'settings'|null>(null);
  const [actionError,setActionError]=useState('');
  const [acceptedReduction,setAcceptedReduction]=useState<string|null>(null);
  const {id,revision}=project;
  const key=`${id}:${revision}:${attempt}`;
  useEffect(()=>{
    let active=true;
    api<Preflight>(`/projects/${id}/preflight`).then(data=>{
      if(!active)return;
      setResponse(data.revision===revision?{key,data}:{key,error:'El montaje cambió. Vuelve a comprobarlo para ver sus datos actualizados.'});
    }).catch((error:Error)=>{if(active)setResponse({key,error:error.message});});
    return()=>{active=false;};
  },[api,id,key,revision]);

  const report=response?.key===key?response:null;
  const data=report?.data;
  const error=report?.error||actionError;
  const close=()=>{if(!operation)onClose();};
  async function run(action:'export'|'settings',callback:()=>Promise<void>){
    setOperation(action);
    setActionError('');
    try{await callback();}
    catch(error){setActionError((error as Error).message);}
    finally{setOperation(null);}
  }

  const count=(level:Check['level'])=>data?.checks.filter(check=>check.level===level).length||0;
  const errors=count('error'),warnings=count('warn');
  const sizeRange=data?.sizeRangeMB?.map(value=>decimal.format(value)).join('–');
  const timeRange=data?.timeRangeSeconds;
  const timeEstimate=timeRange&&(timeRange[1]<60?`${timeRange.join('–')} s`:`${seconds(timeRange[0])} – ${seconds(timeRange[1])}`);
  return <Modal titleId="export-title" onClose={close} busy={!report||!!operation} wide>
    <DialogHeader titleId="export-title" kicker="EXPORTAR" title="Última comprobación" onClose={close}
      description="Comprueba la resolución, la fluidez y la calidad del MP4 antes de exportar."/>
    <div className="export-settings">
    <label className="export-encoder">Formato
      <select value={project.settings.profile} disabled={busy||!!operation} onChange={event=>{
        const profile=event.currentTarget.value;
        void run('settings',()=>onSettingsChange({profile}));
      }}>
        <option value="source">Como el original</option>
        <option value="youtube">Horizontal · 1080p</option>
        <option value="youtube4k">Horizontal · 4K</option>
        <option value="reels">Vertical · 1080p</option>
        <option value="reels4k">Vertical · 4K</option>
        {['tiktok','shorts'].includes(project.settings.profile)?<option value={project.settings.profile}>Vertical · perfil guardado</option>:null}
      </select>
    </label>
    <label className="export-encoder">Fotogramas por segundo
      <select value={project.settings.frameRate||'source'} disabled={busy||!!operation} onChange={event=>{
        const frameRate=event.currentTarget.value;
        void run('settings',()=>onSettingsChange({frameRate}));
      }}>
        <option value="source">Como el original</option>
        <option value="30">30 fps</option>
        <option value="60">60 fps</option>
      </select>
    </label>
    <label className="export-encoder">Calidad
      <select value={project.settings.exportQuality||'high'} disabled={busy||!!operation} onChange={event=>{
        const exportQuality=event.currentTarget.value;
        void run('settings',()=>onSettingsChange({exportQuality}));
      }}>
        <option value="high">Alta · conserva más detalle</option>
        <option value="balanced">Equilibrada · menor tamaño</option>
      </select>
    </label>
    <label className="export-encoder">Motor de exportación
      <select value={project.settings.encoder} disabled={busy||!!operation} onChange={event=>{
        const encoder=event.currentTarget.value;
        void run('settings',()=>onSettingsChange({encoder}));
      }}>
        <option value="auto">Automático</option>
        <option value="cpu">CPU</option>
        <option value="nvenc">NVIDIA NVENC</option>
      </select>
    </label>
    </div>
    {error?<p className="export-error" role="alert">{error}</p>:null}
    {!report||operation==='settings'?<p className="export-loading" role="status">{operation==='settings'?'Guardando los ajustes de salida…':'Comprobando clips, medio, audio y espacio en disco…'}</p>:null}
    {data?<>
      <dl className="export-facts">
        <div><dt>Formato</dt><dd>{data.width} × {data.height} · {data.fps} fps</dd></div>
        <div><dt>Duración</dt><dd>{clock(data.duration)}</dd></div>
        <div><dt>{data.measuredSizeMB===null?'Tamaño orientativo':'Último tamaño real'}</dt>
          <dd>{data.measuredSizeMB!==null?measuredSize(data.measuredSizeMB):sizeRange?`${sizeRange} MB`:'—'}</dd></div>
        <div><dt>Tiempo estimado</dt><dd>{timeEstimate||'—'}</dd></div>
        <div><dt>Disco libre</dt><dd>{data.freeGB===null?'desconocido':`${decimal.format(data.freeGB)} GB`}</dd></div>
        <div><dt>Archivo</dt><dd>{data.name}</dd></div>
      </dl>
      {data.timeRangeSeconds?<p className="export-loading">El tiempo depende del equipo y los efectos. La caché puede acelerar el render.</p>:null}
      <ul className="export-checks">
        {data.checks.map(check=><li key={check.label} className={`export-check ${check.level}`}>
          <span aria-hidden="true">{LEVEL[check.level]}</span>
          <div><b>{check.label}</b><p>{check.detail}</p></div>
        </li>)}
      </ul>
      {data.ok&&data.reducesQuality?<label className="export-confirm-reduction">
        <input type="checkbox" checked={acceptedReduction===key}
          onChange={event=>setAcceptedReduction(event.currentTarget.checked?key:null)}/>
        <span>Confirmo que quiero exportar con la resolución o los fps reducidos.</span>
      </label>:null}
      {data.resumable?<p className="export-resume" role="status">
        <b>Se puede reanudar.</b> El render anterior quedó {JOB_STATUS[data.lastJob?.status||'']||'sin completar'}. Al reintentar se podrán reutilizar los tramos que sigan en la caché.
      </p>:null}
      {data.measuredSizeMB!==null?<p className="export-last">
        <a href={`/api/projects/${id}/artifact?type=export&download=1`} download>Descargar el MP4 de esta versión</a>
      </p>:null}
    </>:null}
    <div className="export-actions">
      {error?<button type="button" disabled={busy||!!operation} onClick={()=>{setActionError('');setAttempt(value=>value+1);}}>Volver a comprobar</button>:null}
      {data?<button type="button" className="export-go" disabled={!data.ok||busy||!!operation||!!error||(data.reducesQuality&&acceptedReduction!==key)}
        onClick={()=>void run('export',()=>onExport(data.revision))}>
        {operation==='export'?'Enviando…':data.resumable?'Reanudar exportación':'Exportar vídeo'}
      </button>:null}
      <button type="button" disabled={!!operation} onClick={close}>Cancelar</button>
      {data?<span className="export-summary">{errors?plural(errors,'error','errores'):plural(warnings,'aviso','avisos')} · el MP4 queda en el equipo</span>:null}
    </div>
  </Modal>;
}
