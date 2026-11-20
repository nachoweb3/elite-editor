import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import './guia.css';
export type GuiaStep={target:string;title:string;text:string};
const PAD=6,CARD=350,NARROW=520;
type Layout={x:number;y:number;w:number;h:number;vw:number;vh:number;card:number};
const empty:Layout={x:0,y:0,w:0,h:0,vw:0,vh:0,card:220};
function measure(target:HTMLElement|null,card:HTMLElement|null):Layout{
 const r=target?.getBoundingClientRect();
 return {x:Math.round(r?.left||0),y:Math.round(r?.top||0),w:Math.round(r?.width||0),h:Math.round(r?.height||0),vw:innerWidth,vh:innerHeight,card:card?.offsetHeight||220};
}
function placement(layout:Layout){
 const left=Math.max(12,Math.min(layout.x+layout.w/2-CARD/2,layout.vw-CARD-12)),below=layout.y+layout.h+PAD+14;
 return {left,top:below+layout.card<layout.vh-12?below:Math.max(12,layout.y-PAD-layout.card-14)};
}
// Se monta solo mientras la guía está abierta: el índice arranca en 0 sin parpadeo.
export function Guia({steps,onClose}:{steps:GuiaStep[];onClose:()=>void}){
 const [index,setIndex]=useState(0),[layout,setLayout]=useState(empty);
 const card=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null),stamp=useRef('');
 const step=steps[index],last=index===steps.length-1;
 const close=useCallback(()=>{onClose();returnFocus.current?.focus();},[onClose]);
 useEffect(()=>{returnFocus.current=document.activeElement as HTMLElement;},[]);
 useEffect(()=>{card.current?.focus();},[index]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   else if(event.key==='ArrowRight'){event.preventDefault();setIndex(i=>Math.min(i+1,steps.length-1));}
   else if(event.key==='ArrowLeft'){event.preventDefault();setIndex(i=>Math.max(i-1,0));}
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[close,steps.length]);
 // Una sola medición: objetivo, ventana y alto de la tarjeta, antes de pintar.
 useLayoutEffect(()=>{
  const target=document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
  target?.scrollIntoView({block:'nearest',inline:'nearest'});
  const update=()=>{
   const next=measure(target,card.current),key=Object.values(next).join('|');
   if(key!==stamp.current){stamp.current=key;setLayout(next);}
  };
  update();
  // La página sigue asentando (vídeo, fuentes): temporizadores cortos y observadores.
  const timers=[150,500,1200].map(ms=>setTimeout(update,ms));
  const observer=new ResizeObserver(update);
  observer.observe(document.body);
  if(target)observer.observe(target);
  if(card.current)observer.observe(card.current);
  window.addEventListener('resize',update);
  window.addEventListener('scroll',update,true);
  return()=>{timers.forEach(clearTimeout);observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[index,step.target]);
 const found=layout.w>0&&layout.h>0,narrow=layout.vw<NARROW,place=narrow?null:placement(layout);
 return <div className="guia">
  {found?<div className="guia-hole" aria-hidden="true" style={{left:layout.x-PAD,top:layout.y-PAD,width:layout.w+PAD*2,height:layout.h+PAD*2}}/>:<div className="guia-veil" aria-hidden="true"/>}
  <div className="guia-card" role="dialog" aria-labelledby="guia-title" tabIndex={-1} ref={card} style={place?{left:place.left,top:place.top,width:CARD}:undefined}>
   <p className="guia-count">Paso {index+1} de {steps.length}</p>
   <h2 id="guia-title">{step.title}</h2>
   <p className="guia-text" aria-live="polite">{step.text}</p>
   <div className="guia-actions">
    <button type="button" onClick={close}>Saltar</button>
    {index>0?<button type="button" onClick={()=>setIndex(i=>i-1)}>Anterior</button>:null}
    <button type="button" className="guia-next" onClick={()=>last?close():setIndex(i=>i+1)}>{last?'Empezar a editar':'Siguiente'}</button>
   </div>
  </div>
 </div>;
}
