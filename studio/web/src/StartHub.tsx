import {useEffect,useState} from 'react';
import {DialogHeader,Modal} from './Modal';
import type {Project} from './types';
import {clock,searchText} from './timeline';

type HubProject=Project&{updatedAt?:string};
type Metric={key:string;label:string;used:number;limit:number|null;remaining:number|null;percent:number|null};
type Usage={plan:{key:string;label:string;unlimited:boolean};metrics:Metric[]};

const when=(value?:string)=>{
  if(!value)return 'sin fecha';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'sin fecha';
  const days=Math.floor((Date.now()-date.getTime())/86400000);
  if(days<=0)return `hoy ${date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`;
  if(days===1)return `ayer ${date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`;
  return `hace ${days} días`;
};
const solid=(project:HubProject)=>project.blank?0:project.clips.filter(clip=>clip.enabled).reduce((total,clip)=>total+clip.end-clip.start,0);
const meta=(project:HubProject)=>[clock(solid(project)),`${project.clips.length} clip${project.clips.length===1?'':'s'}`,when(project.updatedAt)].join(' · ');
const count=(value:number,one:string,many:string)=>`${value} ${value===1?one:many}`;

export function StartHub({api,projects,currentId,onClose,onOpen,onNew}:{
  api:<T>(route:string,data?:unknown)=>Promise<T>;
  projects:HubProject[];
  currentId?:string;
  onClose:()=>void;
  onOpen:(project:HubProject)=>void;
  onNew:(name:string)=>Promise<void>|void;
}){
  const [usage,setUsage]=useState<Usage|null>(null),[usageError,setUsageError]=useState(''),[error,setError]=useState(''),[name,setName]=useState('Mi primer montaje'),[creating,setCreating]=useState(false);
  const [query,setQuery]=useState(''),[order,setOrder]=useState('recent');
  useEffect(()=>{let active=true;api<Usage>('/usage').then(value=>{if(active)setUsage(value);}).catch(e=>{if(active)setUsageError((e as Error).message);});return()=>{active=false;};},[api]);
  const total=projects.length;
  const storage=usage?.metrics.find(metric=>metric.key==='storageGB');
  const recent=[...projects].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  const term=searchText(query.trim());
  const visible=recent.filter(project=>searchText(project.name).includes(term));
  if(order==='name')visible.sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'}));
  const current=projects.find(project=>project.id===currentId)||recent[0];
  async function create(){
    if(!name.trim()||creating)return;
    setCreating(true);setError('');
    try{await onNew(name.trim());}catch(e){setError((e as Error).message);}finally{setCreating(false);}
  }
  return <Modal titleId="hub-title" onClose={onClose} wide>
    <DialogHeader titleId="hub-title" kicker="INICIO · ESTUDIO LOCAL" title="Continúa donde lo dejaste" onClose={onClose}
      description={total?`${count(total,'proyecto','proyectos')} en este equipo. Nada se sube a ninguna nube.`:'Todavía no hay proyectos en este equipo.'}/>
    {error?<p role="alert" className="hub-error">{error}</p>:null}
    <div className="hub-grid">
      <section className="hub-continue">
        <h3>Continuar</h3>
        {current?<>
          <b>{current.name}</b>
          <p>{meta(current)}</p>
          <button type="button" className="hub-primary" onClick={()=>onOpen(current)}>Abrir proyecto</button>
        </>:<p>Importa un clip y crea tu primer montaje.</p>}
        <form className="hub-new" onSubmit={e=>{e.preventDefault();void create();}}>
          <label htmlFor="hub-name">Proyecto nuevo</label>
          <input id="hub-name" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/>
          <button type="submit" disabled={!name.trim()||creating}>{creating?'Creando…':'Crear proyecto vacío'}</button>
        </form>
      </section>
      <section className="hub-storage">
        <h3>Espacio</h3>
        {storage?<>
          <div className="hub-bar"><i style={{width:`${Math.min(100,storage.percent??0)}%`}}/></div>
          <p>{storage.limit===null?'Sin límite':`${storage.used} de ${storage.limit} GB · ${storage.percent}%`}</p>
          <p className="hub-muted">Plan {usage?.plan.label}. Vaciando la papelera se libera espacio.</p>
        </>:<p className="hub-muted">{usageError||usage?'Uso de disco no disponible.':'Consultando el uso de disco…'}</p>}
      </section>
      <section className="hub-team">
        <h3>Primeros tres pasos</h3>
        <ol>
          <li><b>Importa</b><span>un clip corto desde Galería multimedia o arrástralo al monitor.</span></li>
          <li><b>Prueba</b><span>«Editar automáticamente» y revisa los cortes antes de aplicar.</span></li>
          <li><b>Exporta</b><span>con la comprobación previa y descarga el MP4 con nombre legible.</span></li>
        </ol>
      </section>
    </div>
    <section className="hub-recent">
      <h3>Proyectos</h3>
      {total?<div className="hub-filters">
        <input type="search" aria-label="Buscar proyecto por nombre" placeholder="Buscar proyecto por nombre…" value={query} onChange={event=>setQuery(event.target.value)}/>
        <select aria-label="Ordenar proyectos" value={order} onChange={event=>setOrder(event.target.value)}>
          <option value="recent">Última modificación</option>
          <option value="name">Nombre</option>
        </select>
        <span role="status">{visible.length} de {total}</span>
      </div>:null}
      {visible.length?<ul>{visible.map(project=><li key={project.id}>
        <div>
          <b>{project.name}</b>
          <span>{meta(project)}</span>
        </div>
        <button type="button" onClick={()=>onOpen(project)}>Abrir</button>
      </li>)}</ul>:<p className="hub-muted">{total?'Ningún proyecto coincide con la búsqueda.':'Tus montajes aparecerán aquí.'}</p>}
    </section>
  </Modal>;
}
