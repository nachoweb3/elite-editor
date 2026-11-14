// Deterministic interpreter for common editing instructions (Spanish and English).
// It produces the same plan shape as the local model, so applyPlan validates both
// paths identically. It never guesses times: a cut needs explicit numbers.
import {defaults} from './core.mjs';
import {LUT_TITLES} from './library/forge/luts.mjs';

const LIMITS={
 contrast:[.7,1.4,.12],saturation:[0,1.5,.2],exposure:[-.15,.15,.05],zoom:[1,1.18,.06],musicVolume:[0,.3,.03],
 videoSharpen:[0,1,.25],videoDenoise:[0,1,.25],audioNoiseReduction:[0,30,6],audioHighpass:[0,200,40],
 faceSmooth:[0,1,.15],faceLight:[0,1,.15],faceUnderEyes:[0,1,.2],faceEyes:[0,1,.15],faceTeeth:[0,1,.2],faceJaw:[0,1,.15],
 faceWrinkles:[0,1,.2],faceTexture:[0,1,.2],faceWarmth:[-1,1,.25],faceLipColor:[0,1,.2],
 faceEyeSize:[-1,1,.15],faceNoseSize:[-1,1,.15],faceMouthSize:[-1,1,.15],faceWidth:[-1,1,.15],
};
const LABELS={contrast:'contraste',saturation:'color',exposure:'exposición',zoom:'zoom',musicVolume:'volumen de la música',videoSharpen:'nitidez',videoDenoise:'reducción de ruido de vídeo',audioNoiseReduction:'reducción de ruido de voz',audioHighpass:'filtro de graves',faceSmooth:'suavizado de piel',faceLight:'luz del rostro',faceUnderEyes:'corrección de ojeras',faceEyes:'detalle de ojos',faceTeeth:'blanqueado dental',faceJaw:'contorno facial',faceWrinkles:'suavizado de arrugas',faceTexture:'detalle de piel',faceWarmth:'temperatura de piel',faceLipColor:'color de labios',faceEyeSize:'tamaño de ojos',faceNoseSize:'tamaño de nariz',faceMouthSize:'tamaño de boca',faceWidth:'anchura facial',lut:'look de color',audioTargetLufs:'volumen objetivo',subtitles:'subtítulos',subtitlePosition:'posición de subtítulos',profile:'formato',subtitle:'estilo de subtítulos',title:'título',cleanAudio:'limpieza de audio',audioNormalize:'normalización de voz',soundEffects:'efectos de sonido',faceRetouch:'retoque facial'};

const NUMBER_WORDS={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veinticinco:25,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,noventa:90,cien:100,
 one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,ninety:90,hundred:100};

export function normalize(text){
 let t=String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
 t=t.replace(/(\d),(\d)/g,'$1.$2').replace(/[^a-z0-9:.%\s,;]/g,' ').replace(/\.(?!\d)/g,' , ').replace(/(?<!\d)\./g,' ');
 // Intensity phrases first, so "un poco" never becomes "1 poco".
 t=t.replace(/\bun (poco|pelin|pelito|toque)\b/g,'poco').replace(/\ba (bit|little|touch)\b/g,'poco');
 t=t.replace(/\bmedio (minuto|segundo)\b/g,'0.5 $1').replace(/\bhalf (a )?(minute|second)\b/g,'0.5 $2');
 t=t.replace(/\b([a-z]+)\b/g,w=>NUMBER_WORDS[w]!==undefined?String(NUMBER_WORDS[w]):w);
 t=t.replace(/(\d+(?:\.\d+)?)\s*(minutos?|minutes?|mins?)\s+(?:y|and)\s+(?:medio|a half)\b/g,(_,n,u)=>`${Number(n)+.5} ${u}`);
 return t.replace(/\s+/g,' ').trim();
}

const UNIT='(horas?|hours?|h|minutos?|minutes?|mins?|m|segundos?|seconds?|secs?|seg|s)';
const NUM='(\\d+:\\d{1,2}(?::\\d{1,2})?(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
function seconds(value,unit){
 if(value.includes(':')){const parts=value.split(':').map(Number);return parts.reduce((a,v)=>a*60+v,0);}
 const n=Number(value),u=unit||'s';
 if(/^h/.test(u))return n*3600;
 if(/^m/.test(u))return n*60;
 return n;
}
const leadUnit=word=>word?/^min/.test(word)?'min':/^h/.test(word)?'h':'s':'';
const REMOVE=/\b(elimina|eliminar|eliminame|quita|quitar|quitame|corta|cortar|cortame|borra|borrar|recorta|recortar|suprime|saca|sacar|remove|cut|delete|trim|drop|skip)\b/;

