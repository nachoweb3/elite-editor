import {useEffect,useId,useMemo,useState} from 'react';
import {clock,searchText} from './timeline';
import {chapterText,type Chapter,type TranscriptHit} from './transcript-index';

export function TranscriptTools({index,chapters,projectName,onSeek,onMessage}:{
 index:TranscriptHit[];
 chapters:Chapter[];
 projectName:string;
 onSeek:(time:number)=>void;
 onMessage:(message:string)=>void;
}){
 const listId=useId();
 const [query,setQuery]=useState('');
 const [show,setShow]=useState(false);
 const [active,setActive]=useState(0);
 const terms=useMemo(()=>searchText(query.trim()).split(/\s+/).filter(Boolean),[query]);
 const hasQuery=terms.join('').length>=2;
 const matches=useMemo(()=>hasQuery?index.filter(line=>terms.every(word=>line.searchable.includes(word))):[],[index,terms,hasQuery]);
 const open=show&&hasQuery;
 const selected=Math.min(active,matches.length-1);
 const optionId=(i:number)=>`${listId}-${i}`;
 useEffect(()=>{
  if(open&&selected>=0)document.getElementById(`${listId}-${selected}`)?.scrollIntoView({block:'nearest'});
 },[listId,open,selected]);

 async function copy(){
  try{await navigator.clipboard.writeText(chapterText(chapters));onMessage('Capítulos copiados.');}
  catch{onMessage('El portapapeles no está disponible. Puedes descargar los capítulos en texto.');}
 }
 function download(){
  const url=URL.createObjectURL(new Blob([chapterText(chapters)+'\n'],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=`${projectName.replace(/[<>:"/\\|?*]/g,'-').replace(/\.(mp4|mov|mkv|webm)$/i,'')||'montaje'}-capitulos.txt`;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 return <div className="nle-chapter-tools">
  <div className="nle-transcript">
   <input type="search" role="combobox" aria-label="Buscar en la transcripción" placeholder="Buscar en la transcripción…"
    aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
    aria-activedescendant={open&&selected>=0?optionId(selected):undefined}
    value={query} disabled={!index.length}
    onFocus={()=>setShow(true)} onBlur={()=>setShow(false)}
    onChange={event=>{setQuery(event.target.value);setActive(0);setShow(true);}}
    onKeyDown={event=>{
     if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setShow(false);}
     if(!matches.length)return;
     if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setShow(true);
      if(open)setActive((selected+(event.key==='ArrowDown'?1:matches.length-1))%matches.length);
     }
     if(event.key==='Enter'&&open){event.preventDefault();onSeek(matches[selected].time);}
    }}/>
   <div className="nle-search-results" hidden={!open}>
    <p role="status">{matches.length===0?'Sin coincidencias en el montaje.':matches.length===1?'1 coincidencia':`${matches.length} coincidencias`}</p>
    <ul id={listId} role="listbox" aria-label="Coincidencias en la línea de tiempo">{open?matches.map((line,i)=>
     <li key={line.id} id={optionId(i)} role="option" aria-selected={i===selected}
      onMouseDown={event=>event.preventDefault()} onClick={()=>{setActive(i);onSeek(line.time);}}>
      <time>{clock(line.time)}</time><span>{line.text}</span>
     </li>
    ):null}</ul>
   </div>
  </div>
  {chapters.length?<details className="nle-chapters">
   <summary>{chapters.length===1?'1 capítulo':`${chapters.length} capítulos`}</summary>
   <div className="nle-search-results">
    <div className="nle-chapter-actions">
     <button type="button" onClick={()=>void copy()}>Copiar</button>
     <button type="button" onClick={download}>Descargar .txt</button>
    </div>
    <ol>{chapters.map(chapter=><li key={chapter.time}><button type="button" onClick={()=>onSeek(chapter.time)}><time>{clock(chapter.time)}</time><span>{chapter.title}</span></button></li>)}</ol>
   </div>
  </details>:null}
 </div>;
}
