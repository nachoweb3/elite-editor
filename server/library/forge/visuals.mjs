// Forge pack "visuals": original backgrounds, transparent overlays and looping video overlays.
// Everything is rendered locally with FFmpeg (lavfi gradients + geq), so it is original and CC0-1.0 (author "Elite Editor").
// The helpers at the top (forge, geqPng, expression builders) are shared with creators.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {run} from '../../core.mjs';
import {CATEGORIES} from '../classify.mjs';

export const PACK={id:'visuals',title:'Fondos y overlays',description:'Fondos 1080p (degradados y patrones), overlays PNG con transparencia real y overlays de vídeo en bucle. Generados con FFmpeg: originales y de dominio público (CC0).'};
export const W=1920,H=1080;

/* ------------------------------ shared helpers ------------------------------ */
export const ffmpeg=(args,opts={})=>run('ffmpeg',['-hide_banner','-nostdin','-v','error','-y',...args],{timeout:300000,...opts});
const brief=e=>String(e?.message||e).replace(/\s+/g,' ').slice(-300);

/** Runs a list of specs {id,ext,title,kind,category,tags,description,width,height,duration,make(tmpFile)} into `dir`. */
export async function forge({dir,force=false,log=()=>{},only,specs,concurrency=3}){
 const list=Array.isArray(only)&&only.length?specs.filter(s=>only.includes(s.id)):specs;
 await fs.mkdir(dir,{recursive:true});
 const items=new Array(list.length),failed=[];let made=0,next=0;
 const worker=async()=>{
  for(;;){
   const i=next++;if(i>=list.length)return;
   const s=list[i],file=path.join(dir,`${s.id}.${s.ext}`);
   try{
    const there=!force&&await fs.stat(file).then(st=>st.size>0,()=>false);
    if(!there){
     const tmp=path.join(dir,`${s.id}.tmp.${s.ext}`);
     try{await s.make(tmp);if(!(await fs.stat(tmp)).size)throw new Error('FFmpeg generó un archivo vacío');await fs.rm(file,{force:true});await fs.rename(tmp,file);}
     catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e;}
     made++;log(`Generado: ${s.title}`);
    }
    const item={id:s.id,file,title:s.title,kind:s.kind||'image',tags:s.tags,description:s.description,width:s.width,height:s.height};
    if(s.category)item.category=s.category;if(s.duration)item.duration=s.duration;
    items[i]=item;
   }catch(e){failed.push({id:s.id,error:brief(e)});log(`Error en ${s.id}: ${brief(e)}`);}
  }
 };
 await Promise.all(Array.from({length:Math.min(concurrency,list.length)},worker));
 return {made,total:list.length,failed,items:items.filter(Boolean)};
}

/** Renders one still frame from a geq-driven RGBA canvas (straight alpha PNG). */
export const geqPng=(file,{w=W,h=H,r='0',g='0',b='0',a='255'})=>ffmpeg(['-f','lavfi','-i',`color=c=black:s=${w}x${h}:r=1:d=1,format=gbrap,geq=r='${r}':g='${g}':b='${b}':a='${a}'`,'-frames:v','1','-update','1','-pix_fmt','rgba',file]);

// Expression snippets for geq (all values pixel based; slots 7-9 are scratch registers).
export const clip01=x=>`clip(${x},0,1)`;
/** Smoothstep of an expression (uses register 9, so do not nest it). */
export const sstep=x=>`(st(9,clip(${x},0,1));ld(9)*ld(9)*(3-2*ld(9)))`;
/** Antialiased coverage of the interval [a,b) along coordinate v. */
export const band=(v,a,b)=>`clip(min(${v}-(${a}),(${b})-${v})+0.5,0,1)`;
/** Normalised distance from the centre of the frame (0 centre, 1 corner). */
export const corner='(hypot((X-W/2)/(W/2),(Y-H/2)/(H/2))/1.4142)';
/** Deterministic grey hash noise in 0..1 (same value in every colour plane). */
export const hash='(st(8,sin(X*12.9898+Y*78.233)*43758.5453);ld(8)-floor(ld(8)))';
const num=n=>Number(n.toFixed(4));
const hex=c=>'0x'+c;

