// The clip inspector, Remotion monitor and FFmpeg renderer share these choices.
export const CLIP_TRANSITIONS = Object.freeze({
  fadeblack: {label:'Fundido desde negro',group:'Fundidos',duration:.18,kind:'fade',color:'black'},
  fadewhite: {label:'Destello blanco',group:'Fundidos',duration:.18,kind:'fade',color:'white'},
  slide: {label:'Desde la derecha',group:'Desplazamientos',duration:.22,kind:'slide',axis:'x',direction:1},
  'slide-left': {label:'Desde la izquierda',group:'Desplazamientos',duration:.36,kind:'slide',axis:'x',direction:-1},
  'slide-top': {label:'Desde arriba',group:'Desplazamientos',duration:.36,kind:'slide',axis:'y',direction:-1},
  'slide-bottom': {label:'Desde abajo',group:'Desplazamientos',duration:.36,kind:'slide',axis:'y',direction:1},
  'wipe-right': {label:'Barrido horizontal',group:'Revelados',duration:.38,kind:'wipe-right'},
  'wipe-diagonal': {label:'Barrido diagonal',group:'Revelados',duration:.48,kind:'wipe-diagonal'},
  'open-horizontal': {label:'Apertura horizontal',group:'Revelados',duration:.44,kind:'open',axis:'x'},
  'open-vertical': {label:'Apertura vertical',group:'Revelados',duration:.44,kind:'open',axis:'y'},
  iris: {label:'Apertura circular',group:'Revelados',duration:.52,kind:'iris'},
});

export function isClipTransition(value) {
  return typeof value === 'string' && Object.hasOwn(CLIP_TRANSITIONS,value);
}