export function parseCuts(text,duration){
 const cuts=[],notes=[];let rest=text;
 if(!REMOVE.test(text))return {cuts,notes,rest};
 const take=(re,fn)=>{rest=rest.replace(re,(...m)=>{const r=fn(m);if(r)cuts.push(r);return ' ';});};
 // Ranges first: "del segundo 10 al 20", "entre 1:00 y 1:30", "from 5 to 8 seconds".
 take(new RegExp(`\\b(?:del?|desde(?: el)?|from|entre(?: el)?|between)\\s+(?:(segundo|minuto|second|minute)s?\\s+)?${NUM}\\s*${UNIT}?\\s+(?:al?|hasta(?: el)?|to|until|till|y(?: el)?|and)\\s+(?:(segundo|minuto|second|minute)s?\\s+)?${NUM}\\s*${UNIT}?\\b`,'g'),m=>{
  const [,leadA,a,unitA,leadB,b,unitB]=m;const ua=unitA||leadUnit(leadA)||unitB||leadUnit(leadB)||'s',ub=unitB||leadUnit(leadB)||unitA||leadUnit(leadA)||'s';
  return {start:seconds(a,ua),end:seconds(b,ub)};
 });
 take(/\b(?:el\s+|the\s+)?(primer|first|ultimo|last)\s+(segundo|minuto|second|minute)\b/g,m=>{const length=/^min/.test(m[2])?60:1;return /^(primer|first)$/.test(m[1])?{start:0,end:length}:{start:duration-length,end:duration};});
 take(new RegExp(`\\b(?:(?:los|las|the)\\s+)?(?:primeros?|primeras?|first)\\s+${NUM}\\s*${UNIT}?`,'g'),m=>({start:0,end:seconds(m[1],m[2])}));
 take(new RegExp(`\\b(?:(?:los|las)\\s+)?${NUM}\\s+(?:primeros?|primeras?)\\s*${UNIT}?`,'g'),m=>({start:0,end:seconds(m[1],m[2])}));
 take(new RegExp(`\\b(?:(?:los|las|the)\\s+)?(?:ultimos?|ultimas?|last|finales)\\s+${NUM}\\s*${UNIT}?`,'g'),m=>({start:duration-seconds(m[1],m[2]),end:duration}));
 take(new RegExp(`\\b(?:(?:los|las)\\s+)?${NUM}\\s+(?:ultimos?|ultimas?)\\s*${UNIT}?`,'g'),m=>({start:duration-seconds(m[1],m[2]),end:duration}));
 take(new RegExp(`\\b(?:a partir del?|desde el|after|everything after|todo (?:lo que va )?despues del?)\\s+(?:(segundo|minuto|second|minute)s?\\s+)?${NUM}\\s*${UNIT}?`,'g'),m=>({start:seconds(m[2],m[3]||leadUnit(m[1])),end:duration}));
 take(new RegExp(`\\b(?:todo hasta el|everything before|todo (?:lo que va )?antes del?|hasta el)\\s+(?:(segundo|minuto|second|minute)s?\\s+)?${NUM}\\s*${UNIT}?`,'g'),m=>({start:0,end:seconds(m[2],m[3]||leadUnit(m[1]))}));
 const valid=[];
 for(const c of cuts){
  let {start,end}=c;if(!Number.isFinite(start)||!Number.isFinite(end))continue;
  if(end<start)[start,end]=[end,start];
  start=Math.max(0,start);
  if(start>=duration){notes.push(`El segundo ${round(start,1)} está fuera del vídeo (${round(duration,1)} s)`);continue;}
  if(end>duration){notes.push('He ajustado el final del recorte a la duración del vídeo');end=duration;}
  if(end-start<.05)continue;
  valid.push({start:round(start,3),end:round(end,3)});
 }
 return {cuts:valid,notes,rest};
}