/* ------------------------------ gradient backgrounds ------------------------------ */
const V=[960,0,960,H-1],D=[0,0,W-1,H-1],U=[0,H-1,W-1,0];
const GRADIENTS=[
 ['aurora','Aurora','aurora boreal, verde, violeta',['0b1d3a','1fd1a5','7a3cff','0a0a23'],D,{seed:3}],
 ['atardecer','Atardecer','atardecer, puesta de sol, sunset, naranja, rosa',['2b1055','7b2d8e','d53369','ff7e3d','ffd36b'],V],
 ['oceano','Océano','océano, mar, ocean, sea, azul, agua',['5fd6e0','1596b8','06406b','021428'],V],
 ['medianoche','Medianoche','medianoche, noche, midnight, night, azul oscuro',['2f4a9a','1d2f6e','0e1838','05081a'],[960,480,W-1,H-1,'radial']],
 ['menta','Menta','menta, mint, verde, fresco',['0a3d36','1fb894','7ff0cf','d7fff3'],U],
 ['rosa','Rosa','rosa, pink, magenta, romántico',['3a0b3b','a3246f','ff5fa2','ffc2dc'],D],
 ['mono','Monocromo','monocromo, mono, gris, grey, minimalista, blanco y negro',['050505','2b2b2b','5a5a5a','1c1c1c'],U],
 ['neon','Neón','neón, neon, cyberpunk, synthwave, rosa, cian',['0a0222','5a0fb5','ff2bd6','00e5ff'],U],
 ['lava','Lava','lava, fuego, fire, rojo, naranja, calor',['ffd24a','ff5a0a','9a1100','1d0200'],[960,1020,0,0,'radial']],
 ['bosque','Bosque','bosque, forest, verde, naturaleza, nature',['03150d','0b4a2a','1f8a4c','8bd36a'],V],
 ['caramelo','Caramelo','caramelo, caramel, ámbar, marrón, cálido',['4a230a','a85a14','e89a3c','ffd699'],D],
 ['acero','Acero','acero, steel, metal, metálico, gris azulado, industrial',['10151b','3b4753','8fa0b1','2a323b','5d6d7e'],D],
 ['hielo','Hielo','hielo, ice, frío, cold, azul claro, invierno',['0b2a4d','2e7fc4','9ed8ff','f0fbff'],V],
 ['violeta','Violeta','violeta, violet, púrpura, purple, galaxia',['8a4bff','4b1fb8','1b0a52','07031a'],[1300,380,0,H-1,'radial']],
 ['ambar','Ámbar','ámbar, amber, dorado, gold, cálido, otoño',['2a1000','a34a00','ffa21f','fff0b0'],[0,540,W-1,540]],
];
const gradientSpec=([id,name,words,stops,[x0,y0,x1,y1,type='linear'],{seed=7}={}])=>({
 id:`degradado-${id}`,ext:'jpg',kind:'image',category:CATEGORIES.background,title:`Fondo degradado ${name}`,width:W,height:H,
 tags:['fondo','background','degradado','gradient','1080p','abstracto','abstract',...words.split(', ')],
 description:`Fondo degradado ${name.toLowerCase()} en 1920×1080 con ruido fino para evitar bandas de color. Original y de dominio público (CC0).`,
 make:file=>ffmpeg(['-f','lavfi','-i',`gradients=s=${W}x${H}:${stops.map((c,i)=>`c${i}=${hex(c)}`).join(':')}:nb_colors=${stops.length}:x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:speed=0.00001:seed=${seed}:type=${type}`,
  '-frames:v','1','-update','1','-vf','noise=alls=6:allf=u','-q:v','3','-pix_fmt','yuvj420p',file]),
});

