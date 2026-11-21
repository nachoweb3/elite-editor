import {useEffect,useMemo,useRef,useState} from 'react';
import type {Placement,Project} from './types';
import {CLIP_TRANSITIONS,isClipTransition} from '../../shared/transitions.mjs';
import {ClipTransitionSelect} from './ClipTransitionSelect';
import './ai-layer.css';

type CatalogAsset={id:string;name:string;kind:string;description?:string;duration?:number;license?:string;author?:string;page?:string;provider?:string;source?:string;file?:string};
type Intervention={kind?:string;type?:string;name?:string;description?:string;reason?:string;outputTime?:number;duration?:number;volume?:number;useAudio?:boolean;effect?:string;status?:string;resourceId?:string;file?:string;license?:string;author?:string;page?:string;provider?:string;attribution?:string;placement?:Placement|null};
type AutoDirection={media?:Intervention[];events?:Intervention[];summaries?:string[]};
type AIProject=Project&{automatic?:{status?:string;direction?:AutoDirection}};
type Props={
  project:AIProject|null;
  busy:boolean;
  locked?:boolean;
  api:<T>(route:string,data?:unknown)=>Promise<T>;
  onProject:(p:AIProject)=>void;
  onSeek?:(time:number)=>void;
  videoSrc?:string;
  defaultCollapsed?:boolean;
};

