import {AbsoluteFill,Audio,Img,Sequence,Video,useCurrentFrame,useVideoConfig} from 'remotion';
import type {CSSProperties} from 'react';
import {CLIP_TRANSITIONS,type ClipTransitionType} from '../../shared/transitions.mjs';
import {ChromaMedia} from './Chroma';
import type {CompositionAudio,CompositionClip,CompositionSpec,CompositionVisual,Word} from './types';

const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));

export function BrandTitle({title}:{title:string}){return <><div style={{position:'absolute',top:50,left:55,fontSize:27,letterSpacing:6,color:'#D8DCE3'}}>NACHO / WEB3</div>{title?<div style={{position:'absolute',top:180,left:60,right:60,textAlign:'center',fontSize:52,fontWeight:800,textShadow:'0 3px 8px #000'}}>{title}</div>:null}</>;}
export function Caption({words,template,position}:{words:Word[];template:string;position:string}){const frame=useCurrentFrame(),{fps}=useVideoConfig(),t=frame/fps;const groups:Word[][]=[];let group:Word[]=[];for(const word of words){if(group.length&&(group.length>=5||word.start-group.at(-1)!.end>.6||group.map(w=>w.word).join('').length+word.word.length>42)){groups.push(group);group=[];}group.push(word);}if(group.length)groups.push(group);const current=groups.find(g=>t>=g[0].start&&t<g.at(-1)!.end);if(!current)return null;return <div style={{position:'absolute',left:'7%',right:'7%',...(position==='top'?{top:'8%'}:{bottom:template==='Tutorial'?'4%':'13%'}),fontSize:58,textAlign:'center',fontFamily:'Arial',fontWeight:700,textShadow:'0 3px 5px #08090D, 2px 0 #08090D, -2px 0 #08090D'}}>{current.map((w,i)=><span key={i} style={{color:t>=w.start?'#A020F0':'#fff'}}>{w.word.trim()} </span>)}</div>;}

function ClipLayer({clip}:{clip:CompositionClip}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),t=frame/fps,length=Math.max(1/fps,clip.duration),enter=clip.transition.in,leave=clip.transition.out;
 const enterProgress=enter?clamp(t/enter.duration):1;
 const leaveProgress=leave?clamp((t-(length-leave.duration))/leave.duration):0;
 const preset=enter?CLIP_TRANSITIONS[enter.type]:null;
 let motionScale=1,motionX=0,motionY=0;
 if(clip.motion==='dolly-in')motionScale=1+0.08*clamp(t/length);
 else if(clip.motion==='dolly-out')motionScale=1.08-0.08*clamp(t/length);
 else if(clip.motion==='zoom-crash')motionScale=1+0.18*clamp(t/length);
 else if(clip.motion==='pan-left'){motionScale=1.1;motionX=(1-clamp(t/length))*4;}
 else if(clip.motion==='pan-right'){motionScale=1.1;motionX=-((1-clamp(t/length))*4);}
 else if(clip.motion==='tilt-up'){motionScale=1.1;motionY=(1-clamp(t/length))*4;}
 else if(clip.motion==='ken-burns'){motionScale=1.07;motionX=(0.5-0.35*clamp(t/length))*4;}
 const {video}=clip;
 return <AbsoluteFill style={{background:'#000',overflow:'hidden'}}>
  <AbsoluteFill style={{background:'#08090D',...entranceStyle(enter?.type,enterProgress)}}>
   <AbsoluteFill style={{transform:`translateX(${motionX}%) translateY(${motionY}%) scale(${motionScale})`}}>
    <Video src={clip.src} trimBefore={Math.round(clip.start*fps)} durationInFrames={Math.round(clip.duration*fps)} style={{width:'100%',height:'100%',objectFit:video.fit,objectPosition:`${video.cropX*100}% ${video.cropY*100}%`,transform:`scale(${video.zoom})`,filter:`brightness(${1+video.exposure}) contrast(${video.contrast}) saturate(${video.saturation})`}}/>
   </AbsoluteFill>
  </AbsoluteFill>
  {preset?.kind==='fade'&&enterProgress<1?<AbsoluteFill style={{background:preset.color,opacity:1-enterProgress}}/>:null}
  {leaveProgress>0?<AbsoluteFill style={{background:'#000',opacity:leaveProgress}}/>:null}
 </AbsoluteFill>;
}
function entranceStyle(type:ClipTransitionType|undefined,progress:number):CSSProperties {
 if(!type||progress>=1)return {};
 const preset=CLIP_TRANSITIONS[type],remaining=(1-progress)*100;
 if(preset.kind==='slide')return {transform:`translate${preset.axis.toUpperCase()}(${preset.direction*remaining}%)`};
 if(preset.kind==='wipe-right')return {clipPath:`inset(0 ${remaining}% 0 0)`};
 if(preset.kind==='wipe-diagonal'){
  const edge=progress*200;
  return {clipPath:edge<=100
   ?`polygon(0 0, ${edge}% 0, 0 ${edge}%)`
   :`polygon(0 0, 100% 0, 100% ${edge-100}%, ${edge-100}% 100%, 0 100%)`};
 }
 if(preset.kind==='open'){
  const half=remaining/2;
  return {clipPath:preset.axis==='x'?`inset(0 ${half}% 0 ${half}%)`:`inset(${half}% 0 ${half}% 0)`};
 }
 if(preset.kind==='iris')return {clipPath:`circle(${progress*50*Math.SQRT2}% at center)`};
 return {};
}