/* ------------------------------ pattern backgrounds ------------------------------ */
// Dark vignetted base (edge colour a -> centre colour b) plus a pattern intensity I (0..1) tinted with `fg`.
const patternSpec=(id,name,words,{a,b,fg,I,pre=''})=>({
 id:`patron-${id}`,ext:'jpg',kind:'image',category:CATEGORIES.background,title:`Fondo ${name}`,width:W,height:H,
 tags:['fondo','background','patrón','pattern','textura','texture','oscuro','dark','1080p',...words.split(', ')],
 description:`Fondo oscuro con patrón de ${name.replace(/^de /,'').toLowerCase()} en 1920×1080, pensado para poner texto o vídeo encima. Original y de dominio público (CC0).`,
 make:file=>{
  const ch=i=>`st(1,pow(1-${corner},1.4));${pre}st(0,${I});clip(${a[i]}+(${b[i]-a[i]})*ld(1)+ld(0)*${fg[i]}*(0.55+0.45*ld(1)),0,255)`;
  return ffmpeg(['-f','lavfi','-i',`color=c=black:s=${W}x${H}:r=1:d=1,format=gbrp,geq=r='${ch(0)}':g='${ch(1)}':b='${ch(2)}',noise=alls=4:allf=u`,'-frames:v','1','-update','1','-q:v','3','-pix_fmt','yuvj420p',file]);
 },
});
const PATTERNS=[
 patternSpec('rejilla','rejilla','rejilla, grid, líneas, lines, cuadrícula',{a:[5,8,18],b:[14,24,50],fg:[62,112,196],I:'max(max(lt(mod(X,96),2),lt(mod(Y,96),2)),0.28*max(lt(mod(X,24),1),lt(mod(Y,24),1)))*0.8'}),
 patternSpec('puntos','puntos','puntos, dots, lunares, halftone',{a:[10,6,20],b:[28,16,52],fg:[150,110,230],I:'clip(4.5-hypot(mod(X,48)-24,mod(Y,48)-24),0,1)*0.7'}),
 patternSpec('rayas-diagonales','rayas diagonales','rayas, stripes, diagonal, líneas diagonales',{a:[6,10,14],b:[16,30,36],fg:[40,120,110],pre:'st(2,mod(X+Y,72));',I:'0.7*clip(min(ld(2),24-ld(2)),0,1)'}),
 patternSpec('tablero','tablero de ajedrez','tablero, checker, checkerboard, ajedrez, cuadros',{a:[8,8,10],b:[20,20,26],fg:[40,42,60],I:'mod(floor(X/120)+floor(Y/120),2)'}),
 patternSpec('ruido','ruido sutil','ruido, noise, grano, grain, textura',{a:[8,10,16],b:[18,22,34],fg:[120,140,190],I:`0.2*${hash}+0.12*(0.5+0.5*sin(X/210+sin(Y/170)*2))`}),
 patternSpec('cuadricula-hud','cuadrícula HUD','HUD, interfaz, interface, tecnología, tech, futurista, futuristic, cuadrícula, grid',{a:[3,10,12],b:[8,28,32],fg:[70,170,140],
  pre:'st(2,abs(mod(X+96,192)-96));st(3,abs(mod(Y+96,192)-96));',I:'max(max(0.14*max(lt(mod(X,48),1),lt(mod(Y,48),1)),0.5*max(lt(mod(X,192),2),lt(mod(Y,192),2))),max(lt(ld(2),1.5)*lt(ld(3),12),lt(ld(3),1.5)*lt(ld(2),12)))'}),
 patternSpec('ondas','ondas','ondas, waves, curvas, contour, líneas onduladas',{a:[4,8,20],b:[12,26,58],fg:[60,130,230],pre:'st(2,mod(Y+34*sin(X/150)+18*sin(X/61+Y/230),44));',I:'0.6*clip(min(ld(2)+0.5,3.5-ld(2)),0,1)'}),
];