const ON=/\b(pon|ponme|poner|anade|agrega|activa|activar|muestra|mostrar|genera|incluye|usa|add|show|enable|turn on|include|use|quiero)\b/;
const OFF=/\b(quita|quitar|elimina|eliminar|sin|desactiva|desactivar|oculta|ocultar|borra|apaga|no|remove|hide|disable|turn off|without|mute|silencia)\b/;
const UP=/\b(sube|subir|subele|aumenta|aumentar|mas|resalta|realza|destaca|highlight|incrementa|potencia|refuerza|intensifica|increase|more|raise|boost|higher|louder|up|stronger|extra)\b/;
const DOWN=/\b(baja|bajar|bajale|reduce|reducir|disminuye|disminuir|menos|rebaja|atenua|suaviza|less|lower|decrease|down|softer|quieter|weaker|tone down)\b/;
const intensity=c=>/\b(poco|ligeramente|levemente|apenas|sutil|sutilmente|slightly|subtle|subtly)\b/.test(c)?.5:/\b(mucho|muchisimo|bastante|considerablemente|fuerte|a lot|lots|much|way|strongly|really)\b/.test(c)?2:1;
function explicitValue(clause,key){
 const m=/(?:\ba|\bal|\ben|\bto|=|\bhasta)\s+(-?\d+(?:\.\d+)?)\s*(%|por ciento|percent)?/.exec(clause);if(!m)return null;
 const n=Number(m[1]),pct=!!m[2]||n>(key==='audioNoiseReduction'?30:key==='audioHighpass'?200:5);
 if(key==='audioNoiseReduction'||key==='audioHighpass')return n;
 if(key==='exposure')return pct?n/100*.15:n;
 return pct?n/100:n;
}
const FACE=/\b(cara|rostro|face|facial|piel|skin)\b/;
// Each rule: which clause it reacts to, how direction is read, and an optional fixed effect.
const PICK_LABELS={reels:'vertical 9:16 (Reels)',tiktok:'vertical 9:16 (TikTok)',shorts:'vertical 9:16 (Shorts)',youtube:'horizontal 16:9 (YouTube)',youtube4k:'4K horizontal',Viral:'viral',Cinematic:'cine',Tutorial:'tutorial','Dark Future':'oscuro futurista'};
const CAPTION_STYLE=/\b(subtitulos?|captions?|letras)\b.*\b(viral|tiktok|cine|cinematografic\w*|cinematic|peliculero|tutorial|educativ\w*|oscur\w*|dark|futurist\w*)\b/;
const RULES=[
 {key:'title',test:/\b(titulo|title)\b/,skip:true},
 {key:'subtitle',test:CAPTION_STYLE,pick:c=>{const s=CAPTION_STYLE.exec(c)?.[2]||'';return /viral|tiktok/.test(s)?'Viral':/cine|cinemat|pelicul/.test(s)?'Cinematic':/tutorial|educativ/.test(s)?'Tutorial':/oscur|dark|futur/.test(s)?'Dark Future':null;}},
 {key:'profile',test:c=>!CAPTION_STYLE.test(c)&&/\b(formato|vertical|horizontal|tiktok|reels?|shorts?|instagram|youtube|apaisado|panoramico|4k)\b|9:16|16:9/.test(c),
  pick:c=>/\b4k\b/.test(c)?'youtube4k':/\btiktok\b/.test(c)?'tiktok':/\bshorts?\b/.test(c)?'shorts':/\b(vertical|reels?|instagram)\b|9:16/.test(c)?'reels':/\b(horizontal|youtube|apaisado|panoramico)\b|16:9/.test(c)?'youtube':null},
 {key:'subtitles',test:/\b(subtitulos?|subtitles?|captions?|letras|rotulos|texto en pantalla)\b/,toggle:true},
 {key:'subtitlePosition',test:/\b(subtitulos?|subtitles?|captions?|letras|rotulos)\b.*\b(arriba|top|superior|encima)\b|\b(arriba|top)\b.*\b(subtitulos?|subtitles?|captions?)\b/,set:'top'},
 {key:'subtitlePosition',test:/\b(subtitulos?|subtitles?|captions?|letras|rotulos)\b.*\b(abajo|bottom|inferior|debajo)\b|\b(abajo|bottom)\b.*\b(subtitulos?|subtitles?|captions?)\b/,set:'bottom'},
 {key:'soundEffects',test:/\b(efectos de sonido|sound effects?|whoosh|sfx)\b/,toggle:true},
 {key:'musicVolume',test:/\b(musica|music|cancion|song|banda sonora)\b/,mute:/\b(quita|elimina|sin|silencia|mute|remove|without|no)\b.*\b(musica|music|cancion|song)\b|\b(musica|music)\b.*\b(fuera|off)\b/},
 {key:'contrast',test:/\b(contraste|contrast)\b/},
 {key:'saturation',test:/\b(saturacion|saturation|satura|colou?rs?|colores|colorido|vivos?|vibrant|vibrante|apagados?|desatura|desaturate|byn)\b/,
  fixed:c=>/\bbyn\b/.test(c)?{value:0}:/\b(apagados?|desatura|desaturate|muted)\b/.test(c)?{dir:-1}:/\b(vivos?|vibrant|vibrante)\b/.test(c)?{dir:1}:null},
 {key:'faceLight',test:c=>FACE.test(c)&&/\b(luz|ilumina|iluminar|aclara|aclarar|brillo|light|brighten|brighter|lighten|oscurece|darken)\b/.test(c),face:true,
  fixed:c=>/\b(oscurece|darken)\b|menos (luz|brillo)|less light/.test(c)?{dir:-1}:/\b(ilumina|iluminar|aclara|aclarar|brighten|brighter|lighten)\b|mas (luz|brillo)/.test(c)?{dir:1}:null},
 {key:'exposure',test:c=>!FACE.test(c)&&/\b(exposicion|exposure|brillo|brightness|luz|luminosidad|ilumina|iluminar|aclara|aclarar|oscurece|oscurecer|oscuro|oscura|claro|clara|bright|brighter|brighten|dark|darker|darken|light|lighter|quemado|sobreexpuesto|overexposed|underexposed)\b/.test(c),
  fixed:c=>/\b(oscurece|oscurecer|darker|darken|quemado|sobreexpuesto|overexposed)\b|mas oscur|menos (luz|brillo)/.test(c)?{dir:-1}:/\b(aclara|aclarar|ilumina|iluminar|brighter|brighten|lighter|underexposed)\b|mas (luz|claro|clara|brillo)|(muy|demasiado|esta|too) (oscuro|oscura|dark)/.test(c)?{dir:1}:null},
 {key:'zoom',test:/\b(zoom|acerca|acercate|acercar|aleja|alejate|alejar|encuadre|primer plano|close ?up|closer|further|zoom in|zoom out)\b/,
  fixed:c=>/\b(aleja|alejate|alejar|zoom out|further|sin zoom)\b|quita (el )?zoom|no zoom/.test(c)?{value:1}:/\b(acerca|acercate|acercar|closer|zoom in|primer plano|close ?up)\b/.test(c)?{dir:1}:null},
 {key:'videoSharpen',test:/\b(nitidez|nitido|nitida|enfoca|enfocar|sharp|sharpen|sharper|crisp|definicion|definido)\b/},
 {key:'videoDenoise',test:/\b(grano|granulado|grain|grainy|denoise)\b|ruido (de|del|en el) (video|imagen)|video noise|image noise/,corrective:true},
 {key:'audioNoiseReduction',test:c=>/\b(ruido|noise|hiss|zumbido|soplido|hum)\b/.test(c)&&!/\b(video|imagen|image|grano|grain)\b/.test(c),corrective:true,also:{cleanAudio:'true'}},
 {key:'cleanAudio',test:/\b(limpia|limpiar|limpieza|clean|cleanup|mejora|mejorar|improve|enhance)\b.*\b(audio|voz|voice|sonido|sound|micro|microfono)\b/,set:'true'},
 {key:'cleanAudio',test:/\b(audio|sonido|voz) original\b|no (limpies|toques) (el )?(audio|sonido|la voz)|raw audio/,set:'false'},
 {key:'audioNormalize',test:/\b(normaliza|normalizar|normalize|loudness|lufs|nivela|nivelar)\b/,set:'true',also:{cleanAudio:'true'}},
 {key:'audioHighpass',test:/\b(graves|rumble|retumbe|retumba|low end|bass)\b/,also:{cleanAudio:'true'},
  fixed:c=>/\b(mas|more|recupera|devuelve|restore)\b/.test(c)&&!/\b(quita|elimina|reduce|menos|less|remove)\b/.test(c)?{dir:-1}:{dir:1}},
 {key:'faceSmooth',test:/\b(piel|skin)\b.*\b(suave|suaviza|suavizar|lisa|smooth|smoother|retoca|retocar)\b|\b(suaviza|suavizar|smooth)\b.*\b(piel|skin)\b|\bimperfecciones|granos de la cara|blemish/,corrective:true,face:true},
 {key:'faceUnderEyes',test:/\b(ojeras|under ?eyes?|dark circles|bolsas)\b/,corrective:true,face:true},
 {key:'faceWrinkles',test:/\b(arrugas|wrinkles|lineas de expresion|patas de gallo)\b/,corrective:true,face:true},
 {key:'faceTeeth',test:/\b(dientes|teeth|blanquea|blanquear|whiten|sonrisa)\b/,corrective:true,face:true},
 {key:'faceEyes',test:c=>/\b(ojos|mirada|eyes)\b/.test(c)&&!/\b(ojeras|tamano|size|grandes|pequenos|bigger|smaller|agranda|amplia|achica|enlarge|larger)\b/.test(c),face:true},
 {key:'faceEyeSize',test:/\b(ojos|eyes)\b.*\b(grandes|mas grandes|pequenos|mas pequenos|bigger|smaller|larger|tamano|size)\b|\b(agranda|amplia|enlarge|bigger|larger)\b.*\b(ojos|eyes)\b/,face:true,
  fixed:c=>/\b(pequenos|smaller|reduce|reducir)\b/.test(c)?{dir:-1}:/\b(grandes|bigger|larger|agranda|amplia|enlarge)\b/.test(c)?{dir:1}:null},
 {key:'faceWarmth',test:/\b(piel|skin|tono|tone)\b.*\b(calida|calido|caliente|warm|warmer|fria|frio|cool|cooler|cold)\b/,face:true,
  fixed:c=>/\b(fria|frio|cool|cooler|cold)\b/.test(c)?{dir:-1}:{dir:1}},
 {key:'faceRetouch',test:/\b(sin retoque|quita el retoque|desactiva el retoque|no retouch|disable retouch|sin belleza)\b|\b(no|sin)\b.*\bretoqu/,set:'false'},
];
// "Más dinámico" is a recipe: rhythm comes from contrast, color and a slight push in.
const RECIPES=[
 {test:/\b(mas dinamico|mas dinamica|dinamismo|mas energia|mas vida|con mas fuerza|punchy|more dynamic|more energy|more punch|livelier)\b/,changes:{contrast:.08,saturation:.12,zoom:.03},label:'más energía: contraste, color y un leve acercamiento'},
 {test:/\b(cinematografico|cinematografica|cinematic|look de cine|peliculero)\b/,changes:{contrast:.1,saturation:-.12},label:'look cinematográfico: más contraste y color contenido'},
 {test:/\b(mas natural|natural look|menos retoque|less retouch)\b/,changes:{faceSmooth:-.12,faceLight:-.06},label:'retrato más natural'},
];

