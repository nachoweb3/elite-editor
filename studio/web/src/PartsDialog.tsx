import {useState} from 'react';
import {DialogHeader,Modal} from './Modal';

const partNumber=(name:string)=>/^(?:(?:parte|part|clip)[\s._-]*)?(\d{1,4})(?=$|[\s._-])/i.exec(name.replace(/\.[^.]+$/,''))?.[1];

export function orderParts(files:File[]){
 const numbered=files.map(file=>({file,number:partNumber(file.name)}));
 const distinct=new Set(numbered.map(part=>Number(part.number)));
 if(numbered.every(part=>part.number!==undefined)&&distinct.size===files.length){
  return {files:numbered.sort((a,b)=>Number(a.number)-Number(b.number)).map(part=>part.file),numbered:true};
 }
 return {files,numbered:false};
}

export function partsPayload(name:string,files:File[]){
 const manifest={name,parts:files.map(({name,size})=>({name,size}))};
 return new Blob([JSON.stringify(manifest)+'\n',...files],{type:'application/octet-stream'});
}

export function PartsDialog({initialFiles,numbered,automatic,onClose,onCombine}:{
 initialFiles:File[];
 numbered:boolean;
 automatic:boolean;
 onClose:()=>void;
 onCombine:(name:string,files:File[])=>Promise<void>;
}){
 const [files,setFiles]=useState(initialFiles);
 const [name,setName]=useState(`Montaje de ${initialFiles.length} partes`);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 function move(from:number,to:number){
  setFiles(current=>{
   const next=[...current];
   [next[from],next[to]]=[next[to],next[from]];
   return next;
  });
 }
 function close(){if(!busy)onClose();}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy||!name.trim())return;
  setBusy(true);setError('');
  try{await onCombine(name.trim(),files);}
  catch(e){setError((e as Error).message);setBusy(false);}
 }
 return <Modal titleId="parts-title" busy={busy} onClose={close}>
  <DialogHeader titleId="parts-title" kicker="IMPORTAR VÍDEO" title="Unir partes de una grabación" onClose={close}
   description={numbered?'Orden inicial según el número al principio de cada nombre. Puedes ajustarlo aquí.':'Revisa que el orden coincida con la grabación. Usa las flechas para mover cada parte.'}/>
  <form className="parts-form" onSubmit={event=>void submit(event)}>
   <label>Nombre del proyecto<input required maxLength={120} disabled={busy} value={name} onChange={event=>setName(event.target.value)}/></label>
   <ol aria-label="Orden de las partes">{files.map((file,index)=><li key={initialFiles.indexOf(file)}>
    <span>{file.name}</span>
    <button type="button" aria-label={`Subir ${file.name}`} disabled={busy||index===0} onClick={()=>move(index,index-1)}>↑</button>
    <button type="button" aria-label={`Bajar ${file.name}`} disabled={busy||index===files.length-1} onClick={()=>move(index,index+1)}>↓</button>
   </li>)}</ol>
   <p>La línea de tiempo conserva una marca por cada parte. Los archivos originales se conservan.</p>
   {busy?<p role="status">Uniendo las partes. Los formatos distintos requieren recodificación y pueden tardar.</p>:null}
   {error?<p role="alert" className="hub-error">{error}</p>:null}
   <button type="submit" className="nle-primary" disabled={busy||!name.trim()}>{busy?'Preparando…':automatic?'Unir y montar':'Unir y abrir en la línea de tiempo'}</button>
  </form>
 </Modal>;
}
