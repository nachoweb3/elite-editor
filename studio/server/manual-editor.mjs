import {load,save,validateSettings,readAssets,MOTIONS} from './core.mjs';
import {validateTracks} from './audio-tracks.mjs';
import {isClipTransition} from '../shared/transitions.mjs';
export function validateManualClips(clips,sources){
 if(!Array.isArray(clips)||!clips.length||clips.length>2000)throw new Error('Añade entre 1 y 2000 clips');
 const ids=new Set();return clips.map((c,i)=>{const source=sources.get(c.sourceId),id=String(c.id||i),transition=c.transitionIn||'none';if(ids.has(id))throw new Error('Cada clip necesita un identificador único');ids.add(id);if(!source||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>source.media.duration+.001||c.end-c.start<1/30-.001)throw new Error(`Revisa los límites del clip ${i+1}`);if(transition!=='none'&&!isClipTransition(transition))throw new Error('Transición no válida');if(!MOTIONS.includes(c.motion||'none'))throw new Error('Movimiento de cámara no válido');return {id,sourceId:c.sourceId,sourceName:source.name,sourceDuration:source.media.duration,start:c.start,end:c.end,enabled:true,transitionIn:transition,motion:c.motion||'none',reason:'Montaje manual'};});
}
export async function saveManual(id,body){
 const p=await load(id);if(p.revision!==body.revision)throw new Error('El montaje cambió. Recarga antes de guardar');
 const sources=new Map();if(!Array.isArray(body.clips)||(!body.clips.length&&!p.blank)||body.clips.length>2000)throw new Error('Añade entre 1 y 2000 clips');for(const c of body.clips){if(!sources.has(c.sourceId))sources.set(c.sourceId,await load(c.sourceId));}
 const clips=body.clips.length?validateManualClips(body.clips,sources):[],settings=validateSettings(body.settings);
 const audioTracks=validateTracks(body.audioTracks??p.audioTracks??[],await readAssets());
 p.history=[...(p.history||[]),{audioTracks:p.audioTracks||[],settings:p.settings,clips:p.clips,transcript:p.transcript,manual:p.manual===true,automatic:structuredClone(p.automatic??null)}].slice(-20);p.clips=clips;p.audioTracks=audioTracks;p.settings=settings;p.revision++;p.reviewed=true;p.artifacts={};p.manual=true;
 // Keep contextual resources anchored to an occurrence of the original speech.
 if(p.automatic?.direction){for(const key of ['events','media'])p.automatic.direction[key]=(p.automatic.direction[key]||[]).flatMap(e=>{let offset=0;for(const c of clips){if(c.sourceId===id&&e.at>=c.start&&e.at<c.end)return [{...e,outputTime:offset+e.at-c.start}];offset+=c.end-c.start;}return [];});}
 return save(p);
}