// Colour looks (LUT) need the word look/lut/estilo, so "ponlo en blanco y negro" keeps lowering saturation.
// Only "blanco y negro con contraste" names the look by itself. Accents are already stripped by normalize().
const LOOK_WORD=/\b(?:looks?|luts?|estilos?|styles?)\b/g;
const LOOK_OFF=[/\b(?:quita|quitar|quitame|quitale|elimina|eliminar|borra|borrar|sin|desactiva|desactivar|apaga|anula|anular|resetea|restablece|remove|delete|disable|without|reset|no)\b[^,;]*?\b(?:looks?|luts?)\b/,/\b(?:looks?|luts?)\b[^,;]*?\b(?:fuera|off|ninguno|ninguna|original|desactivado|desactivada)\b/];
const BYN_CONTRAST=/\bbyn\s+(?:(?:con|de|with|in)\s+)?(?:(?:alto|mucho|high|fuerte)\s+)?contrast(?:e|ado|ada)?\b|\b(?:alto|high)\s+contrast(?:e)?\s+(?:en\s+|in\s+)?byn\b/;
const SUBTITLE_WORDS=/\b(?:subtitulos?|subtitles?|captions?|letras|rotulos)\b/;
const LOOKS=[
 ['blanco-negro-contraste',/\bbyn\b|\bmonocrom\w*|\bnoir\b|\bbw\b/],
 ['cine-teal-naranja',/\b(?:cine|cinema|cinemat\w*|pelicula|peliculero|hollywood|blockbuster|tealorange|teal)\b/],
 ['calido-atardecer',/\b(?:calid[oa]s?|atardecer|sunset|warm|dorad[oa]|golden)\b/],
 ['frio-azulado',/\b(?:fri[oa]s?|azul|azulad[oa]|cold|cool|icy|helad[oa]|invierno|blue|bluish)\b/],
 ['vintage-70',/\b(?:vintage|retro|70s?|setentas?|setenta|antigu[oa])\b/],
 ['mate-pastel',/\b(?:mate|matte|pastel|lavad[oa]|desvaecid[oa]|faded)\b/],
 ['neon-cyberpunk',/\b(?:cyberpunk|ciberpunk|neon|synthwave|futurist\w*)\b/],
 ['bleach-bypass',/\b(?:bleach|bypass|blanqueo)\b/],
 ['verde-matrix',/\b(?:matrix|hacker)\b/],
 ['sepia-suave',/\bsepia\b/],
 ['dramatico-oscuro',/\b(?:dramatic\w*|oscur\w*|dark|moody|sombri[oa])\b/],
 ['vivo-youtuber',/\b(?:youtubers?|vivos?|vivas?|vibrante|vibrant|vivid|punchy|colorid[oa]|saturad[oa])\b/],
 ['piel-natural',/\bpiel\b|\bskin\b|\bretrato\b|\bportrait\b|\b(?:looks?|luts?|estilos?|styles?)\s+(?:de\s+|tipo\s+)?natural\b/],
 ['noche-americana',/\b(?:noche|night|nocturn[oa]|day for night)\b/],
];
const cut=(text,m)=>text.slice(0,m.index)+' '+text.slice(m.index+m[0].length);
// Returns {stem,rest} (stem '' removes the look) or null; rest is the clause without the words that were consumed.
function lookIn(clause){
 if(SUBTITLE_WORDS.test(clause))return null;
 for(const re of LOOK_OFF){const m=re.exec(clause);if(m)return {stem:'',rest:cut(clause,m)};}
 const byn=BYN_CONTRAST.exec(clause);if(byn)return {stem:'blanco-negro-contraste',rest:cut(clause,byn)};
 if(!new RegExp(LOOK_WORD.source).test(clause))return null;
 let best=null;
 for(const [stem,re] of LOOKS){const m=re.exec(clause);if(m&&(!best||m.index<best.m.index))best={stem,m};}
 return best?{stem:best.stem,rest:cut(clause,best.m).replace(LOOK_WORD,' ')}:null;
}
// Loudness target: "volumen para YouTube" -14, podcast -16, TV/broadcast -23, or "a 14 lufs" (normalize drops the minus sign).
const LOUD=/\b(?:volumen|volume|sonoridad|loudness|lufs|loudnorm|normaliza\w*|normalize|nivela\w*|audio|sonido|sound|voz|voice)\b/;
const LUFS_NUM=/\b(\d+(?:\.\d+)?)\s*lufs\b|\blufs\s*(?:a|to|en|=)?\s*(\d+(?:\.\d+)?)\b/;
const TARGETS=[[/\b(?:youtube|yt|streaming|spotify)\b/,-14,'YouTube'],[/\bpodcasts?\b/,-16,'podcast'],[/\b(?:tele|television|tv|broadcast|radio|emision)\b/,-23,'televisión']];
const BARE_TARGET=/\b(?:para|for)\s+(?:(?:la|el|un|1)\s+)?(?:podcasts?|tele|television|tv|broadcast|radio)\b/;
function loudnessIn(clause){
 if(/\b(?:musica|music|cancion|song|efectos?|sfx)\b/.test(clause))return null;
 const exact=LUFS_NUM.exec(clause);
 if(exact){const n=-Math.abs(Number(exact[1]??exact[2]));return {value:n,label:'',rest:cut(clause,exact)};}
 const earliest=from=>{let best=null;for(const [re,value,label] of TARGETS){const m=re.exec(clause.slice(from));if(m&&(!best||m.index<best.m.index))best={m,value,label,at:from+m.index};}return best;};
 const level=LOUD.exec(clause);let hit=level?earliest(level.index+level[0].length):null;
 if(!hit){const bare=BARE_TARGET.exec(clause);if(bare)hit=earliest(bare.index);}
 return hit?{value:hit.value,label:hit.label,rest:clause.slice(0,hit.at)+' '+clause.slice(hit.at+hit.m[0].length)}:null;
}

