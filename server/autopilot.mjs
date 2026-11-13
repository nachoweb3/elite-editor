import {faceSettings} from './retouch-settings.mjs';
import {load,save,defaults} from './core.mjs';
import {analyze,render} from './engine.mjs';
import {planDirection} from './director.mjs';
import {decorate} from './decorate.mjs';

export function protectSpeech(clips,transcript,duration){
  const intervals=clips.filter(c=>c.enabled).map(c=>({start:c.start,end:c.end}));
  for(const segment of transcript)for(const word of segment.words?.length?segment.words:[segment]){
    intervals.push({start:Math.max(0,word.start-.12),end:Math.min(duration,word.end+.12)});
  }
  intervals.sort((a,b)=>a.start-b.start);const merged=[];
  for(const interval of intervals){const last=merged.at(-1);if(last&&interval.start<=last.end+.12)last.end=Math.max(last.end,interval.end);else merged.push({...interval});}
  return merged.map((c,i)=>({...c,id:String(i),enabled:true,reason:'Pausa recortada conservando las palabras reconocidas y margen de voz'}));
}

export async function autopilot(id,report,{reviewOnly=false}={}){
  let p=await load(id);p.history=[...(p.history||[]),{settings:p.settings,clips:p.clips,audioTracks:p.audioTracks||[],transcript:p.transcript,manual:p.manual===true,automatic:structuredClone(p.automatic??null)}].slice(-20);p.manual=false;
  p.settings={...defaults,...faceSettings(p.settings),language:'es',profile:p.media.width>=p.media.height?'youtube':'reels',fit:'contain',subtitle:'Cinematic',subtitlePosition:'top',style:'CINEMATIC',transition:0,cleanAudio:p.media.audio};
  p.automatic={status:'working',decisions:[],startedAt:new Date().toISOString()};await save(p);
  await analyze(id,report);p=await load(id);
  if(p.media.audio&&!p.analysis.transcriptionComplete)throw new Error('No he podido transcribir el audio. El original está guardado. Puedes volver a intentarlo; los detalles están en el registro.');
  p.clips=protectSpeech(p.clips,p.transcript,p.media.duration);
  let length=p.clips.reduce((a,c)=>a+c.end-c.start,0);
  if(!p.clips.length){p.clips=[{id:'0',start:0,end:p.media.duration,enabled:true,reason:'Se conserva todo: los recortes automáticos eran demasiado extensos'}];length=p.media.duration;}
  const brightness=(p.analysis.scenes||[]).map(s=>s.brightness).filter(Number.isFinite);
  if(brightness.length){const mean=brightness.reduce((a,b)=>a+b,0)/brightness.length;p.settings.exposure=Math.round(Math.max(-.04,Math.min(.05,(.45-mean)*.2))*100)/100;}
  p.automatic.decisions=[{label:'Ritmo',detail:`${Math.max(0,p.media.duration-length).toFixed(1)} s de pausas recortadas. Se protegen las palabras reconocidas.`},{label:'Voz',detail:p.media.audio?'Reducción de ruido y normalización de volumen.':'La fuente no contiene audio.'},{label:'Imagen',detail:`Encuadre completo. ${p.settings.exposure?'Ajuste suave de exposición según la luminosidad detectada.':'Exposición conservada.'}`},{label:'Subtítulos',detail:`${p.transcript.length} bloques sincronizados y marca NACHO WEB3.`},{label:'Acabado',detail:'Fundidos breves en los cortes. Sin música añadida automáticamente.'}];
  try{
    p.automatic.direction=await planDirection(p,report);
    for(const event of p.automatic.direction.events){p.clips=p.clips.flatMap(c=>event.at>c.start+.5&&event.at<c.end-.5?[{...c,end:event.at},{...c,id:c.id+'-topic',start:event.at,transitionIn:event.effect}]:[c]);}
    p.automatic.decisions.push({label:'Cambios de explicación',detail:`${p.automatic.direction.events.length} transiciones propuestas por el analizador del discurso.`},{label:'Recursos',detail:`${p.automatic.direction.media.length} memes, sonidos o imágenes seleccionados por contexto.`});
    p.automatic.decisions=p.automatic.decisions.map(d=>d.label==='Acabado'?{...d,detail:'Transiciones en cambios de explicación. Cortes limpios en pausas.'}:d);
  }catch(error){p.analysis.warnings.push('Análisis de significado no disponible: '+error.message);p.automatic.decisions.push({label:'Análisis de significado',detail:'No se completó. Se conserva una edición básica sin inserciones inventadas.'});}
  p.revision++;p.reviewed=false;await save(p);
  report('Preparando el montaje automático');
  await render(id,true,report,{automatic:true});
  await decorate(id,true,report);
  if(reviewOnly){p=await load(id);p.automatic.status='review';p.automatic.finishedAt=new Date().toISOString();await save(p);report('Edición lista para revisar. Exporta cuando estés conforme.');return p;}
  report('La vista previa está lista. Exportando calidad final');
  await render(id,false,report,{automatic:true});
  await decorate(id,false,report);
  p=await load(id);p.automatic.status='done';p.automatic.finishedAt=new Date().toISOString();await save(p);
  report('Edición terminada. Ya puedes verla y descargarla');return p;
}
