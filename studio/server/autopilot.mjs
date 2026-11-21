import fs from 'node:fs/promises';
import path from 'node:path';
import {automaticFaceSettings} from './retouch-settings.mjs';
import {ROOT,config,load,save,defaults} from './core.mjs';
import {analyze,readAssets} from './engine.mjs';
import {render} from './render-pipeline.mjs';
import {sanitizeTranscript,fillerIntervals,removeIntervals} from './dialogue-clean.mjs';
import {planMemes} from './meme-plan.mjs';
import {applyPlannedTransitions,planDirection,planLocalTransitions} from './director.mjs';
import {decorate} from './decorate.mjs';
import {planBroll} from './broll.mjs';
import {pexelsStatus} from './pexels.mjs';
import {resolveAutomationProfile} from './automation-options.mjs';

export function protectSpeech(clips,transcript,duration){
  if(!transcript.length)return clips.filter(c=>c.enabled);
  const intervals=clips.filter(c=>c.enabled).map(c=>({start:c.start,end:c.end}));
  for(const segment of transcript)for(const word of segment.words?.length?segment.words:[segment]){
    intervals.push({start:Math.max(0,word.start-.12),end:Math.min(duration,word.end+.12)});
  }
  intervals.sort((a,b)=>a.start-b.start);const merged=[];
  for(const interval of intervals){const last=merged.at(-1);if(last&&interval.start<=last.end+.12)last.end=Math.max(last.end,interval.end);else merged.push({...interval});}
  return merged.map((c,i)=>({...c,id:String(i),enabled:true,reason:'Pausa recortada conservando las palabras reconocidas y margen de voz'}));
}

