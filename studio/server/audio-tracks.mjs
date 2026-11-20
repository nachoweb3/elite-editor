export function validateTracks(tracks,assets){
 if(!Array.isArray(tracks)||tracks.length>64)throw new Error('Máximo 64 clips de audio');
 const ids=new Set();
 return tracks.map(t=>{
  const asset=assets.find(a=>a.id===t.assetId&&['sound','music'].includes(a.kind));
  if(!asset||!Number.isFinite(asset.duration)||asset.duration<=0)throw new Error('Recurso de audio no disponible');
  if(typeof t.id!=='string'||!t.id||t.id.length>100||ids.has(t.id))throw new Error('Identificador de audio inválido');ids.add(t.id);
  for(const [key,min,max] of [['at',0,86400],['sourceIn',0,asset.duration],['duration',.001,asset.duration],['volume',0,2],['fadeIn',0,3],['fadeOut',0,3]])if(!Number.isFinite(t[key])||t[key]<min||t[key]>max)throw new Error('Control de audio inválido: '+key);
  if(t.sourceIn+t.duration>asset.duration+.0001)throw new Error('El recorte supera el audio original');
  for(const key of ['muted','locked'])if(t[key]!==undefined&&typeof t[key]!=='boolean')throw new Error('Estado de pista inválido');
  return {id:t.id,assetId:asset.id,name:asset.name,kind:asset.kind,sourceDuration:asset.duration,at:t.at,sourceIn:t.sourceIn,duration:t.duration,volume:t.volume,fadeIn:t.fadeIn,fadeOut:t.fadeOut,muted:t.muted===true,locked:t.locked===true};
 });
}

// Manual clips are anchored to montage time. Material past the video end is omitted.
export function mixTracks(tracks,assets,duration,args,inputIndex,audio){
 let graph='';
 for(const t of validateTracks(tracks,assets)){
  if(t.muted||t.volume===0||t.at>=duration)continue;
  const asset=assets.find(a=>a.id===t.assetId),i=inputIndex++,length=Math.min(t.duration,duration-t.at);
  const fadeIn=Math.min(t.fadeIn,t.duration/2),fadeOut=Math.min(t.fadeOut,t.duration/2);
  args.push('-i',asset.file);
  graph+=`[${i}:a]atrim=start=${t.sourceIn}:duration=${length},asetpts=PTS-STARTPTS,aresample=48000,volume=${t.volume}`;
  if(fadeIn)graph+=`,afade=t=in:st=0:d=${fadeIn}`;
  if(fadeOut)graph+=`,afade=t=out:st=${t.duration-fadeOut}:d=${fadeOut}`;
  graph+=`,adelay=${Math.round(t.at*1000)}:all=1[track${i}];[${audio}][track${i}]amix=inputs=2:duration=first:normalize=0[trackmix${i}];`;
  audio=`trackmix${i}`;
 }
 return {graph,audio,inputIndex};
}