/* ------------------------------ transparent overlays (PNG RGBA) ------------------------------ */
const vig=(start,max)=>({a:`255*${max}*${sstep(`(${corner}-${start})/${num(1-start)}`)}`});
const warm=(cx,cy,sx,sy,peak,col)=>{
 // Soft elliptical glow centred at (cx,cy) fractions of the frame; colour fades from the core tone to the outer tone.
 const d=`hypot((X-W*${cx})/(W*${sx}),(Y-H*${cy})/(H*${sy}))`;
 return {a:`255*${peak}*pow(clip(1-${d},0,1),1.6)`,r:`${col[0][0]}+(${col[1][0]-col[0][0]})*clip(1-${d},0,1)`,g:`${col[0][1]}+(${col[1][1]-col[0][1]})*clip(1-${d},0,1)`,b:`${col[0][2]}+(${col[1][2]-col[0][2]})*clip(1-${d},0,1)`};
};
const fade=(top,max,from)=>({a:`255*${max}*${sstep(top?`(${from}-Y/H)/${from}`:`(Y/H-${1-from})/${from}`)}`});
const overlaySpec=(id,name,words,desc,def)=>({
 id,ext:'png',kind:'image',category:CATEGORIES.overlay,title:name,width:W,height:H,
 tags:['overlay','superposición','transparente','transparent','png','alfa','alpha','1080p',...words.split(', ')],
 description:`${desc} PNG RGBA 1920×1080 con transparencia real: colócalo en una pista por encima del vídeo. Original y de dominio público (CC0).`,
 make:file=>geqPng(file,def),
});
const NEON=[92,225,255],VIOLET=[176,108,255];
// Neon frame: signed distance to a rounded box -> bright core plus a soft halo, cyan to violet along the diagonal.
const neonD='(st(1,abs(X-W/2)-(W/2-48-30));st(2,abs(Y-H/2)-(H/2-48-30));hypot(max(ld(1),0),max(ld(2),0))+min(max(ld(1),ld(2)),0)-30)';
const neonMix='(X/W*0.6+Y/H*0.4)';
const neonCore=`clip(0.5-(abs(${neonD})-3),0,1)`;
const neonCh=i=>`st(5,${neonCore});clip(${NEON[i]}+(${VIOLET[i]-NEON[i]})*${neonMix}+(255-(${NEON[i]}+(${VIOLET[i]-NEON[i]})*${neonMix}))*0.55*ld(5),0,255)`;
// HUD corners: fold the frame into one quadrant, then draw an L bracket, a short inner tick and a dot.
const fold={x:'min(X,W-1-X)',y:'min(Y,H-1-Y)'};
const rect=(x0,x1,y0,y1)=>`(${band(fold.x,x0,x1)}*${band(fold.y,y0,y1)})`;
const hudA=`255*max(max(${rect(56,186,56,62)},${rect(56,62,56,186)}),max(0.55*max(${rect(76,112,76,79)},${rect(76,79,76,112)}),0.9*${rect(56,66,56,66)}))`;

const OVERLAYS=[
 overlaySpec('vignette-suave','Viñeta suave','viñeta, vignette, bordes oscuros, cine, cinematic','Viñeta sutil que oscurece las esquinas para centrar la atención.',vig(0.35,0.55)),
 overlaySpec('vignette-fuerte','Viñeta fuerte','viñeta, vignette, bordes oscuros, dramático, dramatic, cine','Viñeta intensa para un aire dramático o de cine negro.',vig(0.2,0.92)),
 overlaySpec('barras-cine-239','Barras de cine 2.39:1','barras de cine, cine bars, letterbox, cinemascope, 2.39, panorámico, widescreen, cinematic','Barras negras superior e inferior que dejan un encuadre panorámico 2.39:1.',{a:'255*gte(abs(Y-(H-1)/2),(H-1)/2-137.5)'}),
 overlaySpec('marco-neon','Marco neón','marco, frame, neón, neon, borde, border, brillo, glow, cian, violeta','Marco de neón cian a violeta con brillo suave.',{r:neonCh(0),g:neonCh(1),b:neonCh(2),a:`255*max(${neonCore},0.55*exp(-abs(${neonD})/16))`}),
 overlaySpec('esquinas-hud','Esquinas HUD','esquinas, corners, HUD, visor, viewfinder, corchetes, brackets, menta, mint, tecnología, tech','Corchetes color menta en las cuatro esquinas, como un visor o interfaz futurista.',{r:'128',g:'244',b:'208',a:hudA}),
 overlaySpec('scanlines','Líneas de escaneo','scanlines, líneas de escaneo, CRT, retro, VHS, televisión, tv, monitor','Líneas horizontales finas al estilo de un monitor CRT.',{a:'255*0.3*lt(mod(Y,4),2)'}),
 overlaySpec('luz-calida','Luz cálida','luz, light, cálida, warm, ámbar, amber, destello, light leak, atardecer, sunset','Fuga de luz ámbar desde la esquina superior derecha. Funciona bien con fusión Pantalla o Luz suave.',warm(0.96,0.04,0.95,1.15,0.78,[[255,226,140],[255,110,30]])),
 overlaySpec('luz-fria','Luz fría','luz, light, fría, cool, azul, blue, destello, light leak, tecnología, tech','Fuga de luz azulada desde la esquina superior izquierda. Funciona bien con fusión Pantalla o Luz suave.',warm(0.04,0.06,0.95,1.15,0.78,[[170,225,255],[40,90,255]])),
 overlaySpec('rejilla-fina','Rejilla fina','rejilla, grid, cuadrícula, guía, guide, líneas, lines, tecnología, tech','Rejilla muy fina de líneas blancas semitransparentes, con una línea más marcada cada cinco.',{r:'255',g:'255',b:'255',a:'255*max(0.18*max(lt(mod(X,40),1),lt(mod(Y,40),1)),0.4*max(lt(mod(X,200),1),lt(mod(Y,200),1)))'}),
 overlaySpec('sombra-inferior','Sombra inferior','degradado, gradient, sombra, shadow, subtítulos, subtitles, texto, text, legibilidad, readability','Sombra negra que sube desde el borde inferior para dar legibilidad a subtítulos y textos.',fade(false,0.85,0.5)),
 overlaySpec('sombra-superior','Sombra superior','degradado, gradient, sombra, shadow, título, title, texto, text, legibilidad, readability','Sombra negra que baja desde el borde superior para dar legibilidad a títulos.',fade(true,0.85,0.5)),
];