export async function autopilot(id,report,{reviewOnly=false,signal,options={}}={}){
  let p=await load(id);
  const profile=resolveAutomationProfile(p.media,options.targetFormat);
  if(p.media.audio){
    const {model}=await config();
    try{await fs.access(path.join(ROOT,'models',model,'model.bin'));}
    catch{throw new Error('Falta el modelo local de Whisper. Sigue la guía del estudio y ejecuta npm run model:tiny antes de montar grabaciones con audio.');}
  }
  p.history=[...(p.history||[]),{settings:p.settings,clips:p.clips,audioTracks:p.audioTracks||[],transcript:p.transcript,manual:p.manual===true,automatic:structuredClone(p.automatic??null)}].slice(-20);p.manual=false;
  const useMaxBeauty=typeof options.beauty==='boolean'?options.beauty:(p.settings.beautyAuto===true);
  const face=automaticFaceSettings(p.settings,options.beauty);
  const useSubtitles=typeof options.subtitles==='boolean'?options.subtitles:(typeof p.settings.subtitles==='boolean'?p.settings.subtitles:true);
  const subPosition=options.subtitlePosition||p.settings.subtitlePosition||'top';
  const subTemplate=options.subtitle||p.settings.subtitle||'Cinematic';
  const useMemes=typeof options.memes==='boolean'?options.memes:(options.autoMemes!==false);
  const useMusic=typeof options.music==='boolean'?options.music:true;
  const useBroll=options.broll!==false;

  p.settings={...defaults,...face,beautyAuto:useMaxBeauty,language:'es',profile,fit:'contain',subtitle:subTemplate,subtitlePosition:subPosition,style:'CINEMATIC',transition:0,cleanAudio:p.media.audio,subtitles:useSubtitles,
    encoder:p.settings.encoder??defaults.encoder,frameRate:p.settings.frameRate??defaults.frameRate,exportQuality:p.settings.exportQuality??defaults.exportQuality};
  p.automatic={status:'working',decisions:[],startedAt:new Date().toISOString()};await save(p);
  report('[agente] Modo autónomo: analizando voz, silencios, imagen y discurso');
  if(useMaxBeauty)report('[agente] Belleza automática al máximo: piel, ojeras, mirada, lifting y rasgos');
  await analyze(id,report);p=await load(id);
  if(p.media.audio&&!p.analysis.transcriptionComplete)throw new Error('No he podido transcribir el audio. El original está guardado. Puedes volver a intentarlo; los detalles están en el registro.');
  p.transcript=sanitizeTranscript(p.transcript);
  p.clips=protectSpeech(p.clips,p.transcript,p.media.duration);
  p.clips=removeIntervals(p.clips,fillerIntervals(p.transcript));
  if(!p.clips.length)p.clips=[{id:'0',start:0,end:p.media.duration,enabled:true,reason:'Se conserva todo: los recortes automáticos eran demasiado extensos'}];
  const length=p.clips.reduce((a,c)=>a+c.end-c.start,0);
  const brightness=(p.analysis.scenes||[]).map(s=>s.brightness).filter(Number.isFinite);
  if(brightness.length){const mean=brightness.reduce((a,b)=>a+b,0)/brightness.length;p.settings.exposure=Math.round(Math.max(-.04,Math.min(.05,(.45-mean)*.2))*100)/100;}
  const finish={label:'Acabado',detail:useMusic?'Cortes limpios con música de fondo suave cuando hay un recurso disponible.':'Cortes limpios sin música de fondo añadida.'};
  const decisions=[
    {label:'Ritmo',detail:`${Math.max(0,p.media.duration-length).toFixed(1)} s de pausas recortadas. Se protegen las palabras reconocidas.`},
    {label:'Voz',detail:p.media.audio?(p.transcript.length?'Reducción de ruido y normalización de volumen.':'No se detectó voz; se conserva la grabación completa y se evita cortar audio musical o ambiente.'):'La fuente no contiene audio.'},
    {label:'Imagen',detail:`Encuadre completo. ${p.settings.exposure?'Ajuste suave de exposición según la luminosidad detectada.':'Exposición conservada.'}`},
    {label:'Belleza',detail:useMaxBeauty?'Retoque facial automático máximo: piel suavizada, ojeras atenuadas, mirada iluminada, lifting y rasgos ajustados.':face.faceRetouch?'Retoque facial manual conservado.':'Retoque facial desactivado.'},
    {label:'Subtítulos',detail:useSubtitles?(p.transcript.length?`${p.transcript.length} bloques sincronizados (${subPosition==='top'?'arriba':'abajo'}) y marca NACHO WEB3.`:'No hay voz transcrita; no se añaden subtítulos automáticos.'):'Subtítulos desactivados por el usuario.'},
    finish
  ];
  let direction={events:[],media:[],credits:[]};
  if(useMemes){
    try{
      direction=await planDirection(p,report,{signal});
      direction.credits=[];
      if(direction.media.length<4){
        const extra=await planMemes({transcript:p.transcript,clips:p.clips,sourceId:id,duration:p.media.duration});
        direction.media.push(...extra.media);
        direction.credits=[...(direction.credits||[]),...(extra.credits||[])];
        decisions.push(...extra.decisions);
      }
      direction.credits=[...new Set([...(direction.credits||[]),...direction.media.map(item=>item.attribution).filter(Boolean)])];
      p.automatic.direction=direction;
      decisions.push({label:'Recursos',detail:`${direction.media.length} memes, sonidos o imágenes seleccionados por contexto.`});
    }catch(error){
      signal?.throwIfAborted();
      p.analysis.warnings.push('Análisis de significado no disponible: '+error.message);
      let extra={media:[],decisions:[],credits:[]};
      try{extra=await planMemes({transcript:p.transcript,clips:p.clips,sourceId:id,duration:p.media.duration});}
      catch(fallbackError){p.analysis.warnings.push('Recursos locales no disponibles: '+fallbackError.message);}
      direction={events:[],media:extra.media,credits:extra.credits||[]};p.automatic.direction=direction;decisions.push(...extra.decisions);
      decisions.push({label:'Análisis de significado',detail:'No se completó. Se usan memes y sonidos locales por palabras clave, sin inserciones inventadas.'});
    }
  }else{
    p.automatic.direction=direction;
    decisions.push({label:'Memes y sonidos',detail:'Desactivados para este montaje.'});
  }
  const analyzedTransitions=applyPlannedTransitions(p.clips,direction.events);
  const transitions=analyzedTransitions.events.length?analyzedTransitions:applyPlannedTransitions(p.clips,planLocalTransitions(p.transcript,p.clips));
  p.clips=transitions.clips;
  direction.events=transitions.events;
  if(transitions.events.length){
    finish.detail+=' Las transiciones señalan cambios de explicación o de sección.';
    decisions.push({label:'Cambios de explicación',detail:`${transitions.events.length} ${transitions.events.length===1?'transición aplicada':'transiciones aplicadas'}.`});
  }
  if(useBroll){
    if((await pexelsStatus()).configured){
      const stock=await planBroll(p,direction.stockRequests||[],report,{signal});
      direction.media=[...stock,...direction.media];
      direction.credits=[...new Set([...direction.credits,...stock.map(item=>item.attribution)])];
      const count=stock.length;
      decisions.push({label:'Apoyo visual de Pexels',detail:count?`${count} ${count===1?'recurso incorporado':'recursos incorporados'} conservando la voz original.`:'No se encontró un recurso pertinente para los tramos disponibles.'});
    }else if(options.broll===true){
      p.analysis.warnings.push('Pexels no está configurado. Guarda PEXELS_API_KEY en .env.local para añadir vídeo de apoyo.');
    }
  }
  if(direction.credits.length)decisions.push({label:'Créditos de recursos',detail:direction.credits.join(' · ')});
  if(useMusic){
    const musicAssets=await readAssets();
    const music=musicAssets.find(asset=>asset.kind==='music'&&/Misión plausible|Jazz desenfadado|Shadow neutra/i.test(asset.name))||musicAssets.find(asset=>asset.kind==='music');
    if(music){p.settings.musicId=music.id;p.settings.musicVolume=0.06;p.settings.soundEffects=false;}
  }else{
    p.settings.musicId=null;
  }
  const extraFillers=fillerIntervals(p.transcript).length;
  if(extraFillers)decisions.push({label:'Diálogo',detail:`${extraFillers} sonidos de duda o muletillas recortados.`});
  p.automatic.decisions=decisions;
  p.revision++;p.reviewed=false;await save(p);
  report('[agente] Montaje decidido. Renderizando vista previa en directo');
  await render(id,true,report,{automatic:true,signal});
  await decorate(id,true,report,{signal});
  if(reviewOnly){p=await load(id);p.automatic.status='review';p.automatic.finishedAt=new Date().toISOString();await save(p);report('Edición lista para revisar. Exporta cuando estés conforme.');return p;}
  report('La vista previa está lista. Exportando calidad final');
  await render(id,false,report,{automatic:true,signal});
  await decorate(id,false,report,{signal});
  p=await load(id);p.reviewed=true;p.automatic.status='done';p.automatic.finishedAt=new Date().toISOString();await save(p);
  report('[agente] Entrega verificada. Vídeo final listo para descargar');
  report('Edición terminada. Ya puedes verla y descargarla');return p;
}