function Visual({visual}:{visual:CompositionVisual}){
 const placement=visual.placement;
 if(!placement)return null;
 const style={position:'absolute' as const,left:`${placement.x*100}%`,top:`${placement.y*100}%`,width:`${placement.w*100}%`,height:`${placement.h*100}%`,objectFit:'contain' as const,objectPosition:'bottom center' as const};
 if(visual.chroma.enabled!==false)return <ChromaMedia src={visual.src} image={visual.image} chroma={visual.chroma} style={style}/>;
 if(visual.image)return <Img src={visual.src} style={style}/>;
 return <Video src={visual.src} muted playsInline style={style}/>;
}

function AudioEvent({event}:{event:CompositionAudio}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),t=frame/fps,length=Math.max(1/fps,event.duration);
 const fadeIn=Math.min(event.fadeIn||0,length/2),fadeOut=Math.min(event.fadeOut||0,length/2);
 const gain=event.volume*Math.min(1,fadeIn?clamp(t/fadeIn):1,fadeOut?clamp((length-t)/fadeOut):1);
 return <Audio src={event.src} trimBefore={Math.round((event.sourceIn||0)*fps)} durationInFrames={Math.max(1,Math.round(length*fps))} volume={gain} loop={event.loop===true} useWebAudioApi crossOrigin="anonymous"/>;
}

function AudioPlan({events}:{events:CompositionAudio[]}){
 const {fps}=useVideoConfig();
 return <>{events.filter(event=>event.volume>0&&event.duration>0).map(event=><Sequence key={event.id} from={Math.round(event.at*fps)} durationInFrames={Math.max(1,Math.round(event.duration*fps))} premountFor={15}><AudioEvent event={event}/></Sequence>)}</>;
}

export function CompositionRenderer({composition}:{composition:CompositionSpec|null}){
 const frame=useCurrentFrame(),{fps}=useVideoConfig();
 if(!composition)return null;
 return <AbsoluteFill style={{background:'#08090D',color:'#D8DCE3',fontFamily:'Arial',overflow:'hidden'}}>
  {composition.timeline.map(clip=><Sequence key={clip.id} from={clip.fromFrames} durationInFrames={clip.frames} premountFor={20}><ClipLayer clip={clip}/></Sequence>)}
  {composition.visuals.map(visual=><Sequence key={visual.id} from={Math.round(visual.at*fps)} durationInFrames={Math.max(1,Math.round(visual.duration*fps))} premountFor={20}><Visual visual={visual}/></Sequence>)}
  <AudioPlan events={composition.audio}/>
  <BrandTitle title={frame<fps*3?composition.captions.title:''}/>
  {composition.captions.enabled?<Caption words={composition.words} template={composition.captions.template} position={composition.captions.position}/>:null}
 </AbsoluteFill>;
}