/* ------------------------------ looping video overlays (MP4) ------------------------------ */
const VW=960,VH=540,VD=3,VR=24;
const BLEND='Pensados para la pestaña Fusión del inspector: usa el modo de fusión Superponer o Luz suave y el gris neutro no altera la imagen.';
const videoSpec=(id,name,words,desc,input,vf)=>({
 id,ext:'mp4',kind:'video',category:CATEGORIES.overlayVideo,title:name,width:VW,height:VH,duration:VD,
 tags:['overlay','vídeo','video','bucle','loop','overlay de vídeo','fusión','blend',...words.split(', ')],
 description:`${desc} Vídeo de ${VD} s en bucle (${VW}×${VH}, sin audio). ${BLEND} Original y de dominio público (CC0).`,
 make:file=>ffmpeg(['-f','lavfi','-i',input,'-vf',vf,'-c:v','libx264','-preset','slow','-crf','27','-pix_fmt','yuv420p','-r',String(VR),'-an','-movflags','+faststart',file]),
});
// Flicker: integer numbers of cycles over the 3 s loop, so the animation repeats without a seam, plus a per-frame jitter.
const tau='6.2831853*T/3';
const flick=`(0.5+0.2*sin(${tau}+0.7)+0.12*sin(4*${tau}+2.1)+0.08*sin(9*${tau}+0.3)+0.05*sin(17*${tau}+4)+0.06*(st(7,sin(N*12.9898)*43758.5453);ld(7)-floor(ld(7))-0.5))`;
const glow=`(0.45+0.55*clip(1.25-hypot((X-W*0.18)/(W*0.9),(Y-H*1.0)/(H*1.1)),0,1))`;
const amber=[255,168,64];
const flickCh=i=>`st(6,clip(${flick}*${glow}*1.15,0,1));128+(${amber[i]-128})*ld(6)`;
const VIDEOS=[
 videoSpec('grano-pelicula','Grano de película','grano, grain, film grain, ruido, noise, textura, texture, analógico, analog, cine, cinematic','Grano de película en gris neutro, de aspecto orgánico.',
  `color=c=0x808080:s=640x360:r=${VR}:d=${VD}`,'format=yuv420p,noise=c0s=46:c0f=t+u,gblur=sigma=0.6:planes=1,scale=960:540:flags=bicubic,format=yuv420p'),
 videoSpec('parpadeo-calido','Parpadeo cálido','parpadeo, flicker, luz cálida, warm light, ámbar, amber, vela, candle, fuego, fire, ambiente, atmosphere','Luz ámbar con parpadeo, como la de una vela o una chimenea.',
  `color=c=0x808080:s=${VW}x${VH}:r=${VR}:d=${VD}`,`format=gbrp,geq=r='${flickCh(0)}':g='${flickCh(1)}':b='${flickCh(2)}',noise=alls=4:allf=u,format=yuv420p`),
];

const SPECS=[...GRADIENTS.map(gradientSpec),...PATTERNS,...OVERLAYS,...VIDEOS];
/** Ids and counts without generating anything. */
export const IDS=SPECS.map(s=>s.id);
export const TOTAL=SPECS.length;

export async function generate({dir,force=false,log=()=>{},only}={}){
 return forge({dir,force,log,only,specs:SPECS,concurrency:3});
}
