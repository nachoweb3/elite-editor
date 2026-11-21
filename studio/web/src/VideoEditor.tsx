import {MediaGallery,type GalleryItem} from './MediaGallery';
import {LibrarySidebar} from './LibrarySidebar';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player,type PlayerRef} from '@remotion/player';
import {CompositionRenderer} from './Composition';
import {buildComposition} from '../../shared/composition.mjs';
import {StudioTools} from './StudioTools';
import type {Project,Clip,CompositionSpec} from './types';
import './editor.css';
import {clock as clipClock,sourceAtMontage,montageAtSource,montagePartMarkers,restoreRange} from './timeline';
import {Workflow,automaticPreferences,type AutoOptions} from './Workflow';
import {Guia,type GuiaStep} from './Guia';
import {AudioInspector,AudioLanes} from './AudioEditor';
import type {AudioTrack,AudioAsset} from './types';
import {AIInterventions} from './AIInterventions';
import {AuthGate} from './AuthGate';
import {PlanPanel} from './PlanPanel';
import {Shortcuts} from './Shortcuts';
import {Toasts,useToasts} from './Toasts';
import {ExportDialog} from './ExportDialog';
import type {Settings} from './types';
import {resolveAutomationProfile} from '../../server/automation-options.mjs';
import {StartHub} from './StartHub';
import {VersionsDialog} from './VersionsDialog';
import {TranscriptTools} from './TranscriptTools';
import {indexMontageTranscript,montageChapters} from './transcript-index';
import {PartsDialog,orderParts,partsPayload} from './PartsDialog';
import {StudioHeader,initialWorkspaceView,saveWorkspaceView} from './StudioHeader';
import {readStudioTheme,saveStudioTheme} from './studio-theme';
import {ClipTransitionSelect} from './ClipTransitionSelect';
import './studio-theme.css';

