import {useState,type Ref} from 'react';
import {CutReview} from './CutReview';
import {DialogHeader,Modal} from './Modal';
import {clock} from './timeline';
import type {AutoFormat,AutoOptions,Project} from './types';
import './workflow.css';
export type {AutoOptions} from './types';

const recipes:{name:string;description:string;options:AutoOptions}[]=[
 {
  name:'Pódcast limpio',description:'Conserva el encuadre y centra la edición en la voz.',
  options:{targetFormat:'auto',subtitles:true,subtitlePosition:'bottom',subtitle:'Cinematic',memes:false,broll:false,music:false,beauty:false},
 },
 {
  name:'Tutorial',description:'Respeta el formato del original y añade subtítulos y planos de apoyo.',
  options:{targetFormat:'auto',subtitles:true,subtitlePosition:'bottom',subtitle:'Tutorial',memes:false,broll:true,music:false,beauty:false},
 },
 {
  name:'Short dinámico',description:'Salida vertical con subtítulos, recursos y música.',
  options:{targetFormat:'vertical',subtitles:true,subtitlePosition:'bottom',subtitle:'Viral',memes:true,broll:true,music:true,beauty:false},
 },
];

export function automaticPreferences(settings?:Project['settings']):AutoOptions{
 const read=(key:string)=>{try{return localStorage.getItem('nacho:auto-'+key);}catch{return null;}};
 const savedFormat=read('targetFormat');
 const targetFormat=savedFormat==='vertical'||savedFormat==='horizontal'||savedFormat==='auto'
  ? savedFormat
  : 'auto';
 return {
  targetFormat,
  subtitles:settings?.subtitles??(read('subtitles')!=='false'),
  subtitlePosition:settings?.subtitlePosition||read('subpos')||'top',
  subtitle:settings?.subtitle||read('substyle')||'Cinematic',
  memes:read('memes')!=='false',
  broll:read('broll')!=='false',
  music:read('music')!=='false',
  beauty:read('beauty')==='true',
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
 const {subtitles,subtitlePosition:subtitlePos,subtitle:subtitleStyle,memes,broll,music,beauty,targetFormat}=options;
 function showOptions(mode:'import'|'project'){
  setOptions(automaticPreferences(mode==='project'?project?.settings:undefined));
  setOptionsFor(mode);
 }

 function triggerAuto(finish:boolean){
  const prefs={subtitles,subpos:subtitlePos,substyle:subtitleStyle,memes,broll,music,beauty,targetFormat};
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

   <fieldset className="workflow-recipes">
    <legend>Recetas de montaje</legend>
    <div className="workflow-recipe-grid">{recipes.map(recipe=><button
     key={recipe.name} type="button" disabled={busy}
     aria-pressed={Object.entries(recipe.options).every(([key,value])=>options[key as keyof AutoOptions]===value)}
     onClick={()=>setOptions({...recipe.options})}
    ><strong>{recipe.name}</strong><small>{recipe.description}</small></button>)}</div>
   </fieldset>
   <label className="workflow-format">
    <span>Formato de salida</span>
    <select value={targetFormat} disabled={busy} onChange={event=>setOptions({...options,targetFormat:event.target.value as AutoFormat})}>
     <option value="auto">Como el original · conserva la resolución</option>
     <option value="vertical">Vertical 9:16 · 1080 × 1920</option>
     <option value="horizontal">Horizontal 16:9 · 1920 × 1080</option>
    </select>
   </label>
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
      <span>Memes contextuales</span>
     </label>
     <small>{memes?'Inserciones puntuales según el contexto':'Sin memes'}</small>
    </div>

    <div className={`workflow-opt-pill ${broll?'active':''}`}>
     <label className="workflow-opt-label">
      <input type="checkbox" checked={broll} onChange={event=>setOptions({...options,broll:event.target.checked})}/>
      <span>Vídeo de apoyo de Pexels</span>
     </label>
     <small>Disponible con una clave de <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Pexels</a> configurada.</small>
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