const round=(n,d=2)=>Math.round(n*10**d)/10**d;
const clamp=(key,v)=>Math.min(LIMITS[key][1],Math.max(LIMITS[key][0],v));

export function rulePlan(prompt,p){
 const duration=Number(p.media?.duration)||0,base={...defaults,...p.settings};
 // A quoted title is taken verbatim (case and accents intact) and hidden from the other rules.
 let raw=String(prompt),title=null;
 const quoted=/\b(?:t[ií]tulo|title)\b[^"«“”'»]{0,30}["«“']([^"»”']{1,120})["»”']/i.exec(raw);
 if(quoted){title=quoted[1].replace(/\s+/g,' ').trim();raw=raw.replace(quoted[0],' titulo ');}
 else if(/\b(quita|elimina|borra|sin|remove|delete|no)\b[^.,;]{0,20}\bt[ií]tulo\b|\bremove the title\b/i.test(raw))title='';
 const text=normalize(raw).replace(/\bblanco y negro\b|\bblack and white\b/g,'byn').replace(/\b(?:teal|turquesa)\s+(?:y|and)\s+(?:naranja|orange)\b|\b(?:naranja|orange)\s+(?:y|and)\s+teal\b/g,'tealorange'),{cuts,notes,rest}=parseCuts(text,duration);
 const values={},touched=new Set(),summary=[];
 if(title!==null&&title!==String(base.title||'')){values.title=title;touched.add('title');}
 if(title!==null&&title!==String(base.title||''))summary.push(title?`título «${title}»`:'título eliminado');
 if(title===''&&!base.title)notes.push('El vídeo no tiene título que quitar');
 // Only real changes are described; repeating a value already set stays silent.
 const setValue=(key,value,why)=>{values[key]=value;touched.add(key);if(why&&String(value)!==String(base[key]))summary.push(why);};
 const current=key=>key in values?values[key]:base[key];
 // "Aclara la imagen, está muy oscuro" states one wish twice: a key moves once per direction.
 const moved=new Map();
 const nudge=(key,dir,scale,why)=>{if(moved.get(key)===dir)return;moved.set(key,dir);const before=Number(current(key)),after=round(clamp(key,before+dir*LIMITS[key][2]*scale),key.startsWith('audio')?0:2);setValue(key,after,why||`${LABELS[key]} ${dir>0?'↑':'↓'}`);if(after===before)notes.push(`${LABELS[key]} ya está en su límite`);};
 const clauses=rest.split(/\s*(?:,|;|\by luego\b|\bluego\b|\bdespues\b|\bademas\b|\btambien\b|\band then\b|\bthen\b|\balso\b|\bpero\b|\bbut\b|\by\b|\band\b)\s*/).filter(c=>c.trim().length>1);
 const unrecognized=[],recipes=new Set();
 for(let clause of clauses){
  // Looks and loudness targets go first and consume their own words, so no other rule
  // (profile on "youtube", saturation on "vivo", recipe on "look de cine") fires on them.
  let handled=false;
  const look=lookIn(clause);
  if(look){
   handled=true;clause=look.rest;
   if(look.stem===current('lut')||(look.stem===''&&!current('lut')))notes.push(look.stem?`El look «${LUT_TITLES[look.stem]}» ya está aplicado`:'No hay ningún look de color que quitar');
   setValue('lut',look.stem,look.stem?`look de color: «${LUT_TITLES[look.stem]}»`:'look de color quitado');
  }
  const loud=loudnessIn(clause);
  if(loud){
   handled=true;clause=loud.rest;
   const target=Math.min(-9,Math.max(-24,round(loud.value,1)));
   if(target!==round(loud.value,1))notes.push(`Volumen objetivo limitado a ${target} LUFS`);
   if(target===Number(current('audioTargetLufs')))notes.push(`El volumen objetivo ya es ${target} LUFS`);
   setValue('audioTargetLufs',target,`volumen objetivo: ${target} LUFS${loud.label?` (${loud.label})`:''}`);
   // The target only acts when the voice normalisation runs, which needs the audio clean-up chain.
   for(const k of ['cleanAudio','audioNormalize'])if(!touched.has(k))setValue(k,'true');
  }
  if(handled&&!clause.replace(/[\s,;:.]+/g,''))continue;
  // Recipes ("más dinámico", "cinematográfico") apply once, and never to a caption style request.
  const recipe=RECIPES.find(r=>r.test.test(clause)&&!/\b(subtitulos?|captions?|letras)\b/.test(clause));
  if(recipe){if(!recipes.has(recipe)){recipes.add(recipe);for(const [key,delta] of Object.entries(recipe.changes)){const after=round(clamp(key,Number(current(key))+delta));setValue(key,after);}summary.push(recipe.label);}continue;}
  const scale=intensity(clause);let matched=handled;
  for(const rule of RULES){
   const hit=typeof rule.test==='function'?rule.test(clause):rule.test.test(clause);if(!hit)continue;matched=true;
   if(rule.skip)continue;
   if(rule.pick){const value=rule.pick(clause);if(value&&value!==current(rule.key))setValue(rule.key,value,`${LABELS[rule.key]}: ${PICK_LABELS[value]||value}`);continue;}
   if(rule.set!==undefined){setValue(rule.key,rule.set,`${LABELS[rule.key]}: ${rule.set==='true'?'activado':rule.set==='false'?'desactivado':rule.set==='top'?'arriba':rule.set==='bottom'?'abajo':rule.set}`);}
   else if(rule.toggle){const on=ON.test(clause),off=OFF.test(clause)&&(!on||clause.search(OFF)<clause.search(ON));if(!off&&!on&&rule.key==='subtitles'&&/\b(arriba|abajo|top|bottom|superior|inferior)\b/.test(clause))continue;setValue(rule.key,off?'false':'true',`${LABELS[rule.key]} ${off?'desactivados':'activados'}`);}
   else if(rule.key==='musicVolume'&&rule.mute.test(clause)){setValue('musicVolume',0,'música silenciada');}
   else{
    const explicit=explicitValue(clause,rule.key),fixed=rule.fixed?.(clause);
    if(explicit!==null&&Number.isFinite(explicit)){const v=round(clamp(rule.key,explicit),rule.key.startsWith('audio')?0:2);if(v!==explicit)notes.push(`${LABELS[rule.key]} limitado a ${v}`);setValue(rule.key,v,`${LABELS[rule.key]} = ${v}`);}
    else if(fixed&&'value' in fixed)setValue(rule.key,fixed.value,`${LABELS[rule.key]} = ${fixed.value}`);
    else{
     let dir=fixed?.dir??0;
     if(!dir){
      const down=DOWN.test(clause),up=UP.test(clause);
      // Corrective controls name the problem: "menos grano" or "quita ojeras" means more correction,
      // only "menos reducción / menos retoque" lowers the correction itself.
      if(rule.corrective)dir=/\b(menos|less|baja|reduce|lower)\b.*\b(reduccion|correccion|retoque|filtro|suavizado|blanqueado|limpieza|reduction|correction|filter|smoothing)\b/.test(clause)?-1:1;
      else dir=down&&!up?-1:up&&!down?1:down&&up?(clause.search(DOWN)<clause.search(UP)?-1:1):0;
     }
     if(!dir){notes.push(`No sé si subir o bajar ${LABELS[rule.key]}`);continue;}
     nudge(rule.key,dir,scale);
    }
   }
   if(rule.face&&rule.key!=='faceRetouch'&&!touched.has('faceRetouch'))setValue('faceRetouch','true');
   for(const [k,v] of Object.entries(rule.also||{}))if(!touched.has(k))setValue(k,v);
  }
  // Courtesy and connectors are not requests; anything else the rules missed is reported.
  if(!matched&&clause.replace(new RegExp(REMOVE.source,'g'),'').replace(/\b(por favor|porfa|please|gracias|thanks|ok|vale|venga|hazlo|haz|hacer|ponlo|dejalo|ahora|el|la|lo|los|las|un|una|de|del|al|que|me|mi|en|it|the|a|to|make|do|video|clip|todo|esto|eso|this|that|it s)\b/g,'').replace(/[\s,;:.]+/g,'').length>=3)unrecognized.push(clause.trim());
 }
 const changes=[...touched].filter(key=>String(values[key])!==String(base[key])).map(key=>({key,value:String(values[key])}));
 const cutText=cuts.map(c=>`${fmt(c.start)}–${fmt(c.end)}`).join(', ');
 if(!changes.length&&!cuts.length){
  const reason=notes.length?notes.join('. ')+'.':'No he reconocido ningún ajuste o recorte concreto.';
  return {engine:'rules',unsupported:true,changes:[],remove:[],unrecognized,explanation:`${reason} Prueba, por ejemplo: «quita los primeros 5 segundos», «sube un poco el contraste» o «subtítulos arriba».`};
 }
 const parts=[...new Set(summary)];if(cuts.length)parts.push(`recorte ${cutText}`);
 if(unrecognized.length)notes.push(`No he interpretado: «${unrecognized.join('», «').slice(0,160)}»`);
 return {engine:'rules',unsupported:false,exact:cuts.length>0||title!==null,changes,remove:cuts,unrecognized,explanation:`Reglas locales: ${parts.join(', ')}.${notes.length?' '+notes.join('. ')+'.':''}`};
}
function fmt(t){const m=Math.floor(t/60),s=t-m*60;return m?`${m}:${s.toFixed(1).padStart(4,'0')}`:`${round(s,1)} s`;}
