import {remapWords,cues} from './subtitles.mjs';

// Transport manifest in seconds; the editor converts to its native MediaTime.
export function opencutManifest(p){
  if(p.blank||!p.source)throw Error('Selecciona una grabación original');
  if(p.clips.some(c=>c.enabled&&c.sourceId&&c.sourceId!==p.id))throw Error('El montaje contiene otras fuentes; importa sus medios por separado');
  let at=0;
  const clips=p.clips.filter(c=>c.enabled).map(c=>{
    if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>p.media.duration+.001||c.end<=c.start)throw Error('Corte inválido');
    const clip={name:c.reason||'Corte IA',start:c.start,end:c.end,at};at+=c.end-c.start;return clip;
  });
  if(!clips.length)throw Error('No hay cortes activos');
  return {version:1,projectId:p.id,revision:p.revision,name:p.name,sourceUrl:`/nacho-api/projects/${p.id}/media`,proxyUrl:`/nacho-api/projects/${p.id}/proxy`,sourceDuration:p.media.duration,duration:at,clips,
    captions:p.settings.subtitles?cues(remapWords(p.transcript||[],p.clips)).map(g=>({start:g[0].start,end:g.at(-1).end,text:g.map(w=>w.word.trim()).join(' ')})):[],
    limitations:['Se transfieren cortes y subtítulos. Para retoque y voz limpia, prepara y aplica el original mejorado. Las transiciones y la decoración del motor no se transfieren como capas.',
      ...(p.clips.some(c=>c.enabled&&c.motion&&c.motion!=='none')?['Los movimientos de cámara del motor no se transfieren; revísalos en el vídeo procesado.']:[]),
      ...(p.stickmen?.enabled&&p.stickmen.items?.length?['Las explicaciones stickman solo están en el vídeo procesado. Esta importación conserva los cortes originales, sin las inserciones ni su duración adicional.']:[])]};
}