type EditClip=Clip&{sourceId:string;sourceName:string;sourceDuration:number;transitionIn?:string;motion?:string};
type EditProject=Omit<Project,'clips'>&{clips:EditClip[];audioTracks:AudioTrack[]};
type Recovery={at:number;revision:number;clips:EditClip[];audioTracks:AudioTrack[];settings:Project['settings']};
function readRecovery(id:string,revision:number):Recovery|null{
 try{const raw=JSON.parse(localStorage.getItem('nacho:recovery:'+id)||'null');if(!raw||!Array.isArray(raw.clips)||!raw.clips.length)return null;if(Number(raw.revision)<revision)return null;return raw as Recovery;}catch{return null;}
}
let token='';
async function api<T>(route:string,data?:unknown):Promise<T>{const response=await fetch('/api'+route,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':token},body:data===undefined?undefined:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw new Error(value.error||'No se pudo completar la operación');return value;}
const total=(clips:EditClip[])=>clips.reduce((sum,c)=>sum+c.end-c.start,0);
const JOB_LABELS:Record<string,string>={'auto-review':'Analizando la voz y montando…',autopilot:'Montando y exportando…',render:'Exportando el vídeo…',preview:'Generando la vista previa…'};
function normalize(p:Project,library:Project[]):EditProject{return {...p,audioTracks:(p as EditProject).audioTracks||[],clips:p.clips.filter(c=>c.enabled).map(c=>{const v=c as EditClip,owner=library.find(s=>s.id===v.sourceId)||p;return {...c,sourceId:v.sourceId||p.id,sourceName:v.sourceName||owner.name,sourceDuration:v.sourceDuration||owner.media.duration};})};}
const GUIA:GuiaStep[]=[
 {target:'medios',title:'Tus vídeos',text:'La biblioteca guarda todo lo que importas. «＋» añade un vídeo al final del montaje y «Abrir proyecto» carga los cortes ya guardados de ese proyecto.'},
 {target:'flujo',title:'El camino corto',text:'Importar, editar automáticamente y revisar. El editor automático analiza la voz, quita silencios y coloca subtítulos; después ajustas lo que quieras a mano.'},
 {target:'monitor',title:'El monitor',text:'Compara tres vistas: la edición en directo, tu grabación original y el resultado renderizado. El selector de la derecha conserva el formato original o permite elegir un formato de entrega.'},
 {target:'propiedades',title:'Propiedades del clip',text:'Con un clip seleccionado ajustas entrada y salida exactas, transición y movimiento de cámara. En «Imagen y voz» están exposición, contraste, limpieza de voz y subtítulos.'},
 {target:'linea',title:'La línea de tiempo',text:'Arrastra los clips para ordenarlos y tira de sus bordes para recortar. S divide en el cursor, Supr elimina y la barra espaciadora reproduce. La fila inferior lleva música y efectos.'},
 {target:'exportar',title:'Exportar',text:'Cuando el montaje esté listo, Exportar vídeo renderiza el MP4 con los efectos. Al terminar aparece Descargar final, arriba y bajo el monitor, con un nombre legible.'},
];
export function Editor(){
 const [showGallery,setShowGallery]=useState(false),[galleryVersion,setGalleryVersion]=useState(0),[showPlan,setShowPlan]=useState(()=>new URLSearchParams(location.search).has('plan')),[showShortcuts,setShowShortcuts]=useState(false);
 const [workspace,setWorkspace]=useState(initialWorkspaceView),[dragging,setDragging]=useState(false);
 const [theme,setTheme]=useState(readStudioTheme);
 const toasts=useToasts();
 const [guia,setGuia]=useState(()=>!localStorage.getItem('nacho:guia-vista'));
 const [before,setBefore]=useState(false),[toolTab,setToolTab]=useState('prompt'),[audioRequest,setAudioRequest]=useState(0),[audioId,setAudioId]=useState<string|null>(null);const labels=useRef<HTMLDivElement>(null);
 const [library,setLibrary]=useState<Project[]>([]),[draft,setDraft]=useState<EditProject|null>(null),[dirty,setDirty]=useState(false),[selected,setSelected]=useState<string|null>(null),[time,setTime]=useState(0),[zoom,setZoom]=useState(30),[working,setWorking]=useState(false),[saving,setSaving]=useState(false),[lastSavedAt,setLastSavedAt]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uploadProgress,setUploadProgress]=useState<number|null>(null),[inspector,setInspector]=useState('clip'),[showTools,setShowTools]=useState(false),[result,setResult]=useState(false),[ready,setReady]=useState(false);
 const [showHub,setShowHub]=useState(false),[showVersions,setShowVersions]=useState(false),[showExport,setShowExport]=useState(false);
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[recovery,setRecovery]=useState<Recovery|null>(null);
 const [parts,setParts]=useState<{files:File[];numbered:boolean;options?:AutoOptions}|null>(null);
 const preferAutomatic=new URLSearchParams(location.search).get('workspace')==='automatic';
 const importOptions=useRef<AutoOptions|undefined>(undefined);
 const workflowImport=useRef<HTMLButtonElement>(null);
 const importAsProject=useRef(true),media=useRef<HTMLVideoElement>(null),pendingSeek=useRef<number|null>(null),player=useRef<PlayerRef>(null),fileInput=useRef<HTMLInputElement>(null),scroll=useRef<HTMLDivElement>(null),draftRef=useRef(draft),dirtyRef=useRef(dirty),undo=useRef<EditProject[]>([]),redo=useRef<EditProject[]>([]),dragId=useRef(''),trim=useRef<{before:EditProject;id:string;side:'start'|'end';x:number}|null>(null),changeSeq=useRef(0),savePromise=useRef<Promise<Project>|null>(null),autosaveBlocked=useRef(false),[historyTick,setHistoryTick]=useState(0);
 draftRef.current=draft;dirtyRef.current=dirty;
 const resultKind=draft?.artifacts.export?'export':'preview';
 const monitorInput=useMemo(()=>({composition:draft?buildComposition(draft,{sources:library}) as CompositionSpec:null}),[draft,library]);
 const {composition:previewComposition}=monitorInput;
 const monitorFps=previewComposition?.fps||30;
 const stepDuration=1/monitorFps;
 const snap=(seconds:number)=>Math.round(seconds*monitorFps)/monitorFps;
 const stamp=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}.${String(Math.floor(seconds%1*monitorFps)).padStart(2,'0')}`;
 const job=draft?.jobs.at(-1),busy=working||!!job&&['queued','running'].includes(job.status),duration=draft?total(draft.clips):0,clip=draft?.clips.find(c=>c.id===selected),landscape=draft?.settings.profile.startsWith('youtube'),id=draft?.id;
 const aiMedia=((draft as any)?.automatic?.direction?.media as Array<{kind:string;name:string;description?:string;reason?:string;outputTime:number;duration?:number;provider?:string;license?:string;author?:string;page?:string;attribution?:string;status?:string}>|undefined)?.filter(m=>m.status!=='rejected');
 const selectedAudio=draft?.audioTracks.find(t=>t.id===audioId);
 const savedLabel=saving?'Guardando…':dirty?'● Cambios sin guardar':lastSavedAt?`Guardado ${new Date(lastSavedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:'Guardado local';
 function changeAudio(trackId:string,change:Partial<AudioTrack>){mutate(p=>({...p,audioTracks:p.audioTracks.map(t=>t.id===trackId?{...t,...change}:t)}));}
 function addAudio(asset:AudioAsset,at=time){if(!draft||busy)return;if(draft.audioTracks.length>=64){setError('Máximo 64 clips de audio');return;}const track:AudioTrack={id:crypto.randomUUID(),assetId:asset.id,name:asset.name,kind:asset.kind,sourceDuration:asset.duration,at:Math.max(0,snap(at)),sourceIn:0,duration:asset.duration,volume:asset.kind==='music'?.15:.3,fadeIn:0,fadeOut:0,muted:false,locked:false};mutate(p=>({...p,audioTracks:[...p.audioTracks,track]}));setAudioId(track.id);setSelected(null);}
 function addMeme(item:{id:string;name:string;kind:string;duration:number},at:number){if(!draft||busy)return;const meme={kind:'meme',name:item.name,description:'',reason:'Añadido manualmente',outputTime:at,duration:item.duration||3.2,resourceId:item.id,status:'accepted'};mutate(p=>{const prev=(p as any).automatic||{};const prevDir=prev.direction||{};const media=Array.isArray(prevDir.media)?[...prevDir.media]:[];media.push(meme);return {...p,automatic:{...prev,direction:{...prevDir,media}}};});setNotice(`Meme «${item.name}» añadido en ${stamp(at)}`);}
 function accept(p:Project,items=library){if(p.id!==draftRef.current?.id){setTime(0);undo.current=[];redo.current=[];setLastSavedAt(null);setRecovery(readRecovery(p.id,p.revision));}setBefore(false);setAudioId(null);const next=normalize(p,items);draftRef.current=next;dirtyRef.current=false;setDraft(next);setDirty(false);setSelected(next.clips[0]?.id||null);setSelectedIds(next.clips[0]?[next.clips[0].id]:[]);localStorage.setItem('nacho:editor-project',p.id);}
 function sync(p:Project){const next=normalize(p,library);draftRef.current=next;dirtyRef.current=false;setDraft(next);setDirty(false);setLibrary(items=>items.map(x=>x.id===p.id?p:x));setBefore(false);setResult(false);}
 useEffect(()=>{let active=true;Promise.all([api<{token:string}>('/session'),api<Project[]>('/projects')]).then(([session,items])=>{if(!active)return;token=session.token;setLibrary(items);setReady(true);const explicit=new URLSearchParams(location.search).get('project');const saved=explicit||(preferAutomatic?localStorage.getItem('nacho:last-project'):null)||localStorage.getItem('nacho:editor-project')||localStorage.getItem('nacho:last-project');const p=items.find(p=>p.id===saved);if(p)accept(p,items);if(!explicit&&!preferAutomatic)setShowHub(true);}).catch(e=>setError(e.message));return()=>{active=false;};},[preferAutomatic]);
 useEffect(()=>{if(!id)return;let active=true,inflight=false;const interval=setInterval(async()=>{if(inflight)return;inflight=true;try{const p=await api<Project>(`/projects/${id}`);if(active&&!dirtyRef.current&&p.revision>=(draftRef.current?.revision||0)){setDraft(normalize(p,library));setLibrary(items=>items.map(x=>x.id===id?p:x));}}catch(e){if(active)setError((e as Error).message);}finally{inflight=false;}},1800);return()=>{active=false;clearInterval(interval);};},[id]);
 useEffect(()=>{if(job?.status==='done'&&['autopilot','auto-review','preview','render'].includes(job.type)){setBefore(false);setResult(true);};},[job?.id,job?.status]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{
  if(!dirty||!draft||busy||saving||autosaveBlocked.current)return;
  const timer=window.setTimeout(()=>{void persistProject(true).catch(e=>{autosaveBlocked.current=true;setError((e as Error).message);});},1200);
  return()=>window.clearTimeout(timer);
 },[dirty,draft,busy,saving]);
 useEffect(()=>{
  if(!draft||!dirty)return;
  const timer=window.setTimeout(()=>{try{localStorage.setItem('nacho:recovery:'+draft.id,JSON.stringify({at:Date.now(),revision:draft.revision,clips:draft.clips,audioTracks:draft.audioTracks,settings:draft.settings}));}catch{}} ,900);
  return()=>window.clearTimeout(timer);
 },[draft,dirty]);
 useEffect(()=>{if(error){toasts.notify('error',error);setError('');}},[error,toasts.notify]);
 useEffect(()=>{if(notice){toasts.notify('success',notice);setNotice('');}},[notice,toasts.notify]);
 useEffect(()=>{toasts.progress(uploadProgress===null?null:`Importando ${uploadProgress}%`,uploadProgress??0,'El archivo se copia a este equipo.');},[uploadProgress,toasts.progress]);
 useEffect(()=>{saveWorkspaceView(workspace);},[workspace]);
 useEffect(()=>{saveStudioTheme(theme);},[theme]);
 useEffect(()=>{const open=(event:Event)=>{event.preventDefault();setShowPlan(true);};window.addEventListener('nacho:plan',open);return()=>window.removeEventListener('nacho:plan',open);},[]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||showPlan||showShortcuts||showGallery||showTools||showExport||guia||document.querySelector('[aria-modal=true]'))return;
   if(event.key==='Escape'&&workspace!=='editor'){setWorkspace('editor');return;}
   if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;
   if(event.key==='?'){event.preventDefault();setShowShortcuts(true);}
   else if((event.key==='f'||event.key==='F')&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.repeat){
    event.preventDefault();
    const target=event.shiftKey?'focus':'cinema';
    setWorkspace(value=>value===target?'editor':target);
   }
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[workspace,showPlan,showShortcuts,showGallery,showTools,showExport,guia]);
 useEffect(()=>{const p=player.current;if(!p)return;let last=0;const listener=(e:{detail:{frame:number}})=>{if(performance.now()-last>80){setTime(e.detail.frame/monitorFps);last=performance.now();}};p.addEventListener('frameupdate',listener);return()=>p.removeEventListener('frameupdate',listener);},[id,result,before,monitorFps]);
 function mutate(fn:(p:EditProject)=>EditProject){if(!draft||busy)return;changeSeq.current++;autosaveBlocked.current=false;dirtyRef.current=true;undo.current=[...undo.current,draft].slice(-50);redo.current=[];setDraft(fn(draft));setDirty(true);setBefore(false);setResult(false);setHistoryTick(x=>x+1);setNotice('');}
 function history(back:boolean){if(!draft||busy)return;const src=back?undo:redo,dest=back?redo:undo,next=src.current.pop();if(!next)return;dest.current.push(draft);changeSeq.current++;autosaveBlocked.current=false;dirtyRef.current=true;setDraft({...next,revision:draft.revision,jobs:draft.jobs});setDirty(true);setBefore(false);setResult(false);setHistoryTick(x=>x+1);}
 function seek(t:number){const pos=Math.max(0,Math.min(duration-stepDuration,t));pendingSeek.current=pos;setBefore(false);setResult(false);if(player.current&&!before&&!result){player.current.seekTo(Math.round(pos*monitorFps));pendingSeek.current=null;}setTime(pos);}
 function revealTime(at:number){
  seek(at);
  const viewport=scroll.current,pixel=at*zoom;
  if(viewport&&(pixel<viewport.scrollLeft||pixel>viewport.scrollLeft+viewport.clientWidth-24))viewport.scrollLeft=Math.max(0,pixel-80);
 }
 function togglePlayback(){const v=media.current;if(v){if(v.paused)void v.play().catch(e=>setError('No se pudo reproducir: '+e.message));else v.pause();}else player.current?.toggle();}
 function step(delta:number){if(media.current){const v=media.current;v.pause();v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+delta));}else seek(time+delta);}
 useEffect(()=>{if(!before&&!result&&player.current){player.current.seekTo(Math.round((pendingSeek.current??time)*monitorFps));pendingSeek.current=null;}},[id,before,result,monitorFps]);
 function split(){if(!draft||busy)return;let offset=0;for(const c of draft.clips){const length=c.end-c.start;if(time>offset+stepDuration&&time<offset+length-stepDuration){const cut=snap(c.start+time-offset),newId=crypto.randomUUID();mutate(p=>({...p,clips:p.clips.flatMap(x=>x.id===c.id?[{...x,end:cut},{...x,id:newId,start:cut,transitionIn:'none'}]:[x])}));setSelected(newId);setSelectedIds([newId]);return;}offset+=length;}setNotice('Mueve el cabezal al interior de un clip para dividirlo.');}
 function remove(){if(selectedAudio){if(!selectedAudio.locked)mutate(p=>({...p,audioTracks:p.audioTracks.filter(t=>t.id!==audioId)}));setAudioId(null);return;}if(!draft||draft.clips.length<2)return;const ids=selectedIds.length?selectedIds:(selected?[selected]:[]);if(!ids.length)return;const keep=draft.clips.filter(c=>!ids.includes(c.id));if(!keep.length)return;mutate(p=>({...p,clips:p.clips.filter(c=>!ids.includes(c.id))}));setSelected(keep[0].id);setSelectedIds([keep[0].id]);seek(0);}
 function pick(id:string,event:React.MouseEvent){setAudioId(null);if(event.shiftKey&&selected){const ids=draft?.clips.map(c=>c.id)||[],a=ids.indexOf(selected),b=ids.indexOf(id);if(a>=0&&b>=0){setSelectedIds(ids.slice(Math.min(a,b),Math.max(a,b)+1));setSelected(id);return;}}if(event.ctrlKey||event.metaKey){setSelectedIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);setSelected(id);return;}setSelectedIds([id]);setSelected(id);}
 function duplicate(){if(!draft||busy)return;const ids=selectedIds.length?selectedIds:(selected?[selected]:[]);if(!ids.length)return;const copies=draft.clips.filter(c=>ids.includes(c.id)).map(c=>({...c,id:crypto.randomUUID()}));if(!copies.length)return;mutate(p=>({...p,clips:[...p.clips,...copies]}));setSelected(copies[0].id);setSelectedIds(copies.map(c=>c.id));setNotice(`${copies.length} clip(s) duplicados al final de la línea de tiempo.`);}
 function focusClip(index:number){const target=offsets[index];if(!target)return;setSelected(target.c.id);setSelectedIds([target.c.id]);seek(target.start);document.querySelector<HTMLElement>(`[data-clip="${target.c.id}"]`)?.focus();}
 function restoreRecovery(){if(!recovery||!draft)return;changeSeq.current++;autosaveBlocked.current=false;undo.current=[...undo.current,draft].slice(-50);redo.current=[];dirtyRef.current=true;setDraft({...draft,clips:recovery.clips,audioTracks:recovery.audioTracks,settings:recovery.settings});setDirty(true);setRecovery(null);setNotice('Cambios sin guardar recuperados. Se guardan solos en unos segundos.');}
 function discardRecovery(){if(draft)localStorage.removeItem('nacho:recovery:'+draft.id);setRecovery(null);}
 async function copyExportPath(){const file=(draft?.artifacts.export as {file?:string}|undefined)?.file;if(!file)return;try{await navigator.clipboard.writeText(file);setNotice('Ruta del MP4 copiada.');}catch{setError('El navegador no permitió copiar la ruta. Puedes descargar el archivo.');}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||busy||showTools||document.querySelector('dialog[open], [aria-modal="true"]')||(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,button,a,audio,video,[contenteditable=true]')))return;if(workspace==='cinema'&&e.code!=='Space'&&e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;if(e.code==='Space'){e.preventDefault();togglePlayback();}else if(e.key.toLowerCase()==='s'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();split();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}else if(e.key==='ArrowLeft'){e.preventDefault();step(-stepDuration);}else if(e.key==='ArrowRight'){e.preventDefault();step(stepDuration);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[draft,selected,audioId,time,busy,historyTick,before,result,showTools,workspace,stepDuration]);
 async function act(fn:()=>Promise<void>){setWorking(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setWorking(false);}}
 async function persistProject(silent=false){
  if(savePromise.current)return savePromise.current;
  const current=draftRef.current;if(!current)throw new Error('Importa un vídeo');
  const projectId=current.id,revision=current.revision,seq=changeSeq.current;
  const task=(async()=>{
   const p=await api<Project>(`/projects/${projectId}/manual`,{revision,clips:current.clips,audioTracks:current.audioTracks,settings:current.settings});
   setLibrary(items=>items.map(x=>x.id===p.id?p:x));
   if(draftRef.current?.id===projectId){
    const stillDirty=changeSeq.current!==seq;if(!stillDirty)localStorage.removeItem('nacho:recovery:'+projectId);
    const latest=draftRef.current;
    const next={...latest,revision:p.revision,reviewed:p.reviewed,artifacts:p.artifacts,jobs:p.jobs,automatic:p.automatic??latest.automatic,transcript:p.transcript??latest.transcript};
    draftRef.current=next;setDraft(next);
    dirtyRef.current=stillDirty;setDirty(stillDirty);setLastSavedAt(Date.now());
    if(!stillDirty&&!silent)setNotice('Montaje guardado.');
   }
   return p;
  })();
  savePromise.current=task;setSaving(true);
  try{return await task;}finally{if(savePromise.current===task){savePromise.current=null;setSaving(false);}}
 }
 async function save(){autosaveBlocked.current=false;return persistProject(false);}
 async function flushPendingSave(){
  if(savePromise.current)await savePromise.current;
  if(dirtyRef.current)await persistProject(true);
  if(dirtyRef.current)await persistProject(true);
  if(dirtyRef.current)throw new Error('No se pudieron guardar los cambios. El proyecto no se ha cambiado.');
 }
 function openExport(){
  const current=draftRef.current;
  if(!current)return;
  if(!savePromise.current&&!dirtyRef.current){setShowExport(true);return;}
  void act(async()=>{
   await flushPendingSave();
   if(draftRef.current?.id===current.id)setShowExport(true);
  });
 }
 async function submitExport(revision:number){
  if(dirtyRef.current||draftRef.current?.revision!==revision)throw new Error('El montaje cambió. Vuelve a comprobarlo antes de exportar.');
  await queue('render',{preflightRevision:revision,approveAfterPreflight:true});
  setShowExport(false);
 }
 async function setExportSettings(settings:Partial<Pick<Settings,'encoder'|'profile'|'frameRate'|'exportQuality'>>){
  const current=draftRef.current;
  if(!current||dirtyRef.current)throw new Error('Guarda los cambios para ajustar la exportación.');
  const updated=await api<Project>(`/projects/${current.id}/settings`,{revision:current.revision,settings});
  if(draftRef.current?.id===current.id&&!dirtyRef.current)sync(updated);
 }
 async function openProject(projectId:string):Promise<boolean>{
  setWorking(true);setError('');
  try{
   if(draftRef.current?.id===projectId)return true;
   await flushPendingSave();
   const p=await api<Project>(`/projects/${projectId}`);
   accept(p,library);undo.current=[];redo.current=[];setTime(0);setResult(false);
   return true;
  }catch(e){autosaveBlocked.current=true;setError((e as Error).message);return false;}finally{setWorking(false);}
 }
 async function queue(type:string,options?:Partial<AutoOptions>|{preflightRevision:number;approveAfterPreflight:true}){
  if(!draft?.clips.length)throw new Error('Añade un vídeo al lienzo antes de procesarlo');
  const automatic=type==='auto-review'||type==='autopilot';
  if(automatic&&draft.clips.some(c=>c.sourceId!==draft.id))throw new Error('Para montar automáticamente varias partes, vuelve a seleccionarlas juntas al importar. También puedes seguir editando este proyecto en la línea de tiempo.');
  player.current?.pause();media.current?.pause();
  await flushPendingSave();
  const current=draftRef.current!;
  const checkedExport=type==='render'&&options&&'approveAfterPreflight' in options;
  const p=!automatic&&!checkedExport&&!current.reviewed?await save():current;
  await api(`/projects/${p.id}/job`,{type,options});
  if(automatic)localStorage.setItem('nacho:last-project',p.id);
  accept(await api<Project>(`/projects/${p.id}`));
 }
 async function cancel(){if(!draft||!job)return;player.current?.pause();media.current?.pause();accept(await api<Project>(`/projects/${draft.id}/job/cancel`,{jobId:job.id}));}
 function chooseVideo(asProject:boolean,options?:AutoOptions){
  importAsProject.current=asProject;importOptions.current=options;fileInput.current?.click();
 }
 async function upload(body:Blob,route:string,asProject:boolean,options?:AutoOptions){
  if(asProject)await flushPendingSave();
  setUploadProgress(0);
  let p:Project;
  try{
   p=await new Promise<Project>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',route);
    xhr.setRequestHeader('X-Studio-Token',token);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.round(e.loaded/e.total*100));};
    xhr.onerror=()=>reject(new Error('No se pudo importar el vídeo. Comprueba que el motor local sigue abierto.'));
    xhr.onload=()=>{
     try{const value=JSON.parse(xhr.responseText);xhr.status<300?resolve(value):reject(new Error(value.error));}
     catch{reject(new Error('Respuesta de importación inválida'));}
    };
    xhr.send(body);
   });
  }finally{setUploadProgress(null);}
  setLibrary(items=>[p,...items]);
  if(!asProject&&draft){setNotice('Vídeo añadido a la biblioteca. Pulsa + en su tarjeta para incorporarlo al montaje actual.');return;}
  setShowHub(false);setResult(false);
  if(options){
   accept(p,[p,...library]);
   localStorage.setItem('nacho:last-project',p.id);
   try{await api(`/projects/${p.id}/job`,{type:'autopilot',options});accept(await api<Project>(`/projects/${p.id}`),[p,...library]);}
   catch(e){setError(`Proyecto importado. No se pudo iniciar el montaje automático: ${(e as Error).message}`);}
   return;
  }
  const initial={...p,settings:{...p.settings,profile:resolveAutomationProfile(p.media),subtitlePosition:'top'}};
  accept(initial,[p,...library]);dirtyRef.current=true;setDirty(true);
  setNotice('Vídeo listo. Pulsa «Editar automáticamente» o ajústalo en la línea de tiempo.');
 }
 function importFiles(files:File[],asProject:boolean,options?:AutoOptions){
  if(!files.length)return;
  if(files.length>12){setError('Selecciona hasta 12 partes para unir en un proyecto.');return;}
  if(files.length>1){
   if(!asProject){setError('Para unir varias partes, impórtalas como proyecto desde el monitor o el flujo de montaje.');return;}
   setParts({...orderParts(files),options});return;
  }
  const [file]=files;
  void act(()=>upload(file,'/api/upload?'+new URLSearchParams({name:file.name}),asProject,options));
 }
 async function combineParts(name:string,files:File[]){
  setWorking(true);
  try{await upload(partsPayload(name,files),'/api/projects/join-parts',true,parts?.options);setParts(null);}
  finally{setWorking(false);}
 }
 async function refreshGallery(){setLibrary(await api<Project[]>('/projects'));setGalleryVersion(n=>n+1);}
 async function createBlank(name='Proyecto sin título',profile='youtube'){await flushPendingSave();const p=await api<Project>('/projects/new',{name,profile});setLibrary(items=>[p,...items]);accept(p);setResult(false);setNotice('Lienzo vacío. Abre la galería y añade archivos al montaje.');}
 function useGallery(item:GalleryItem){if(item.type==='project'){const p=library.find(p=>p.id===item.id);if(p)add(p);}else addAudio({...item,tags:[],license:item.license||''});}
 async function openTool(tab:string){if(tab==='audio'){setWorkspace('editor');setAudioRequest(attempt=>attempt+1);return;}await act(async()=>{await flushPendingSave();setToolTab(tab);setShowTools(true);});}
 function add(p:Project){if(!draft){accept(p);undo.current=[];redo.current=[];return;}const c:EditClip={id:crypto.randomUUID(),sourceId:p.id,sourceName:p.name,sourceDuration:p.media.duration,start:0,end:p.media.duration,enabled:true,reason:'Añadido desde biblioteca'};mutate(d=>({...d,clips:[...d.clips,c]}));setSelected(c.id);setSelectedIds([c.id]);}
 function reorder(target:string){const from=dragId.current;if(!from||from===target||busy)return;mutate(p=>{const clips=[...p.clips],a=clips.findIndex(c=>c.id===from),b=clips.findIndex(c=>c.id===target);if(a<0||b<0)return p;const [item]=clips.splice(a,1);clips.splice(b,0,item);return {...p,clips};});dragId.current='';}
 function trimStart(e:React.PointerEvent<HTMLButtonElement>,c:EditClip,side:'start'|'end'){if(!draft||busy)return;e.preventDefault();e.stopPropagation();player.current?.pause();changeSeq.current++;autosaveBlocked.current=false;dirtyRef.current=true;trim.current={before:draft,id:c.id,side,x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}
 function trimMove(e:React.PointerEvent<HTMLButtonElement>){const t=trim.current;if(!t)return;const c=t.before.clips.find(c=>c.id===t.id)!;const delta=(e.clientX-t.x)/zoom;const change=t.side==='start'?{start:Math.max(0,Math.min(c.end-stepDuration,snap(c.start+delta)))}:{end:Math.min(c.sourceDuration,Math.max(c.start+stepDuration,snap(c.end+delta)))};changeSeq.current++;autosaveBlocked.current=false;setDraft({...t.before,clips:t.before.clips.map(x=>x.id===c.id?{...x,...change}:x)});setDirty(true);setBefore(false);setResult(false);}
 function trimEnd(){if(!trim.current)return;undo.current.push(trim.current.before);redo.current=[];trim.current=null;setHistoryTick(x=>x+1);}
 const transcriptIndex=useMemo(()=>{
  if(!id||!draft?.clips)return [];
  const transcripts=new Map(library.map(p=>[p.id,p.transcript]));
  if(draft.transcript)transcripts.set(id,draft.transcript);
  return indexMontageTranscript(draft.clips,transcripts,id);
 },[id,draft?.clips,draft?.transcript,library]);
 const chapters=useMemo(()=>montageChapters(transcriptIndex,duration),[transcriptIndex,duration]);
 const sourcePartMarkers=useMemo(()=>{
  if(!id||!draft?.clips)return [];
  const sources=new Map(library.flatMap(project=>project.sourceParts?[[project.id,project.sourceParts] as const]:[]));
  if(draft.sourceParts)sources.set(id,draft.sourceParts);
  return montagePartMarkers(draft.clips,id,sources);
 },[id,draft?.clips,draft?.sourceParts,library]);
 const offsets=useMemo(()=>{let sum=0;return draft?.clips.map(c=>{const start=sum;sum+=c.end-c.start;return {c,start,length:c.end-c.start};})||[];},[draft?.clips]);
 const width=Math.max(800,duration*zoom,...(draft?.audioTracks||[]).map(t=>(t.at+t.duration)*zoom+30)),tick=zoom>=40?1:zoom>=10?5:zoom>=3?15:60;
 const chapterMarks=chapters.map((chapter,i)=><button key={chapter.time} type="button" className="nle-chapter" style={{left:chapter.time*zoom}}
  title={`${clipClock(chapter.time)} · ${chapter.title}`} aria-label={`Capítulo ${i+1}: ${chapter.title}`} onClick={event=>{event.stopPropagation();revealTime(chapter.time);}}/>);
 const partMarks=sourcePartMarkers.map(part=><button key={part.key} type="button" className="nle-part-marker" style={{left:Math.max(0,part.time*zoom-8)}}
  title={`${clipClock(part.time)} · Parte ${part.index} · ${part.name}`} aria-label={`Ir a la parte ${part.index}: ${part.name}`}
  onClick={event=>{event.stopPropagation();revealTime(part.time);}}>{part.index}</button>);
 const chapterTools=<TranscriptTools key={id} index={transcriptIndex} chapters={chapters} projectName={draft?.name||'Montaje'} onSeek={revealTime} onMessage={setNotice}/>;
 return <div className="nle" data-workspace={guia?'editor':workspace} data-has-project={Boolean(draft?.clips.length)}>
 <StudioHeader title={draft?.name||'Nuevo montaje'} status={savedLabel} view={workspace} onView={setWorkspace} theme={theme} onTheme={setTheme} projectActions={<>
  <button type="button" onClick={()=>setShowHub(true)}>Inicio</button>
  <button type="button" disabled={busy} onClick={()=>void act(()=>createBlank())}>Nuevo proyecto vacío</button>
  <button type="button" disabled={!draft||busy||saving||!dirty} onClick={()=>void act(async()=>{await save();})}>Guardar</button>
  <button type="button" disabled={!draft||busy} onClick={()=>setShowVersions(true)}>Versiones</button>
  {draft?<a href={`/api/projects/${draft.id}/package?download=1`} download title="Proyecto, vídeo original y audio en un .zip">Paquete .zip</a>:null}
  {draft?.artifacts.export?<button type="button" onClick={()=>void copyExportPath()}>Copiar ruta del MP4</button>:null}
  <button type="button" onClick={()=>setGuia(true)}>Guía</button>
  <button type="button" onClick={()=>setShowPlan(true)}>Plan</button>
 </>}>
  <button type="button" className="studio-library-button" aria-label="Galería multimedia" disabled={busy} onClick={()=>{player.current?.pause();media.current?.pause();setShowGallery(true);}}>Galería<span> multimedia</span></button>
  <button type="button" className="nle-help-button" onClick={()=>setShowShortcuts(true)} title="Atajos de teclado (?)" aria-label="Atajos de teclado">?</button>
  {!busy&&job&&['cancelled','interrupted','failed'].includes(job.status)?<button onClick={()=>void act(()=>queue(job.type,job.options))}>Reanudar</button>:null}
  <button data-guide="exportar" aria-label="Exportar vídeo" disabled={!draft?.clips.length||busy} className="nle-primary studio-export-button" onClick={openExport}>Exportar<span> vídeo ↗</span></button>
  {draft?.artifacts.export&&!dirty&&!busy?<a className="nle-header-download" href={`/api/projects/${draft.id}/artifact?type=export&download=1`}>↓ Descargar final</a>:null}
 </StudioHeader>
 <div className="nle-mobile-notice" role="status"><b>Edita en un ordenador.</b><span>La timeline necesita ratón y pantalla ancha; en el móvil puedes revisar el proyecto, no montarlo.</span><a href="https://nachoweb3.github.io/elite-editor-landing/">Volver a la web</a></div>
{recovery&&draft?<div className="nle-recovery" role="status"><span>Hay cambios sin guardar de las {new Date(recovery.at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}.</span><button type="button" onClick={restoreRecovery}>Recuperarlos</button><button type="button" onClick={discardRecovery}>Descartar</button></div>:null}
{busy&&job&&['queued','running'].includes(job.status)?<div className="nle-progress" role="status" aria-live="polite"><i aria-hidden="true"/><span>{job.message||JOB_LABELS[job.type]||'Procesando…'}</span><button type="button" onClick={()=>void act(cancel)}>Cancelar</button></div>:null}<Workflow key={id} importButton={workflowImport} preferAutomatic={preferAutomatic} ready={ready} onSeek={revealTime} onPause={()=>{player.current?.pause();media.current?.pause();}} project={draft} busy={busy} dirty={dirty} onImport={options=>chooseVideo(true,options)} onAuto={(options,finish)=>void act(()=>queue(finish?'autopilot':'auto-review',options))} onReview={()=>{setBefore(false);setResult(true);}} onRestore={()=>void act(async()=>{accept(await api<Project>(`/projects/${id}/undo`,{}));setResult(false);})} onTool={tab=>void openTool(tab)} onKeep={(start,end)=>mutate(p=>({...p,clips:restoreRange(p.clips,p.id,p.media.duration,{start,end},range=>({id:crypto.randomUUID(),sourceId:p.id,sourceName:p.name,sourceDuration:p.media.duration,...range,enabled:true,reason:'Restaurado al revisar el corte'}))}))}/>

 <div className="nle-workspace"><LibrarySidebar library={library} draft={draft} ready={ready} busy={busy} dirty={dirty} time={time} galleryVersion={galleryVersion} token={token} fileInput={fileInput} audioRequest={audioRequest} api={api} onAdd={add} onOpen={(p)=>void openProject(p.id)} onChooseVideo={chooseVideo} onAddAudio={addAudio} onAddMeme={addMeme} onProject={sync} onRefresh={()=>void refreshGallery()} onFile={files=>{const options=importOptions.current;importOptions.current=undefined;importFiles(files,importAsProject.current,options);}}/>
 <section className="nle-viewer"><div className="nle-viewer-head"><span>MONITOR</span><div><button aria-pressed={!result&&!before} onClick={()=>{setBefore(false);setResult(false);}}>Edición en directo</button><button aria-pressed={before} disabled={!draft||draft.blank} onClick={()=>setBefore(true)}>Original</button><button aria-pressed={result&&!before} disabled={dirty||(!draft?.artifacts.export&&!draft?.artifacts.preview)} onClick={()=>{setBefore(false);setResult(true);}}>{resultKind==='export'?'Vídeo exportado':'Resultado automático'}</button></div><select aria-label="Formato de salida" value={draft?.settings.profile||'youtube'} disabled={!draft||busy} onChange={e=>mutate(p=>({...p,settings:{...p.settings,profile:e.target.value}}))}><option value="source">Como el original</option><option value="youtube">16:9 · 1080p</option><option value="youtube4k">16:9 · 4K</option><option value="reels">9:16 · 1080p</option><option value="reels4k">9:16 · 4K</option></select></div><div className="nle-canvas" data-guide="monitor" onDragEnter={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragOver={e=>{e.preventDefault();if(!busy&&e.dataTransfer.types.includes('Files'))setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(!busy&&ready)importFiles(Array.from(e.dataTransfer.files),true,preferAutomatic&&!draft?automaticPreferences():undefined);}}>{draft&&!draft.clips.length?<div className="nle-empty"><div>＋</div><h1>Tu lienzo está vacío</h1><p>Añade vídeos, música o sonidos desde la galería.</p><button className="nle-primary" onClick={()=>setShowGallery(true)}>Abrir galería multimedia</button></div>:draft?before?<video ref={media} controls onLoadedMetadata={()=>{const at=draft&&sourceAtMontage(draft.clips,time);if(media.current)media.current.currentTime=at&&at.sourceId===id?at.time:0;}} onTimeUpdate={e=>setTime(montageAtSource(draft.clips,draft.id,e.currentTarget.currentTime))} src={`/api/projects/${id}/media`}/>:result&&draft.artifacts[resultKind]?<video ref={media} controls onLoadedMetadata={()=>{if(media.current)media.current.currentTime=Math.min(time,Math.max(0,media.current.duration-stepDuration));}} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} src={`/api/projects/${id}/artifact?type=${resultKind}&v=${draft.revision}`}/>:<Player ref={player} component={CompositionRenderer} inputProps={monitorInput} durationInFrames={Math.max(1,Math.round((previewComposition?.duration||0)*monitorFps))} fps={monitorFps} compositionWidth={previewComposition?.width||(landscape?1920:1080)} compositionHeight={previewComposition?.height||(landscape?1080:1920)} controls style={{width:'100%',height:'100%'}}/>:<div className="nle-empty"><div>▷</div><h1>Empieza tu montaje</h1><p>Arrastra un vídeo o impórtalo desde la biblioteca.</p><button className="nle-primary" disabled={!ready} onClick={()=>workflowImport.current?.click()}>{preferAutomatic?'Importar y montar':'Importar vídeo'}</button></div>}{dragging?<div className="nle-drop-hint" aria-hidden="true"><span>⇩</span><strong>Suelta uno o varios vídeos</strong><small>MP4, MOV, MKV o WEBM · puedes ordenar las partes</small></div>:null}</div><div className="nle-monitor-foot"><span>{stamp(time)} / {stamp(duration)}</span><button disabled={!draft||busy} onClick={()=>void act(()=>queue('preview'))}>Generar vista en calidad final</button><small>La edición en directo muestra el montaje. Genera una vista para comprobar rostro, transiciones y acabado.</small></div>{job&&['queued','running','failed'].includes(job.status)?<div role="status" className="nle-job">{job.status==='failed'?<><strong>No se pudo terminar el proceso.</strong><button disabled={busy} onClick={()=>void act(()=>queue(job.type,job.options))}>Reintentar</button><details><summary>Ver el motivo</summary><pre>{job.message}</pre></details></>:job.message}</div>:null}{draft?.artifacts.export&&!dirty?<a className="nle-download" href={`/api/projects/${id}/artifact?type=export&download=1`}>↓ Descargar vídeo terminado</a>:null}</section>
 <aside className="nle-inspector" data-guide="propiedades"><div className="nle-panel-title">PROPIEDADES</div><div className="nle-inspector-tabs"><button aria-pressed={inspector==='clip'} onClick={()=>{setInspector('clip');setAudioId(null);}}>Clip</button><button aria-pressed={inspector==='look'} onClick={()=>{setInspector('look');setAudioId(null);}}>Imagen y voz</button></div>{selectedAudio?<AudioInspector track={selectedAudio} busy={busy} videoDuration={duration} onChange={v=>changeAudio(selectedAudio.id,v)} onDelete={remove} onDuplicate={()=>{if(draft!.audioTracks.length>=64){setError('Máximo 64 clips de audio');return;}const copy={...selectedAudio,id:crypto.randomUUID(),at:selectedAudio.at+selectedAudio.duration};mutate(p=>({...p,audioTracks:[...p.audioTracks,copy]}));setAudioId(copy.id);}}/>:inspector==='clip'?clip?<fieldset disabled={busy}><h3>{clip.sourceName}</h3><label>Entrada del original<input type="number" step={stepDuration} min={0} max={clip.end-stepDuration} value={Number(clip.start.toFixed(3))} onChange={e=>{const v=Number(e.target.value);if(v>=0&&v<clip.end)mutate(p=>({...p,clips:p.clips.map(c=>c.id===clip.id?{...c,start:snap(v)}:c)}));}}/></label><label>Salida del original<input type="number" step={stepDuration} min={clip.start+stepDuration} max={clip.sourceDuration} value={Number(clip.end.toFixed(3))} onChange={e=>{const v=Number(e.target.value);if(v>clip.start&&v<=clip.sourceDuration)mutate(p=>({...p,clips:p.clips.map(c=>c.id===clip.id?{...c,end:snap(v)}:c)}));}}/></label><label>Entrada de transición<ClipTransitionSelect value={clip.transitionIn} onChange={transitionIn=>mutate(p=>({...p,clips:p.clips.map(c=>c.id===clip.id?{...c,transitionIn}:c)}))}/></label><label>Movimiento de cámara<select value={clip.motion||'none'} onChange={e=>mutate(p=>({...p,clips:p.clips.map(c=>c.id===clip.id?{...c,motion:e.target.value}:c)}))}><option value="none">Fijo</option><option value="dolly-in">Dolly in · acercarse</option><option value="dolly-out">Dolly out · alejarse</option><option value="zoom-crash">Crash zoom</option><option value="pan-left">Paneo a la izquierda</option><option value="pan-right">Paneo a la derecha</option><option value="tilt-up">Tilt ascendente</option><option value="ken-burns">Ken Burns</option></select></label><button onClick={()=>mutate(p=>({...p,clips:p.clips.map(c=>({...c,motion:clip.motion||'none'}))}))}>Aplicar este movimiento a todo el montaje</button><p>Duración: {stamp(clip.end-clip.start)}</p><button onClick={()=>mutate(p=>({...p,clips:p.clips.flatMap(c=>c.id===clip.id?[c,{...c,id:crypto.randomUUID()}]:[c])}))}>Duplicar clip</button><button disabled={draft!.clips.length<2} onClick={remove}>Eliminar clip</button></fieldset>:<p>Selecciona un clip en la línea de tiempo.</p>:draft?<fieldset disabled={busy}>{[['exposure','Exposición',-.15,.15],['contrast','Contraste',.7,1.4],['saturation','Saturación',0,1.5]].map(([key,label,min,max])=><label key={key}>{label}<input type="range" min={min} max={max} step={.01} value={draft.settings[key as 'exposure']} onChange={e=>mutate(p=>({...p,settings:{...p.settings,[key]:Number(e.target.value)}}))}/></label>)}<label><input type="checkbox" checked={draft.settings.cleanAudio} onChange={e=>mutate(p=>({...p,settings:{...p.settings,cleanAudio:e.target.checked}}))}/> Limpiar voz</label><label><input type="checkbox" checked={draft.settings.subtitles} onChange={e=>mutate(p=>({...p,settings:{...p.settings,subtitles:e.target.checked}}))}/> Subtítulos</label><label>Encuadre<select value={draft.settings.fit} onChange={e=>mutate(p=>({...p,settings:{...p.settings,fit:e.target.value}}))}><option value="contain">Imagen completa</option><option value="cover">Llenar pantalla</option></select></label></fieldset>:null}<div className="nle-ai"><h3>✦ Asistente de edición</h3><button disabled={!draft||busy} onClick={()=>void openTool('prompt')}>Rostro, instrucciones y texto</button>{dirty?<small>Guarda para abrir las herramientas.</small>:null}</div></aside></div>
  <AIInterventions defaultCollapsed={true} videoSrc={draft?`/api/projects/${id}/media`:undefined} project={draft as any} busy={busy} locked={dirty} api={api} onProject={sync} onSeek={t=>seek(t)}/>
 <section className="nle-timeline" data-guide="linea"><div className="nle-toolbar"><div><button title="Deshacer · Ctrl+Z" disabled={busy||!undo.current.length} onClick={()=>history(true)}>↶</button><button title="Rehacer · Ctrl+Mayús+Z" disabled={busy||!redo.current.length} onClick={()=>history(false)}>↷</button><span className="nle-separator"/><button disabled={!draft||busy} onClick={split}>✂ Dividir <kbd>S</kbd></button><button disabled={busy||(selectedAudio?selectedAudio.locked:!clip||draft!.clips.length<2)} onClick={remove}>Eliminar</button><button disabled={busy||(!clip&&!selectedIds.length)} onClick={duplicate} title="Duplicar la selección · Ctrl+D">Duplicar</button><button disabled={!draft} onClick={togglePlayback}>▶ / Ⅱ</button><span>{stamp(time)}</span></div><div className="nle-zoom" role="group" aria-label="Zoom de la línea de tiempo"><button type="button" title="Alejar" aria-label="Alejar" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,Math.round(value/1.5)))}>－</button><input aria-label="Nivel de zoom" type="range" min={1} max={100} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><button type="button" title="Acercar" aria-label="Acercar" disabled={zoom>=100} onClick={()=>setZoom(value=>Math.min(100,Math.round(value*1.5)))}>＋</button><output>{Math.round(zoom)} px/s</output><button type="button" onClick={()=>setZoom(Math.max(1,Math.min(100,((scroll.current?.clientWidth||900)-20)/Math.max(1,duration))))}>Ajustar</button></div>{chapterTools}</div><div className="nle-timeline-body"><div ref={labels} className="nle-track-labels"><div>TIEMPO</div><div>▣ VÍDEO</div><div>♫ VOZ DEL CLIP</div>{aiMedia?.length?<div className="nle-ai-label" role="button" tabIndex={0} title="Ir al primer meme o sonido" onClick={()=>{const first=Number(aiMedia[0].outputTime||0);seek(first);if(scroll.current)scroll.current.scrollLeft=Math.max(0,first*zoom-200);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const first=Number(aiMedia[0].outputTime||0);seek(first);if(scroll.current)scroll.current.scrollLeft=Math.max(0,first*zoom-200);}}}><span>✦ IA · {aiMedia.length}</span><div className="nle-ai-mini">{aiMedia.map((m,i)=><i key={`mini-${i}`} className={m.kind} style={{left:`${duration?Math.min(99,Math.max(0,Number(m.outputTime||0)/duration*100)):0}%`}}/>)}</div></div>:null}{draft?.audioTracks.map((t,i)=><div className="audio-label" key={t.id}><button onClick={()=>{setAudioId(t.id);setSelected(null);}} title={t.name}>{t.kind==='music'?'MÚSICA':'EFECTO'} {i+1}{t.muted?' · M':''}{t.locked?' · 🔒':''}</button></div>)}</div><div ref={scroll} className="nle-scroll" onScroll={e=>{if(labels.current)labels.current.scrollTop=e.currentTarget.scrollTop;}}><div className="nle-tracks" style={{width}}><div className="nle-ruler" onClick={e=>seek((e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom)}>{Array.from({length:Math.min(4000,Math.ceil(duration/tick)+1)},(_,i)=><span key={i} style={{left:i*tick*zoom}}>{stamp(i*tick).split('.')[0]}</span>)}{chapterMarks}{partMarks}</div><div className="nle-video-track">{offsets.map(({c,start,length},i)=><div key={c.id} data-clip={c.id} role="button" tabIndex={0} aria-pressed={selectedIds.includes(c.id)} aria-label={`Clip ${i+1}: ${c.sourceName}`} className={`nle-clip ${selectedIds.includes(c.id)?'selected':''}`} style={{left:start*zoom,width:Math.max(2,length*zoom)}} draggable={!busy&&!trim.current} onDragStart={e=>{dragId.current=c.id;e.dataTransfer.effectAllowed='move';}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();reorder(c.id);}} onKeyDown={e=>{const index=offsets.findIndex(entry=>entry.c.id===c.id);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();focusClip(Math.max(0,Math.min(offsets.length-1,index+(e.key==='ArrowRight'?1:-1))));}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();remove();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();seek(start);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();e.stopPropagation();duplicate();}else if(e.key==='Escape'){e.stopPropagation();setSelectedIds([]);}}} onClick={e=>{pick(c.id,e);seek(start+(e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom);}}><button aria-label={`Recortar entrada del clip ${i+1}`} className="nle-handle left" onPointerDown={e=>trimStart(e,c,'start')} onPointerMove={trimMove} onPointerUp={trimEnd} onPointerCancel={trimEnd}/><span>{i+1} · {c.sourceName}</span><small>{stamp(length)}</small><button aria-label={`Recortar salida del clip ${i+1}`} className="nle-handle right" onPointerDown={e=>trimStart(e,c,'end')} onPointerMove={trimMove} onPointerUp={trimEnd} onPointerCancel={trimEnd}/></div>)}</div><div className="nle-audio-track">{offsets.map(({c,start,length})=><div key={c.id} style={{left:start*zoom,width:Math.max(2,length*zoom)}}><span>Voz vinculada · {c.sourceName}</span></div>)}</div>{aiMedia?.length?<div className="nle-ai-track">{aiMedia.map((m,i)=><div key={`${m.kind}-${i}`} className={`nle-ai-item ${m.kind}`} style={{left:Math.max(0,Number(m.outputTime||0)*zoom),width:Math.max(16,Number(m.duration||2)*zoom)}} title={`${m.name}${m.reason?' · '+m.reason:''}${m.provider?' · '+m.provider:''}${m.license?' · '+m.license:''}${m.author?' · '+m.author:''}`} onClick={()=>seek(Number(m.outputTime||0))}><span>{m.kind==='sound'?'♪':'✦'} {m.name}</span></div>)}</div>:null}{draft?<AudioLanes tracks={draft.audioTracks} zoom={zoom} selected={audioId} busy={busy} onSelect={id=>{setAudioId(id);setSelected(null);}} onUpdate={changeAudio} onDropAsset={addAudio}/>:null}{draft?<div className="nle-playhead" style={{left:Math.min(time,duration)*zoom}}><i/></div>:null}</div></div></div><div className="nle-timeline-footer">{draft?.clips.length||0} clips · {stamp(duration)} <span>Arrastra para ordenar · Bordes para recortar · Espacio: reproducir · S: dividir · Supr: eliminar</span></div></section>
 {showExport&&draft?<ExportDialog api={api} project={draft} busy={busy} onClose={()=>setShowExport(false)}
  onExport={submitExport} onSettingsChange={setExportSettings}/>:null}
 {showVersions&&draft?<VersionsDialog api={api} projectId={draft.id} beforeWrite={async()=>{await flushPendingSave();return draftRef.current!.revision;}} onClose={()=>setShowVersions(false)} onRestored={p=>{const previous=draftRef.current;accept(p);if(previous){undo.current=[...undo.current,previous].slice(-50);redo.current=[];}setResult(false);setShowVersions(false);setShowExport(false);}}/>:null}
 {parts?<PartsDialog initialFiles={parts.files} numbered={parts.numbered} automatic={!!parts.options} onClose={()=>setParts(null)} onCombine={combineParts}/>:null}
 {showHub?<StartHub api={api} projects={library} currentId={id} onClose={()=>setShowHub(false)} onOpen={p=>{void openProject(p.id).then(ok=>{if(ok)setShowHub(false);});}} onNew={async name=>{await createBlank(name,'youtube');setShowHub(false);}}/>:null}
 {showGallery?<MediaGallery token={token} currentId={id} onClose={()=>setShowGallery(false)} onChanged={refreshGallery} onNew={createBlank} onUse={useGallery} onOpen={item=>openProject(item.id)}/>:null}
 {showPlan?<PlanPanel api={api} onClose={()=>setShowPlan(false)}/>:null}
 {showShortcuts?<Shortcuts onClose={()=>setShowShortcuts(false)}/>:null}
 <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss}/>
 {showTools&&draft?<div className="nle-tools-overlay"><div className="nle-tools-dialog"><button className="nle-tools-close" onClick={()=>setShowTools(false)}>Cerrar ✕</button><StudioTools hideExternal initialTab={toolTab} key={`${id}:${draft.revision}`} project={draft} busy={busy||dirty} api={api} onChange={p=>accept(p)}/></div></div>:null}
 {guia?<Guia steps={GUIA} onClose={()=>{setGuia(false);localStorage.setItem('nacho:guia-vista','1');}}/>:null}
 </div>;
}
const rootElement=document.getElementById('root');if(rootElement)createRoot(rootElement).render(<AuthGate><Editor/></AuthGate>);
