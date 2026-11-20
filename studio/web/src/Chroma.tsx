import {useCurrentFrame,useVideoConfig} from 'remotion';
import {useCallback,useEffect,useRef} from 'react';
import type {CSSProperties} from 'react';
import type {Chroma} from './types';

function keyRgb(color:string):[number,number,number]{
 const hex=color.trim().replace(/^#/, '').replace(/^0x/i, '');
 if(!/^[0-9a-f]{6}$/i.test(hex))return[0,255,0];
 return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
}

// Browser-side counterpart of FFmpeg's colorkey. It uses the same key colour,
// similarity and blend values from the shared composition plan.
function isGreenSource(context:CanvasRenderingContext2D,width:number,height:number,chroma:Chroma){
 const frame=context.getImageData(0,0,width,height),data=frame.data,[kr,kg,kb]=keyRgb(chroma.color),similarity=chroma.similarity;
 let green=0,total=0;
 for(let i=0;i<data.length;i+=4*13){
  total++;
  if(data[i+3]>0&&Math.sqrt((data[i]-kr)**2+(data[i+1]-kg)**2+(data[i+2]-kb)**2)/441.67295593<=similarity)green++;
 }
 return total>0&&green/total>=.12;
}

function keyCanvas(canvas:HTMLCanvasElement,chroma:Chroma){
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context||!canvas.width||!canvas.height)return;
 if(chroma.enabled===false)return;
 if(chroma.enabled===null&&!isGreenSource(context,canvas.width,canvas.height,chroma))return;
 const frame=context.getImageData(0,0,canvas.width,canvas.height);
 const [kr,kg,kb]=keyRgb(chroma.color),similarity=chroma.similarity,blend=chroma.blend,data=frame.data;
 for(let i=0;i<data.length;i+=4){
  const distance=Math.sqrt((data[i]-kr)**2+(data[i+1]-kg)**2+(data[i+2]-kb)**2)/441.67295593;
  const alpha=distance<=similarity?0:Math.min(1,(distance-similarity)/blend);
  data[i+3]=Math.round(data[i+3]*alpha);
 }
 context.putImageData(frame,0,0);
}

export function ChromaMedia({src,image,chroma,style}:{src:string;image:boolean;chroma:Chroma;style:CSSProperties}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),canvas=useRef<HTMLCanvasElement>(null),media=useRef<HTMLVideoElement|HTMLImageElement>(null);
 const draw=useCallback(()=>{
  const canvasElement=canvas.current,source=media.current;
  if(!canvasElement||!source)return;
  const width='videoWidth' in source?source.videoWidth:source.naturalWidth;
  const height='videoHeight' in source?source.videoHeight:source.naturalHeight;
  if(!width||!height)return;
  if(canvasElement.width!==width)canvasElement.width=width;
  if(canvasElement.height!==height)canvasElement.height=height;
  const context=canvasElement.getContext('2d');
  if(!context)return;
  context.clearRect(0,0,width,height);
  context.drawImage(source,0,0,width,height);
  keyCanvas(canvasElement,chroma);
 },[chroma]);
 useEffect(()=>{
  const source=media.current;
  if(!source)return;
  if(image){
   if((source as HTMLImageElement).complete)draw();
   return;
  }
  const video=source as HTMLVideoElement;
  const seeked=()=>draw();
  video.addEventListener('seeked',seeked);
  if(video.readyState>=2)draw();
  return()=>video.removeEventListener('seeked',seeked);
 },[draw,image]);
 useEffect(()=>{
  if(image)return;
  const video=media.current as HTMLVideoElement|null;
  if(!video)return;
  const target=frame/fps;
  if(Math.abs(video.currentTime-target)>1/(fps*2)){
   try{video.currentTime=target;}catch{/* metadata not ready */}
  }
 },[frame,fps,image]);
 return <>
  {image
   ?<img ref={media as React.RefObject<HTMLImageElement>} src={src} alt="" crossOrigin="anonymous" style={{display:'none'}} onLoad={draw}/>
   :<video ref={media as React.RefObject<HTMLVideoElement>} src={src} muted playsInline preload="auto" crossOrigin="anonymous" style={{display:'none'}} onLoadedData={draw} onLoadedMetadata={draw}/>}
  <canvas ref={canvas} style={{...style,objectFit:'contain' as const,display:'block'}}/>
 </>;
}
