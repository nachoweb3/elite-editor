import {useState,type Ref} from 'react';
import {CutReview} from './CutReview';
import {DialogHeader,Modal} from './Modal';
import {clock} from './timeline';
import type {Project} from './types';

export type AutoOptions={
 subtitles:boolean;
 subtitlePosition:string;
 subtitle:string;
 memes:boolean;
 music:boolean;
 beauty:boolean;
};

export function automaticPreferences(settings?:Project['settings']):AutoOptions{
 const read=(key:string)=>localStorage.getItem('nacho:auto-'+key);
 return {
  subtitles:settings?.subtitles??(read('subtitles')!=='false'),
  subtitlePosition:settings?.subtitlePosition||read('subpos')||'top',
  subtitle:settings?.subtitle||read('substyle')||'Cinematic',
  memes:read('memes')!=='false',
  music:read('music')!=='false',
  beauty:read('beauty')!=='false',
 };
}

type ReviewProject=Project&{automatic?:{status?:string;decisions?:{label:string;detail:string}[]};audioTracks?:unknown[]};

export function Workflow({
 project,
 busy,
 dirty,
 preferAutomatic,
 ready,
 importButton,
 onImport,
 onAuto,
 onReview,
 onRestore,
 onTool,
 onKeep,
 onPause,
 onSeek
}:{
 project:ReviewProject|null;
 busy:boolean;
 dirty:boolean;
 preferAutomatic:boolean;
 ready:boolean;
 importButton:Ref<HTMLButtonElement>;
 onImport:(options?:AutoOptions)=>void;
 onAuto:(options:AutoOptions,finish:boolean)=>void;
 onReview:()=>void;
 onRestore:()=>void;
 onTool:(tab:string)=>void;
 onKeep:(start:number,end:number)=>void;
 onPause:()=>void;
 onSeek:(time:number)=>void;
}){
 const job=project?.jobs.at(-1),review=!!project?.artifacts.preview;
 const [optionsFor,setOptionsFor]=useState<'import'|'project'|null>(null);
 const direction=project?.automatic?.direction;
 const resources=(direction?.media||[]).filter(item=>item.status!=='rejected'&&item.outputTime!==undefined);

 const [options,setOptions]=useState(()=>automaticPreferences(project?.settings));
 const {subtitles,subtitlePosition:subtitlePos,subtitle:subtitleStyle,memes,music,beauty}=options;
 function showOptions(mode:'import'|'project'){
  setOptions(automaticPreferences(mode==='project'?project?.settings:undefined));
  setOptionsFor(mode);
 }

 function triggerAuto(finish:boolean){
  const prefs={subtitles,subpos:subtitlePos,substyle:subtitleStyle,memes,music,beauty};
  try{for(const [key,value] of Object.entries(prefs))localStorage.setItem('nacho:auto-'+key,String(value));}catch{}
  setOptionsFor(null);
  if(optionsFor==='import')onImport(options);
  else onAuto(options,finish);
 }

 return <section className="workflow" data-guide="flujo">
  <div className="workflow-steps">
   <button ref={importButton} className={!project?'workflow-next':''} disabled={busy||!ready} onClick={()=>preferAutomatic?showOptions('import'):onImport()}>
    <b>1</b>
    <span>{preferAutomatic?'Importar y montar':'Importar vídeo'}<small>{project?project.name:'MP4, MOV, MKV o WebM'}</small></span>
   </button>

   <button
    className={project&&!review?'workflow-next':''}
    disabled={!project||project.blank||!project.clips.length||busy}
    onClick={()=>showOptions('project')}
   >
    <b>2</b>
    <span>
     Editar automáticamente
     <small>{(project?.settings.subtitles??subtitles)?'Con subtítulos':'Sin subtítulos'} · {memes?'con memes':'sin memes'}</small>
    </span>
   </button>

   <button
    className={review?'workflow-next':''}
    disabled={!review||dirty||busy}
    onClick={onReview}
   >
    <b>3</b>
    <span>Revisar resultado<small>Después, exporta arriba a la derecha</small></span>
   </button>
  </div>

  {optionsFor?<Modal titleId="auto-options-title" onClose={()=>setOptionsFor(null)}>
   <DialogHeader titleId="auto-options-title" kicker="MONTAJE AUTOMÁTICO" title={optionsFor==='import'?'Importar y montar':'Editar automáticamente'} onClose={()=>setOptionsFor(null)}
    description="El montaje queda editable en la línea de tiempo. En las grabaciones con audio, el estudio usa Whisper para localizar y transcribir la voz."/>

   <div className="workflow-options-grid">
    <div className={`workflow-opt-pill ${subtitles?'active':''}`}>
     <label className="workflow-opt-label">
      <input type="checkbox" checked={subtitles} onChange={event=>setOptions({...options,subtitles:event.target.checked})}/>
      <span>Subtítulos animados</span>
     </label>
     {subtitles?<div className="workflow-opt-sub">
      <select aria-label="Posición de los subtítulos" value={subtitlePos} onChange={event=>setOptions({...options,subtitlePosition:event.target.value})}>
       <option value="top">Posición: Arriba</option>
       <option value="bottom">Posición: Abajo</option>
      </select>
      <select aria-label="Estilo de los subtítulos" value={subtitleStyle} onChange={event=>setOptions({...options,subtitle:event.target.value})}>
       <option value="Cinematic">Estilo: Cinematic</option>
       <option value="Viral">Estilo: Viral</option>
       <option value="Tutorial">Estilo: Tutorial</option>
       <option value="Dark Future">Estilo: Dark Future</option>
      </select>
     </div>:null}
    </div>

    <div className={`workflow-opt-pill ${memes?'active':''}`}>
     <label className="workflow-opt-label">
      <input type="checkbox" checked={memes} onChange={event=>setOptions({...options,memes:event.target.checked})}/>
      <span>Memes y recursos IA</span>
     </label>
     <small>{memes?'Inserción inteligente por contexto':'Montaje directo sin memes'}</small>
    </div>

    <div className={`workflow-opt-pill ${music?'active':''}`}>
     <label className="workflow-opt-label">
      <input type="checkbox" checked={music} onChange={event=>setOptions({...options,music:event.target.checked})}/>
      <span>Música con ducking</span>
     </label>
     <small>{music?'Baja cuando hablas':'Sin música'}</small>
    </div>

    <div className={`workflow-opt-pill ${beauty?'active':''}`}>
     <label className="workflow-opt-label">
      <input type="checkbox" checked={beauty} onChange={event=>setOptions({...options,beauty:event.target.checked})}/>
      <span>Retoque facial natural</span>
     </label>
     <small>{beauty?'Piel y luz suave':'Sin retoque'}</small>
    </div>
   </div>

   <div className="workflow-dialog-actions">
    <button type="button" className="mainbutton" disabled={busy} onClick={()=>triggerAuto(true)}>
     {optionsFor==='import'?'Elegir vídeo y montar':'Montar y exportar MP4'}
    </button>
    {optionsFor==='project'?<button type="button" disabled={busy} onClick={()=>triggerAuto(false)}>Montar para revisar</button>
     :<button type="button" disabled={busy} onClick={()=>{setOptionsFor(null);onImport();}}>Solo importar vídeo</button>}
   </div>
  </Modal>:null}

  {busy?<div className="workflow-progress" role="status">
   <progress/>
   <span>
    {job?.message||'Preparando…'}
    <small>El análisis local de vídeos largos puede tardar. Puedes seguir aquí el paso actual.</small>
   </span>
  </div>:null}

  {project?.automatic?<details className="workflow-review" open={project.automatic.status==='review'}>
   <summary>Qué ha cambiado el editor automático</summary>
   <CutReview onPause={onPause} project={project} busy={busy} onKeep={onKeep}/>
   <ul>
    {project.automatic.decisions?.map((d,i)=><li key={`${d.label}-${i}`}><b>{d.label}:</b> {d.detail}</li>)}
   </ul>
   {direction?.summaries?.map((summary,i)=><p key={i}>{summary}</p>)}
   {resources.length?<ul aria-label="Recursos del montaje">{resources.map((item,i)=><li key={i}>
    <button type="button" onClick={()=>onSeek(item.outputTime!)}>{clock(item.outputTime!)} · {item.name||item.kind||'Recurso'}</button>
    {item.page?<a href={item.page} target="_blank" rel="noreferrer"> {item.author||item.provider||'Fuente'}{item.license?` · ${item.license}`:''}</a>:null}
   </li>)}</ul>:null}
   <button disabled={busy||dirty} onClick={onRestore}>Deshacer último cambio guardado</button>
   {project.analysis?.warnings.length?<div role="status">{project.analysis.warnings.map((w,i)=><p key={i}>{w}</p>)}</div>:null}
  </details>:null}

  <nav aria-label="Herramientas del proyecto">
   <span>Ajustar a mano:</span>
   <button disabled={!project||busy} onClick={()=>onTool('audio')}>Sonidos y música</button>
   <button disabled={!project||busy} onClick={()=>onTool('face')}>Rostro</button>
   <button disabled={!project||busy} onClick={()=>onTool('text')}>Texto y cortes</button>
   <button disabled={!project||busy} onClick={()=>onTool('prompt')}>Dar instrucciones</button>
  </nav>
 </section>;
}
