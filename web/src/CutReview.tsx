import {useEffect,useRef,useState} from 'react';
import type {Project} from './types';
import {removedRanges,type Range} from './timeline';
const timestamp=(n:number)=>`${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,'0')}`;
export function CutReview({project,busy,onKeep,onPause}:{project:Project;busy:boolean;onKeep:(start:number,end:number)=>void;onPause:()=>void}){
 const gaps=removedRanges(project.clips,project.id,project.media.duration),[limit,setLimit]=useState(10),[watch,setWatch]=useState<Range|null>(null),[failure,setFailure]=useState('');
 const video=useRef<HTMLVideoElement>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 const start=watch?Math.max(0,watch.start-1):0,end=watch?Math.min(project.media.duration,watch.end+1):0;
 useEffect(()=>{if(watch){dialog.current?.showModal();}else if(dialog.current?.open){video.current?.pause();dialog.current.close();trigger.current?.focus();}},[watch]);
 useEffect(()=>{setWatch(null);setLimit(10);},[project.id]);
 function close(){video.current?.pause();setWatch(null);setFailure('');}
 function play(){const v=video.current;if(!v)return;v.currentTime=start;void v.play().catch(()=>setFailure('Pulsa reproducir en el vídeo para escuchar este intervalo.'));}
 return <section className="cut-review"><strong>{gaps.length} tramos recortados · {gaps.reduce((n,g)=>n+g.end-g.start,0).toFixed(1)} s</strong><p>Comprueba el original con un segundo de contexto antes y después de cada corte.</p>{gaps.slice(0,limit).map(g=><div className="cut-row" key={g.start}><span>{timestamp(g.start)} → {timestamp(g.end)}<small>{(g.end-g.start).toFixed(1)} s eliminados</small></span><button onClick={e=>{onPause();trigger.current=e.currentTarget;setWatch(g);}}>Ver y escuchar</button><button disabled={busy} onClick={()=>onKeep(g.start,g.end)}>Conservar</button></div>)}{gaps.length>limit?<button onClick={()=>setLimit(n=>n+10)}>Ver siguientes cortes ({gaps.length-limit})</button>:null}{!gaps.length?<p>Se conserva toda la grabación original.</p>:null}
 <dialog ref={dialog} className="cut-dialog" aria-labelledby="cut-title" onCancel={e=>{e.preventDefault();close();}} onClose={()=>setWatch(null)}><header><h2 id="cut-title">Revisar tramo recortado</h2><button onClick={close}>Cerrar</button></header>{watch?<><p>El corte va de <b>{timestamp(watch.start)}</b> a <b>{timestamp(watch.end)}</b>. Estás viendo el original con contexto.</p><video ref={video} key={`${project.id}:${watch.start}`} controls src={`/api/projects/${project.id}/media`} onLoadedMetadata={play} onTimeUpdate={()=>{if(video.current&&video.current.currentTime>=end)video.current.pause();}}/><div className="cut-dialog-actions"><button onClick={play}>Volver a escuchar</button><button disabled={busy} onClick={()=>{onKeep(watch.start,watch.end);close();}}>Conservar este tramo</button><button onClick={close}>Mantener el corte</button></div>{failure?<p role="status">{failure}</p>:null}</>:null}</dialog></section>;
}
