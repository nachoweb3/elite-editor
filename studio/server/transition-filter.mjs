import {CLIP_TRANSITIONS} from '../shared/transitions.mjs';

function slideFilter(preset,duration) {
  const horizontal=preset.axis==='x';
  const progress=preset.direction>0? `min(1,t/${duration})` : `max(0,1-t/${duration})`;
  if(horizontal){
    const padding=preset.direction>0?'iw':0;
    return `,pad=iw*2:ih:${padding}:0:color=black,crop=iw/2:ih:x='iw/2*${progress}':y=0`;
  }
  const padding=preset.direction>0?'ih':0;
  return `,pad=iw:ih*2:0:${padding}:color=black,crop=iw:ih/2:x=0:y='ih/2*${progress}'`;
}

function revealFilter(preset,duration) {
  const progress=`T/${duration}`;
  let inside;
  if(preset.kind==='wipe-right')inside=`lt(X,W*${progress})`;
  else if(preset.kind==='wipe-diagonal')inside=`lt((X/W+Y/H)/2,${progress})`;
  else if(preset.kind==='open'){
    const coordinate=preset.axis==='x'?'X/W':'Y/H';
    inside=`lt(abs(${coordinate}-0.5),(${progress})/2)`;
  }else{
    inside=`lt((X-W/2)^2+(Y-H/2)^2,(${progress})^2*(W*W+H*H)/4)`;
  }
  // Mask in YUV420p. The hidden area is video-range black. Bypass geq after the effect.
  const channel=(name,read,level)=>`${name}='if(${inside},${read}(X,Y),${level})'`;
  return ',geq='+[
    channel('lum','lum',16),
    channel('cb','cb',128),
    channel('cr','cr',128),
    `enable='lt(t,${duration})'`,
  ].join(':');
}

export function transitionFilter(transition,length) {
  const enter=transition?.in;
  const leave=transition?.out;
  if(!enter&&!leave)return '';
  let filter=',setpts=PTS-STARTPTS';
  if(enter){
    const preset=CLIP_TRANSITIONS[enter.type];
    if(preset?.kind==='fade')filter+=`,fade=t=in:st=0:d=${enter.duration}:color=${preset.color}`;
    else if(preset?.kind==='slide')filter+=slideFilter(preset,enter.duration);
    else if(preset)filter+=revealFilter(preset,enter.duration);
  }
  if(leave)filter+=`,fade=t=out:st=${Math.max(0,length-leave.duration)}:d=${leave.duration}:color=black`;
  return filter;
}