const KIND_LABEL:Record<string,string>={meme:'Meme',sound:'Sonido',pexels:'Imagen',transition:'Transición'};
const STATUS_LABEL:Record<string,string>={accepted:'Aprobado',pending:'Pendiente',rejected:'Rechazado'};
const clock=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${String(Math.floor(s%1*10))}`;

function NumberField({value,min=0,max=9999,step=.1,disabled,onCommit,label}:{value:number;min?:number;max?:number;step?:number;disabled?:boolean;onCommit:(value:number)=>void;label:string}){
 const [draft,setDraft]=useState(String(Number(value.toFixed(2))));
 useEffect(()=>setDraft(String(Number(value.toFixed(2)))),[value]);
 function commit(){const next=Number(draft);if(!Number.isFinite(next)||next<min||next>max){setDraft(String(Number(value.toFixed(2))));return;}onCommit(next);}
 return <label className="ai-number">{label}<input type="number" min={min} max={max} step={step} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur();}}}/></label>;
}

export function AIInterventions({project,busy,locked=false,api,onProject,onSeek,videoSrc,defaultCollapsed=false}:Props){
 const [assets,setAssets]=useState<CatalogAsset[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false),[openMusic,setOpenMusic]=useState(false);
 const [collapsed,setCollapsed]=useState(defaultCollapsed);
 const [layout,setLayout]=useState<'split'|'grid'>('split');
 const [filter,setFilter]=useState<'all'|'meme'|'sound'|'transition'|'pending'|'accepted'|'rejected'>('all');
 const [currentTime,setCurrentTime]=useState(0);
 const [isPlaying,setIsPlaying]=useState(false);
 const miniVideo=useRef<HTMLVideoElement>(null);
 const direction=project?.automatic?.direction;

 useEffect(()=>{
  let active=true;
  Promise.all([api<CatalogAsset[]>('/assets'),api<CatalogAsset[]>('/catalogue')])
   .then(([a,c])=>{if(active)setAssets([...c,...a]);})
   .catch(e=>{if(active)setError((e as Error).message);});
  return()=>{active=false;};
 },[project?.id]);

 const items=useMemo(()=>{
  if(!direction)return [];
  return [
   ...(direction.media||[]).map((item,index)=>({item:{...item,kind:item.kind||'meme'},target:'media' as const,index})),
   ...(direction.events||[]).filter(item=>item.type==='transition').map((item,index)=>({item:{...item,kind:'transition'},target:'event' as const,index})),
  ].sort((a,b)=>(Number(a.item.outputTime)||0)-(Number(b.item.outputTime)||0));
 },[direction]);

 const music=assets.filter(a=>a.kind==='music'),musicId=project?.settings.musicId||'';

 const stats=useMemo(()=>{
  const all=items.map(x=>x.item);
  return {
   total:all.length,
   memes:all.filter(i=>i.kind==='meme'||i.kind==='pexels').length,
   sounds:all.filter(i=>i.kind==='sound').length,
   transitions:all.filter(i=>i.kind==='transition').length,
   pending:all.filter(i=>i.status==='pending').length,
   accepted:all.filter(i=>!i.status||i.status==='accepted').length,
   rejected:all.filter(i=>i.status==='rejected').length
  };
 },[items]);

 const filteredItems=useMemo(()=>{
  if(filter==='all')return items;
  if(filter==='meme')return items.filter(x=>x.item.kind==='meme'||x.item.kind==='pexels');
  if(filter==='sound')return items.filter(x=>x.item.kind==='sound');
  if(filter==='transition')return items.filter(x=>x.item.kind==='transition');
  if(filter==='pending')return items.filter(x=>x.item.status==='pending');
  if(filter==='accepted')return items.filter(x=>!x.item.status||x.item.status==='accepted');
  if(filter==='rejected')return items.filter(x=>x.item.status==='rejected');
  return items;
 },[items,filter]);

 async function patch(target:'media'|'event',index:number,changes:Record<string,unknown>){
  if(!project||busy||saving||locked)return;
  setSaving(true);setError('');
  try{onProject(await api<AIProject>(`/projects/${project.id}/ai`,{target,index,changes}));}
  catch(e){setError((e as Error).message);}
  finally{setSaving(false);}
 }

 async function patchAll(allStatus:'accepted'|'rejected',kindFilter?:string){
  if(!project||busy||saving||locked)return;
  setSaving(true);setError('');
  try{
   onProject(await api<AIProject>(`/projects/${project.id}/ai`,{allStatus,kind:kindFilter}));
  }catch(e){
   setError((e as Error).message);
  }finally{
   setSaving(false);
  }
 }

 async function patchMusic(changes:{musicId?:string|null;musicVolume?:number}){
  if(!project||busy||saving||locked)return;
  setSaving(true);setError('');
  try{onProject(await api<AIProject>(`/projects/${project.id}/music`,changes));}
  catch(e){setError((e as Error).message);}
  finally{setSaving(false);}
 }

 function jumpTo(seconds:number){
  const t=Math.max(0,seconds);
  setCurrentTime(t);
  if(miniVideo.current){
   miniVideo.current.currentTime=t;
   void miniVideo.current.play().catch(()=>{});
  }
  onSeek?.(t);
 }

 function togglePlay(){
  if(!miniVideo.current)return;
  if(miniVideo.current.paused){
   void miniVideo.current.play().catch(()=>{});
  }else{
   miniVideo.current.pause();
  }
 }

 const activePreviewUrl=videoSrc||(project?.artifacts.export
  ?`/api/projects/${project.id}/artifact?type=export&v=${project.revision}`
  :project?.artifacts.preview
  ?`/api/projects/${project.id}/artifact?type=preview&v=${project.revision}`
  :project?`/api/projects/${project.id}/media`:''
 );

 if(!project||!direction)return null;
 const disabled=busy||saving||locked;

 function resourceOptions(item:Intervention){
  if(item.kind==='transition')return [];
  if(item.kind==='sound')return assets.filter(a=>a.kind==='sound');
  return assets.filter(a=>a.kind==='meme'||a.kind==='broll'||a.kind==='pexels');
 }

 const currentActiveMeme=items.find(x=>{
  const t=Number(x.item.outputTime)||0,dur=Number(x.item.duration)||2;
  return currentTime>=t&&currentTime<=t+dur;
 });

 return <section className={`ai-layer ${collapsed?'collapsed':''}`} aria-label="Capa de intervenciones IA">
  <header className="ai-layer-head">
   <div className="ai-layer-head-main">
    <div className="ai-title-row">
     <button type="button" className="ai-collapse-toggle" onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed}>
      <span className="ai-collapse-chevron">{collapsed?'▶':'▼'}</span>
      <span className="ai-kicker">✦ MEMES Y RECURSOS IA</span>
     </button>
     <div className="ai-layer-quick-badges">
      <span className="badge-count total">{stats.total} total</span>
      <span className="badge-count ok">{stats.accepted} aprobados</span>
      {stats.pending>0?<span className="badge-count warn">{stats.pending} pendientes</span>:null}
      {stats.rejected>0?<span className="badge-count del">{stats.rejected} rechazados</span>:null}
     </div>
    </div>
    <h2>Elige qué memes y recursos poner o quitar</h2>
    <p>Ajusta cada meme sin perder de vista la vista previa del vídeo. Puedes aprobar, rechazar o cambiarlos en directo.</p>
   </div>

   <div className="ai-layer-tools">
    <div className="ai-view-modes" role="group" aria-label="Modo de visualización">
     <button type="button" className={layout==='split'?'active':''} onClick={()=>setLayout('split')} title="Vista dividida: vídeo al lado para comparar">
      ◫ Vídeo y Memes
     </button>
     <button type="button" className={layout==='grid'?'active':''} onClick={()=>setLayout('grid')} title="Cuadrícula amplia">
      ▦ Cuadrícula
     </button>
     <button type="button" className="ai-toggle-btn" onClick={()=>setCollapsed(c=>!c)}>
      {collapsed?'Mostrar panel':'Plegar panel'}
     </button>
    </div>
   </div>
  </header>

  {locked?<p className="ai-locked" role="status">Guarda el montaje para editar la capa IA; así no se mezclan cambios manuales sin guardar.</p>:null}
  {error?<p className="ai-layer-error" role="alert">{error}</p>:null}

  {!collapsed?<div className="ai-body">
   {/* Barra de Filtros y Operaciones por Lote */}
   <div className="ai-bar">
    <div className="ai-filters" role="tablist" aria-label="Filtrar recursos">
     <button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todos ({stats.total})</button>
     <button type="button" className={filter==='meme'?'active':''} onClick={()=>setFilter('meme')}>Memes ({stats.memes})</button>
     <button type="button" className={filter==='sound'?'active':''} onClick={()=>setFilter('sound')}>Sonidos ({stats.sounds})</button>
     <button type="button" className={filter==='transition'?'active':''} onClick={()=>setFilter('transition')}>Transiciones ({stats.transitions})</button>
     <button type="button" className={filter==='pending'?'active':''} onClick={()=>setFilter('pending')}>Pendientes ({stats.pending})</button>
     <button type="button" className={filter==='accepted'?'active':''} onClick={()=>setFilter('accepted')}>Aprobados ({stats.accepted})</button>
     {stats.rejected>0?<button type="button" className={filter==='rejected'?'active':''} onClick={()=>setFilter('rejected')}>Rechazados ({stats.rejected})</button>:null}
    </div>

    <div className="ai-batch-actions">
     <button type="button" disabled={disabled||!items.length} onClick={()=>void patchAll('accepted')}>✓ Aprobar todos</button>
     <button type="button" disabled={disabled||!items.length} onClick={()=>void patchAll('rejected')}>✕ Omitir todos los memes</button>
     <button type="button" disabled={disabled||!items.length} onClick={()=>void patchAll('accepted')}>↺ Restaurar todos</button>
    </div>
   </div>

   {/* Música de fondo */}
   <div className="ai-music">
    <button type="button" className="ai-music-toggle" onClick={()=>setOpenMusic(x=>!x)} aria-expanded={openMusic}>
     ♫ Música de fondo <b>{project.settings.musicVolume!==undefined?`${Math.round(project.settings.musicVolume*100)}%`:'—'}</b> · {musicId?'Activada':'Sin música'}
    </button>
    {openMusic?<div className="ai-music-controls">
     <label>Pista
      <select value={musicId} disabled={disabled} onChange={e=>void patchMusic({musicId:e.target.value||null})}>
       <option value="">Sin música de fondo</option>
       {music.map(a=><option key={a.id} value={a.id}>{a.name}{a.license?` · ${a.license}`:''}</option>)}
      </select>
     </label>
     <label>Volumen ({Math.round((project.settings.musicVolume??0.06)*100)}%)
      <input type="range" min={0} max={0.2} step={0.005} value={project.settings.musicVolume??0.06} disabled={disabled} onChange={e=>{const v=Number(e.target.value);onProject({...project,settings:{...project.settings,musicVolume:v}});}} onPointerUp={e=>void patchMusic({musicVolume:Number((e.target as HTMLInputElement).value)})} onBlur={e=>void patchMusic({musicVolume:Number(e.target.value)})}/>
      <small>Ducking automático: la voz principal baja el volumen de la música.</small>
     </label>
    </div>:null}
   </div>

   {/* Contenido principal: Vista Dividida o Cuadrícula */}
   <div className={`ai-layout-${layout}`}>
    {layout==='split'?<div className="ai-sticky-monitor">
     <div className="ai-monitor-header">
      <span className="ai-monitor-tag">PREVIEW EN DIRECTO</span>
      <span className="ai-monitor-time">{clock(currentTime)}</span>
     </div>

     <div className="ai-monitor-box">
      {activePreviewUrl?<video
       ref={miniVideo}
       src={activePreviewUrl}
       playsInline
       onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)}
       onPlay={()=>setIsPlaying(true)}
       onPause={()=>setIsPlaying(false)}
      />:<div className="ai-monitor-placeholder">Cargando vista del vídeo…</div>}

      {currentActiveMeme?<div className={`ai-active-overlay status-${currentActiveMeme.item.status||'accepted'}`}>
       <div className="ai-active-pill">
        <span>✦ Activo: <b>{currentActiveMeme.item.name||KIND_LABEL[currentActiveMeme.item.kind||'']||'Meme'}</b></span>
        <button type="button" onClick={()=>void patch(currentActiveMeme.target,currentActiveMeme.index,{status:currentActiveMeme.item.status==='accepted'?'rejected':'accepted'})}>
         {currentActiveMeme.item.status==='accepted'?'✕ Rechazar':'✓ Aprobar'}
        </button>
       </div>
      </div>:null}
     </div>

     <div className="ai-monitor-controls">
      <button type="button" onClick={()=>jumpTo(currentTime-3)} title="Retroceder 3 segundos">⤺ -3s</button>
      <button type="button" className="ai-play-btn" onClick={togglePlay}>{isPlaying?'⏸ Pausar':'▶ Reproducir'}</button>
      <button type="button" onClick={()=>jumpTo(currentTime+3)} title="Avanzar 3 segundos">+3s ⤻</button>
      <button type="button" className="ai-scroll-top" onClick={()=>{window.scrollTo({top:0,behavior:'smooth'});}} title="Subir al reproductor principal">
       ↑ Pantalla completa
      </button>
     </div>
     <p className="ai-monitor-hint">Pulsa «Ver en contexto» en cualquier tarjeta para ver el meme exacto en el reproductor.</p>
    </div>:null}

    {/* Lista de Tarjetas de Memes */}
    <div className="ai-cards-container">
     <div className="ai-cards">
      {filteredItems.map(({item,target,index})=>{
       const kind=item.kind||'meme',status=item.status||'accepted',isTransition=kind==='transition',isSound=kind==='sound';
       const title=isTransition?`Transición · ${CLIP_TRANSITIONS[isClipTransition(item.effect)?item.effect:'fadeblack'].label}`:item.name||KIND_LABEL[kind]||'Intervención';
       const mediaTime=Number(item.outputTime)||0;
       const isCurrentActive=Math.abs(currentTime-mediaTime)<2;

       return <article key={`${target}-${index}`} className={`ai-card status-${status} ${isCurrentActive?'is-active':''}`}>
        <div className="ai-card-top">
         <span className={`ai-kind ${kind}`}>{KIND_LABEL[kind]||kind}</span>
         <button type="button" className="ai-time-chip" onClick={()=>jumpTo(mediaTime)} title="Saltar al vídeo en este momento">
          ▶ {clock(mediaTime)}
         </button>
         <span className={`ai-status ${status}`}>{STATUS_LABEL[status]||status}</span>
        </div>

        {/* Mini Preview del recurso visual o auditivo */}
        {!isTransition?<div className="ai-card-preview">
         {kind==='meme'||kind==='pexels'?<div className="ai-card-thumb">
          <img
           src={`/api/projects/${project.id}/live?i=${index}`}
           alt={title}
           loading="lazy"
           onError={e=>{(e.currentTarget as HTMLElement).style.display='none';}}
          />
         </div>:null}
         {isSound?<div className="ai-card-audio">
          <audio controls src={`/api/projects/${project.id}/live?i=${index}`} preload="none"/>
         </div>:null}
        </div>:null}

        <h3>{title}</h3>
        {item.reason?<p className="ai-reason">{item.reason}</p>:null}
        {(kind==='meme'||kind==='pexels')?(item.placement?<p className="ai-placement">Colocación: {item.placement.position||'automática'} · sin tapar rostros ni subtítulos.</p>:<p className="ai-placement">Colocación segura calculada automáticamente en el render.</p>):null}
        {item.license||item.author?<p className="ai-credit">{item.author||item.provider||'Recurso'}{item.license?` · ${item.license}`:''}{item.page?<a href={item.page} target="_blank" rel="noreferrer"> ↗</a>:null}</p>:null}

        <div className="ai-actions">
         <button type="button" className="ai-btn-context" onClick={()=>jumpTo(mediaTime)}>
          ▶ Ver en vídeo
         </button>
         {status!=='accepted'?<button type="button" className="ai-btn-ok" disabled={disabled} onClick={()=>void patch(target,index,{status:'accepted'})}>✓ Aprobar</button>:<button type="button" className="ai-btn-del" disabled={disabled} onClick={()=>void patch(target,index,{status:'rejected'})}>✕ Omitir</button>}
         {status==='rejected'?<button type="button" className="ai-btn-restore" disabled={disabled} onClick={()=>void patch(target,index,{status:'accepted'})}>Restaurar</button>:null}
         <button type="button" className="ai-btn-regen" disabled={disabled} onClick={()=>void patch(target,index,{regenerate:true})} title="Probar otro meme o recurso para este punto">↻ Cambiar recurso</button>
        </div>

        <details className="ai-adjust">
         <summary>Ajustar tiempo y opciones</summary>
         <div className="ai-fields">
          <NumberField label="Momento (s)" value={mediaTime} min={0} step={.1} disabled={disabled} onCommit={v=>void patch(target,index,{outputTime:v})}/>
          {!isTransition?<NumberField label="Duración (s)" value={Number(item.duration)||3.2} min={.1} max={12} step={.1} disabled={disabled} onCommit={v=>void patch(target,index,{duration:v})}/>:null}
          {!isTransition?<NumberField label="Volumen" value={Number(item.volume??(kind==='sound'?.16:.12))} min={0} max={2} step={.05} disabled={disabled} onCommit={v=>void patch(target,index,{volume:v})}/>:null}
          {!isTransition?<label className="ai-check"><input type="checkbox" checked={item.useAudio===true} disabled={disabled} onChange={e=>void patch(target,index,{useAudio:e.target.checked})}/> Audio del meme</label>:null}
          {isTransition?<label className="ai-number">Efecto
           <ClipTransitionSelect value={item.effect} disabled={disabled} allowCut={false} onChange={effect=>void patch(target,index,{effect})}/>
          </label>:<label className="ai-number">Reemplazar por
           <select value={item.resourceId||''} disabled={disabled} onChange={e=>{if(e.target.value)void patch(target,index,{resourceId:e.target.value});}}>
            <option value="">{item.name||'Seleccionar otro recurso'}</option>
            {resourceOptions(item).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
           </select>
          </label>}
         </div>
        </details>
       </article>;
      })}
     </div>
     {!filteredItems.length?<p className="ai-empty">No hay elementos con el filtro seleccionado ({filter}).</p>:null}
    </div>
   </div>
  </div>:null}
 </section>;
}
