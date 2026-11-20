import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Project,Settings} from './types';
import './auto.css';
import {StudioTools} from './StudioTools';
import {AuthGate} from './AuthGate';
import {Guia,type GuiaStep} from './Guia';
import {AIInterventions} from './AIInterventions';
import {ShortsPanel} from './ShortsPanel';

type Intervention={at:number;outputTime:number;reason:string;effect?:string;kind?:string;author?:string;page?:string;provider?:string;license?:string};
type AutoProject=Project&{automatic?:{status:string;decisions:{label:string;detail:string}[];direction?:{summaries:string[];events:Intervention[];media:Intervention[]}}};
let token='';

async function api<T>(route:string,data?:unknown):Promise<T>{
 const r=await fetch('/api'+route,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':token},body:data===undefined?undefined:JSON.stringify(data)});
 const body=await r.json();
 if(!r.ok)throw new Error(body.error||'No se pudo completar la operación');
 return body;
}

const GUIA:GuiaStep[]=[
 {target:'importar',title:'Importar el vídeo',text:'Arrastra un MP4, MOV, MKV o WebM sobre la zona de carga, o pulsa Elegir vídeo. Puedes elegir si quieres subtítulos animados o no antes de empezar.'},
 {target:'opciones',title:'Opciones interactivas',text:'Decide con un clic si quieres subtítulos arriba o abajo, incluir memes automáticos, música de fondo suave y retoque de piel.'},
 {target:'progreso',title:'Seguir el progreso',text:'Esta lista muestra las cinco etapas reales: escuchar, transcribir, organizar, previsualizar y exportar. La etapa en curso se marca en morado.'},
 {target:'comparar',title:'Comparar original y editado',text:'El interruptor cambia entre tu grabación y el resultado. Editado muestra primero una vista previa y luego el vídeo final.'},
 {target:'descargar',title:'Descargar',text:'Cuando la calidad final está lista aparece Descargar vídeo terminado. El MP4 queda en la carpeta output del estudio; los subtítulos SRT y ASS se descargan también.'},
];

const clock=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

function Studio(){
 const [project,setProject]=useState<AutoProject|null>(null),[projects,setProjects]=useState<AutoProject[]>([]),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[uploadProgress,setUploadProgress]=useState(0),[ready,setReady]=useState(false),[mode,setMode]=useState('edited'),[drag,setDrag]=useState(false),[pexels,setPexels]=useState(false);
 const input=useRef<HTMLInputElement>(null),video=useRef<HTMLVideoElement>(null),screenRef=useRef<HTMLElement>(null),pipVideo=useRef<HTMLVideoElement>(null);
 const id=project?.id;
 const [guia,setGuia]=useState(false);

 // Opciones interactivas de edición automática
 const [subtitlesEnabled,setSubtitlesEnabled]=useState<boolean>(()=>localStorage.getItem('nacho:auto-subtitles')!=='false');
 const [subtitlePos,setSubtitlePos]=useState<string>(()=>localStorage.getItem('nacho:auto-subpos')||'top');
 const [subtitleStyle,setSubtitleStyle]=useState<string>(()=>localStorage.getItem('nacho:auto-substyle')||'Cinematic');
 const [autoMemes,setAutoMemes]=useState<boolean>(()=>localStorage.getItem('nacho:auto-memes')!=='false');
 const [autoMusic,setAutoMusic]=useState<boolean>(()=>localStorage.getItem('nacho:auto-music')!=='false');
 const [autoBeauty,setAutoBeauty]=useState<boolean>(()=>localStorage.getItem('nacho:auto-beauty')!=='false');

 // Control de visibilidad del monitor para Floating PiP
 const [isScreenVisible,setIsScreenVisible]=useState(true);
 const [pipDismissed,setPipDismissed]=useState(false);

 useEffect(()=>{
  if(project&&!localStorage.getItem('nacho:guia-auto-vista'))setGuia(true);
 },[project===null]);

 useEffect(()=>{
  let active=true;
  Promise.all([api<{token:string}>('/session'),api<AutoProject[]>('/projects'),api<{configured:boolean}>('/pexels')])
   .then(([s,p,x])=>{
    if(!active)return;
    token=s.token;setReady(true);setProjects(p);setPexels(x.configured);
    const saved=localStorage.getItem('nacho:last-project');
    const matched=p.find(x=>x.id===saved)||null;
    setProject(matched);
    if(matched?.settings){
     if(typeof matched.settings.subtitles==='boolean')setSubtitlesEnabled(matched.settings.subtitles);
     if(matched.settings.subtitlePosition)setSubtitlePos(matched.settings.subtitlePosition);
     if(matched.settings.subtitle)setSubtitleStyle(matched.settings.subtitle);
    }
   }).catch(e=>setError(e.message));
  return()=>{active=false;};
 },[]);

 useEffect(()=>{
  if(!id)return;
  localStorage.setItem('nacho:last-project',id);
  let active=true,busy=false;
  const interval=setInterval(async()=>{
   if(busy)return;busy=true;
   try{
    const p=await api<AutoProject>(`/projects/${id}`);
    if(active)setProject(p);
   }catch(e){
    if(active)setError((e as Error).message);
   }finally{busy=false;}
  },1800);
  return()=>{active=false;clearInterval(interval);};
 },[id]);

 useEffect(()=>{
  const el=screenRef.current;
  if(!el)return;
  const obs=new IntersectionObserver(([entry])=>{
   setIsScreenVisible(entry.isIntersecting);
  },{threshold:0.12});
  obs.observe(el);
  return()=>obs.disconnect();
 },[id,project?.revision]);

 const job=project?.jobs.at(-1),processing=!!job&&['queued','running'].includes(job.status),artifact=project?.artifacts.export?'export':project?.artifacts.preview?'preview':null;

 async function updateSetting<K extends keyof Settings>(key:K,val:Settings[K]){
  if(!project)return;
  setError('');
  try{
   const updated=await api<AutoProject>(`/projects/${project.id}/settings`,{settings:{[key]:val}});
   setProject(updated);
  }catch(e){
   setError((e as Error).message);
  }
 }

 async function toggleSubtitles(val:boolean){
  setSubtitlesEnabled(val);
  localStorage.setItem('nacho:auto-subtitles',String(val));
  if(project)await updateSetting('subtitles',val);
 }

 async function changeSubPos(pos:string){
  setSubtitlePos(pos);
  localStorage.setItem('nacho:auto-subpos',pos);
  if(project)await updateSetting('subtitlePosition',pos);
 }

 async function changeSubStyle(st:string){
  setSubtitleStyle(st);
  localStorage.setItem('nacho:auto-substyle',st);
  if(project)await updateSetting('subtitle',st);
 }

 function toggleMemes(val:boolean){
  setAutoMemes(val);
  localStorage.setItem('nacho:auto-memes',String(val));
 }

 function toggleMusic(val:boolean){
  setAutoMusic(val);
  localStorage.setItem('nacho:auto-music',String(val));
 }

 function toggleBeauty(val:boolean){
  setAutoBeauty(val);
  localStorage.setItem('nacho:auto-beauty',String(val));
 }

 async function edit(p:AutoProject){
  setError('');
  await api(`/projects/${p.id}/job`,{
   type:'autopilot',
   options:{
    subtitles:subtitlesEnabled,
    subtitlePosition:subtitlePos,
    subtitle:subtitleStyle,
    memes:autoMemes,
    music:autoMusic,
    beauty:autoBeauty,
   }
  });
  setProject(await api(`/projects/${p.id}`));
  setMode('edited');
 }

 async function cancel(){
  if(!project||!job)return;
  setError('');
  setProject(await api<AutoProject>(`/projects/${project.id}/job/cancel`,{jobId:job.id}));
 }

 async function upload(file:File){
  if(uploading||processing)return;
  setError('');setUploading(true);setUploadProgress(0);
  try{
   const p=await new Promise<AutoProject>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/upload?'+new URLSearchParams({name:file.name}));
    xhr.setRequestHeader('X-Studio-Token',token);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.round(e.loaded/e.total*100));};
    xhr.onerror=()=>reject(new Error('No se pudo importar el vídeo'));
    xhr.onload=()=>{
     try{
      const d=JSON.parse(xhr.responseText);
      xhr.status<300?resolve(d):reject(new Error(d.error));
     }catch{reject(new Error('Respuesta de importación no válida'));}
    };
    xhr.send(file);
   });
   setProject(p);
   setProjects(prev=>[p,...prev]);
   await edit(p);
  }catch(e){
   setError((e as Error).message);
  }finally{
   setUploading(false);
  }
 }

 const artifactStamp=artifact?project?.artifacts[artifact]?.createdAt||'':'';
 const currentVideoSrc=mode==='original'
  ?(id?`/api/projects/${id}/media`:'')
  :(id&&artifact?`/api/projects/${id}/artifact?type=${artifact}&v=${project?.revision}&stamp=${encodeURIComponent(artifactStamp)}`:'');

 const msg=job?.message||'';
 const phase=job?.status==='done'?5:/calidad final|Vídeo verificado|Edición terminada/.test(msg)?4:/Retocando|Renderizando|Componiendo|montaje/.test(msg)?3:/discurso|recursos|cambios visuales/.test(msg)?2:/Transcri|Auto-Editor/.test(msg)?1:0;
 const steps=['Escucho y reviso el vídeo','Transcribo y detecto pausas','Organizo el montaje','Creo la vista previa','Exporto el vídeo terminado'];

 function handleSeek(t:number){
  setMode('edited');
  requestAnimationFrame(()=>{
   const el=video.current;
   if(el){
    el.pause();
    el.currentTime=Math.max(0,Math.min(el.duration||t,t));
   }
   const pip=pipVideo.current;
   if(pip){
    pip.pause();
    pip.currentTime=Math.max(0,Math.min(pip.duration||t,t));
   }
  });
 }

 return <div className="studio">
  <header className="top">
   <a className="brand" href="/">NACHO <b>WEB3</b><span>ESTUDIO AUTOMÁTICO</span></a>
   <div className="topright">
    <button onClick={()=>setGuia(true)}>Guía</button>
    {processing&&job?<button onClick={()=>void cancel()}>Cancelar</button>:null}
    {!processing&&job&&['cancelled','interrupted','failed'].includes(job.status)?<button onClick={()=>{if(project)void edit(project);}}>Reanudar</button>:null}
    <span className="online">● Procesamiento local</span>
   </div>
  </header>

  <main>
   <div className="intro">
    <p className="eyebrow">TÚ GRABAS. EL ESTUDIO MONTA.</p>
    <h1>Tu vídeo, listo para ver.</h1>
    <p>Añade tu grabación y personaliza cómo quieres la edición: activa o desactiva subtítulos, memes y música antes o después de montar.</p>
   </div>

   <input hidden ref={input} type="file" accept=".mp4,.mov,.mkv,.webm" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/>
   {error?<div role="alert" className="error">{error}</div>:null}

   {/* PANEL INTERACTIVO DE CONFIGURACIÓN DE EDICIÓN AUTOMÁTICA */}
   <section className="auto-preferences-card" data-guide="opciones">
    <div className="pref-heading">
     <div className="pref-badge">AJUSTES INTERACTIVOS</div>
     <h2>¿Cómo quieres tu edición automática?</h2>
     <p>Tus elecciones se aplicarán en cuanto cargues tu vídeo o pulses «Editar por mí».</p>
    </div>

    <div className="pref-grid">
     {/* Control de Subtítulos */}
     <div className={`pref-card ${subtitlesEnabled?'active':''}`}>
      <div className="pref-card-top">
       <span className="pref-icon">💬</span>
       <div>
        <strong>Subtítulos animados</strong>
        <p>{subtitlesEnabled?'Palabra por palabra sincronizada':'Sin subtítulos en pantalla'}</p>
       </div>
       <button
        type="button"
        className={`pref-switch ${subtitlesEnabled?'on':'off'}`}
        onClick={()=>void toggleSubtitles(!subtitlesEnabled)}
        disabled={processing}
       >
        {subtitlesEnabled?'ACTIVADOS':'DESACTIVADOS'}
       </button>
      </div>

      {subtitlesEnabled?<div className="pref-sub-controls">
       <div className="pref-choice-group">
        <span>Posición:</span>
        <button
         type="button"
         className={subtitlePos==='top'?'selected':''}
         onClick={()=>void changeSubPos('top')}
         disabled={processing}
        >
         Arriba (no tapa)
        </button>
        <button
         type="button"
         className={subtitlePos==='bottom'?'selected':''}
         onClick={()=>void changeSubPos('bottom')}
         disabled={processing}
        >
         Abajo
        </button>
       </div>

       <div className="pref-choice-group">
        <span>Estilo:</span>
        {['Cinematic','Viral','Tutorial','Dark Future'].map(st=>(
         <button
          key={st}
          type="button"
          className={subtitleStyle===st?'selected':''}
          onClick={()=>void changeSubStyle(st)}
          disabled={processing}
         >
          {st}
         </button>
        ))}
       </div>
      </div>:null}
     </div>

     {/* Control de Memes y Recursos */}
     <div className={`pref-card ${autoMemes?'active':''}`}>
      <div className="pref-card-top">
       <span className="pref-icon">🎭</span>
       <div>
        <strong>Memes y recursos IA</strong>
        <p>{autoMemes?'Inserción inteligente por contexto':'Montaje directo sin memes'}</p>
       </div>
       <button
        type="button"
        className={`pref-switch ${autoMemes?'on':'off'}`}
        onClick={()=>toggleMemes(!autoMemes)}
        disabled={processing}
       >
        {autoMemes?'INCLUIR':'OMITIR'}
       </button>
      </div>
      <p className="pref-note">
       {autoMemes?'Podrás revisar cada meme en la sección inferior con la preview siempre al lado.':'Se eliminan pausas y se limpia la voz sin añadir memes ni efectos externos.'}
      </p>
     </div>

     {/* Control de Música de Fondo */}
     <div className={`pref-card ${autoMusic?'active':''}`}>
      <div className="pref-card-top">
       <span className="pref-icon">♫</span>
       <div>
        <strong>Música suave con ducking</strong>
        <p>{autoMusic?'Pista suave que baja cuando hablas':'Solo el audio de tu grabación'}</p>
       </div>
       <button
        type="button"
        className={`pref-switch ${autoMusic?'on':'off'}`}
        onClick={()=>toggleMusic(!autoMusic)}
        disabled={processing}
       >
        {autoMusic?'CON MÚSICA':'SIN MÚSICA'}
       </button>
      </div>
     </div>

     {/* Retoque Facial */}
     <div className={`pref-card ${autoBeauty?'active':''}`}>
      <div className="pref-card-top">
       <span className="pref-icon">✨</span>
       <div>
        <strong>Retoque facial IA</strong>
        <p>{autoBeauty?'Piel suave, ojeras atenuadas y luz':'Imagen sin filtros de rostro'}</p>
       </div>
       <button
        type="button"
        className={`pref-switch ${autoBeauty?'on':'off'}`}
        onClick={()=>toggleBeauty(!autoBeauty)}
        disabled={processing}
       >
        {autoBeauty?'NATURAL':'DESACTIVADO'}
       </button>
      </div>
     </div>
    </div>
   </section>

   {!project&&!uploading?<section className={`drop ${drag?'drag':''}`} data-guide="importar" onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f&&ready)void upload(f);}}>
    <div className="playmark">▶</div>
    <h2>Arrastra aquí tu vídeo</h2>
    <p>MP4, MOV, MKV o WebM · el original se conserva intacto</p>
    <button className="mainbutton" disabled={!ready} onClick={()=>input.current?.click()}>
     Elegir vídeo y montar con mis ajustes
    </button>
    <div className="features">
     <span>✦ Pausas y ritmo</span>
     <span>✦ Voz limpia</span>
     <span>{subtitlesEnabled?`✦ Subtítulos ${subtitlePos==='top'?'arriba':'abajo'}`:'✦ Sin subtítulos'}</span>
     <span>{autoMemes?'✦ Memes inteligentes':'✦ Montaje limpio'}</span>
    </div>
   </section>:null}

   {uploading?<section className="upload">
    <h2>Importando tu grabación · {uploadProgress}%</h2>
    <progress max={100} value={uploadProgress}/>
    <p>Al terminar comenzará la edición automáticamente con tus preferencias.</p>
   </section>:null}

   {project?<><div className="projectbar">
    <div>
     <h2>{project.name}</h2>
     <span>{clock(project.media.duration)} de original · {project.media.width} × {project.media.height} · {subtitlesEnabled?'Con subtítulos':'Sin subtítulos'}</span>
    </div>
    <div className="projectbar-actions">
     <button data-guide="importar" disabled={processing||uploading} onClick={()=>input.current?.click()}>＋ Otro vídeo</button>
    </div>
   </div>

   <div className="editing">
    <section ref={screenRef} className="screen">
     <div className="screenbar" data-guide="comparar">
      <span>{mode==='original'?'TU GRABACIÓN ORIGINAL':'EL RESULTADO EDITADO'}</span>
      <div className="switch">
       <button aria-pressed={mode==='original'} onClick={()=>setMode('original')}>Original</button>
       <button aria-pressed={mode==='edited'} onClick={()=>setMode('edited')}>Editado</button>
      </div>
     </div>

     {mode==='original'||artifact?<video
      ref={video}
      key={`${project.id}-${mode}-${artifact}-${project.revision}-${artifactStamp}`}
      controls
      playsInline
      src={currentVideoSrc}
     />:<div className="waiting">
      <div className={processing?'orbit':''}>✦</div>
      <h3>{processing?'Estoy trabajando en tu vídeo':job&&['cancelled','interrupted','failed'].includes(job.status)?'La edición se ha detenido':'Preparado para editar'}</h3>
      <p>{processing?'La vista previa aparecerá aquí cuando esté renderizada. Puedes ver el original mientras tanto.':job?.status==='cancelled'?'Puedes reanudar y se conservarán los fragmentos ya renderizados.':job?.status==='failed'?'Revisa el registro y vuelve a intentarlo; los fragmentos completados se conservan.':'Pulsa Editar por mí para comenzar con tus ajustes.'}</p>
      <button onClick={()=>setMode('original')}>Ver original</button>
     </div>}

     <div className="screenfoot">
      {artifact==='preview'?'Vista previa disponible · preparando calidad final':artifact==='export'?'Vídeo final disponible':'El progreso refleja las etapas reales del procesamiento.'}
     </div>
    </section>

    <aside className="assistant" data-guide="progreso">
     <div className="assistanthead">
      <span>✦</span>
      <div>
       <h2>Tu editor</h2>
       <p>{processing?'Trabajando en tu grabación':job?.status==='done'?'Montaje terminado':'Listo para trabajar'}</p>
      </div>
     </div>

     <ol>
      {steps.map((s,i)=><li key={s} className={phase>i?'done':phase===i&&processing?'current':''}>
       <span>{phase>i?'✓':i+1}</span>{s}
      </li>)}
     </ol>

     <p role="status" className="activity">
      {processing?msg:job?.status==='failed'?'No se pudo terminar. Tu original sigue intacto.':job?.status==='done'?'Mira el resultado y descarga tu vídeo.':'Aplica tus ajustes y monta tu grabación.'}
     </p>

     {job?.status==='failed'?<details><summary>Ver qué ha ocurrido</summary><p className="technical">{msg}</p></details>:null}

     {!processing?<button className="mainbutton" disabled={!ready||uploading} onClick={()=>void edit(project).catch(e=>setError(e.message))}>
      {artifact?'Volver a editar con mis ajustes':'Editar por mí'}
     </button>:null}

     {project.artifacts.export?<a className="mainbutton download" data-guide="descargar" href={`/api/projects/${id}/artifact?type=export&download=1`}>
      ↓ Descargar vídeo terminado
     </a>:null}
    </aside>
   </div>

   {project.automatic?.decisions?.length?<section className="decisions">
    <h2>Qué he cambiado</h2>
    <div>{project.automatic.decisions.map((d,i)=><article key={i}><h3>{d.label}</h3><p>{d.detail}</p></article>)}</div>
   </section>:null}

   {project.analysis?.warnings?.length?<details className="notes">
    <summary>Observaciones de esta edición</summary>
    {project.analysis.warnings.map((w,i)=><p key={i}>{w}</p>)}
   </details>:null}</>:null}

   {/* PANEL DE MEMES Y RECURSOS IA: Con preview en vivo y modo dividido */}
   {project?<AIInterventions
    project={project}
    busy={processing||uploading}
    api={api}
    videoSrc={currentVideoSrc}
    defaultCollapsed={false}
    onProject={p=>{setProject(p as AutoProject);setMode('edited');}}
    onSeek={handleSeek}
   />:null}

   {project?<ShortsPanel project={project} busy={processing||uploading} api={api} onChange={p=>setProject(p as AutoProject)}/>:null}
   {project?<StudioTools key={`${project.id}:${project.revision}`} project={project} busy={processing||uploading} api={api} onChange={p=>setProject(p as AutoProject)}/>:null}

   {project?.automatic?.direction?<details className="notes">
    <summary>Decisiones del editor y recursos utilizados</summary>
    {project.automatic.direction.summaries.map((s,i)=><p key={'s'+i}>{s}</p>)}
    {[...project.automatic.direction.events,...project.automatic.direction.media].sort((a,b)=>a.outputTime-b.outputTime).map((e,i)=><p key={i}>
     <b>{clock(e.outputTime)} · {e.effect||e.kind||'Recurso'}</b> — {e.reason}
     {e.page?<span> · <a href={e.page} target="_blank" rel="noreferrer">{e.author||'Autor'} / {e.provider||'Pexels'}{e.license?` (${e.license})`:''} ↗</a></span>:null}
    </p>)}
   </details>:null}

   <section className="resources">
    <div>
     <h2>Tus recursos, cuando encajen</h2>
     <p>Añade memes a <code>input/memes</code> y efectos a <code>input/sonidos</code>. Usa nombres que describan cuándo utilizarlos.</p>
    </div>
    <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Recursos de Pexels · {pexels?'conectado':'sin configurar'} ↗</a>
   </section>

   {projects.length?<details className="history">
    <summary>Mis vídeos anteriores ({projects.length})</summary>
    {projects.map(p=><button key={p.id} disabled={processing||uploading} onClick={()=>{setProject(p);setMode('edited');}}>{p.name} · {clock(p.media.duration)}</button>)}
   </details>:null}

   <footer>
    <span>NACHO WEB3 · Tus vídeos se procesan en tu equipo.</span>
    <a href="/?advanced=1">Abrir ajustes avanzados</a>
   </footer>
  </main>

  {/* REPRODUCTOR FLOTANTE PERSISTENTE (PICTURE-IN-PICTURE) */}
  {project&&!isScreenVisible&&!pipDismissed&&(artifact||mode==='original')?<aside className="floating-pip" aria-label="Reproductor flotante">
   <div className="pip-header">
    <span className="pip-live-dot">●</span>
    <span className="pip-title">{mode==='original'?'ORIGINAL':'VÍDEO EDITADO'}</span>
    <button type="button" className="pip-close" onClick={()=>setPipDismissed(true)} title="Ocultar reproductor flotante">✕</button>
   </div>
   <div className="pip-video-wrap">
    <video
     ref={pipVideo}
     controls
     playsInline
     src={currentVideoSrc}
     key={`pip-${project.id}-${mode}-${artifact}-${project.revision}-${artifactStamp}`}
    />
   </div>
   <div className="pip-footer">
    <button type="button" onClick={()=>{screenRef.current?.scrollIntoView({behavior:'smooth'});}}>
     ↑ Volver al reproductor
    </button>
    <span>Preview siempre visible</span>
   </div>
  </aside>:null}

  {guia?<Guia steps={GUIA} onClose={()=>{setGuia(false);localStorage.setItem('nacho:guia-auto-vista','1');}}/>:null}
 </div>;
}

createRoot(document.getElementById('root')!).render(<AuthGate><Studio/></AuthGate>);
