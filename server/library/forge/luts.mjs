// Colour looks as 3D LUTs (.cube), generated in pure JS: every look is a pure rgb -> rgb function.
// Original work by Elite Editor, released under CC0-1.0 (no third-party LUT data is used).
// This module must not import core.mjs: source-settings.mjs (loaded by core.mjs) depends on it.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export const PACK={id:'luts',title:'Looks de color (LUT)',description:'Catorce looks de color originales en formato .cube (cine, cálido, frío, vintage, blanco y negro, neón…) con vista previa, listos para aplicar al vídeo desde el asistente.'};
export const LUT_DIR=path.join(ROOT,'library','forge','luts');
const SIZE=25,LICENSE='CC0-1.0',AUTHOR='Elite Editor';

const clamp=(x,lo=0,hi=1)=>x<lo?lo:x>hi?hi:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const ramp3=(stops,l)=>l<.5?stops[0].map((v,i)=>lerp(v,stops[1][i],l*2)):stops[1].map((v,i)=>lerp(v,stops[2][i],(l-.5)*2));

// Builds a pure grading function. Order: exposure, channel mix, lift/gain/gamma, S-curve contrast,
// saturation by luminance, tint by luminance, optional colour ramp, black/white levels. Defaults are the identity.
export function grade({exposure=0,mix=null,lift=[0,0,0],gamma=[1,1,1],gain=[1,1,1],contrast=0,sat=1,satShadows=1,satHighs=1,shadowTint=[0,0,0],highTint=[0,0,0],ramp=null,rampAmount=1,black=0,white=1}={}){
 const ev=2**exposure;
 return rgb=>{
  let c=rgb.map(v=>v*ev);
  if(mix)c=mix.map(row=>row[0]*c[0]+row[1]*c[1]+row[2]*c[2]);
  c=c.map((v,i)=>{v=clamp(v);v=clamp((v+lift[i]*(1-v))*gain[i]);return v**(1/gamma[i]);});
  if(contrast)c=c.map(v=>clamp(v+contrast*(v*v*(3-2*v)-v)));
  let l=luma(c[0],c[1],c[2]);
  const s=sat*(l<.5?lerp(satShadows,1,l*2):lerp(1,satHighs,(l-.5)*2));
  c=c.map(v=>l+(v-l)*s);
  l=clamp(luma(c[0],c[1],c[2]));
  const ws=1-smooth(0,.6,l),wh=smooth(.4,1,l);
  c=c.map((v,i)=>v+shadowTint[i]*ws+highTint[i]*wh);
  if(ramp){const t=ramp3(ramp,l);c=c.map((v,i)=>lerp(v,t[i],rampAmount));}
  return c.map(v=>clamp(black+clamp(v)*(white-black)));
 };
}

const MONO=[[.3,.55,.15],[.3,.55,.15],[.3,.55,.15]];
const LOOKS=[
 {stem:'cine-teal-naranja',title:'Cine teal y naranja',description:'Sombras verdeazuladas y luces anaranjadas con contraste de cine: el look de blockbuster que separa la piel del fondo.',
  tags:['cine','película','teal y naranja','teal orange','cinematic','blockbuster','hollywood','contraste'],
  p:{mix:[[1.08,0,-.08],[0,.88,.12],[0,0,1]],contrast:.38,sat:1.1,satShadows:.95,shadowTint:[-.08,.03,.08],highTint:[.08,.03,-.08],gain:[1.03,1,.97],black:.012}},
 {stem:'calido-atardecer',title:'Cálido atardecer',description:'Tonos dorados y anaranjados de hora dorada, con luces suaves y color algo más intenso.',
  tags:['cálido','atardecer','hora dorada','sunset','golden hour','warm','dorado','naranja'],
  p:{exposure:.05,contrast:.15,sat:1.12,gain:[1.08,1,.84],gamma:[1.05,1,.92],shadowTint:[.03,0,-.02],highTint:[.05,.02,-.04]}},
 {stem:'frio-azulado',title:'Frío azulado',description:'Imagen fría y limpia con sombras azules, ideal para tecnología, invierno o escenas serenas.',
  tags:['frío','azulado','azul','cold','cool','blue','invierno','tecnología'],
  p:{contrast:.12,sat:.93,gain:[.92,1,1.1],gamma:[.95,1,1.08],shadowTint:[-.02,0,.05],highTint:[-.02,0,.03]}},
 {stem:'vintage-70',title:'Vintage años 70',description:'Película antigua: negros levantados, color desvaído y luces amarillentas con sombras violáceas.',
  tags:['vintage','retro','años 70','70s','película antigua','film','nostalgia','desvaído'],
  p:{contrast:.2,sat:.85,black:.06,white:.95,gain:[1.05,.98,.85],lift:[.02,.01,-.01],shadowTint:[.02,0,.04],highTint:[.04,.03,-.04]}},
 {stem:'blanco-negro-contraste',title:'Blanco y negro con contraste',description:'Monocromo con curva en S marcada y mezcla de canales que oscurece cielos y realza texturas.',
  tags:['blanco y negro','b/n','monocromo','black and white','bw','noir','contraste','contrast'],
  p:{mix:MONO,contrast:.9,sat:0}},
 {stem:'mate-pastel',title:'Mate pastel',description:'Negros levantados, contraste suave y colores pastel: un acabado mate, ligero y luminoso.',
  tags:['mate','matte','pastel','suave','soft','lavado','faded','minimalista'],
  p:{exposure:.1,contrast:-.15,sat:.78,black:.08,white:.97,gamma:[1.1,1.1,1.1],highTint:[0,.01,.01]}},
 {stem:'neon-cyberpunk',title:'Neón cyberpunk',description:'Sombras azul violeta, luces magenta y saturación alta para escenas nocturnas futuristas.',
  tags:['neón','neon','cyberpunk','ciberpunk','futurista','synthwave','magenta','noche'],
  p:{exposure:-.05,contrast:.5,sat:1.45,gain:[1.02,.96,1.08],shadowTint:[-.02,0,.09],highTint:[.08,-.03,.05]}},
 {stem:'bleach-bypass',title:'Bleach bypass',description:'Efecto de blanqueo de película: color apagado, contraste duro y aspecto granuloso de cine bélico.',
  tags:['bleach bypass','blanqueo','desaturado','duro','cine bélico','gritty','metálico','contraste'],
  p:{contrast:.72,sat:.5,gamma:[.95,.95,.95],gain:[1.05,1.05,1.05]}},
 {stem:'verde-matrix',title:'Verde Matrix',description:'Monocromo verde de terminal de hacker con negros profundos y luces verde pálido.',
  tags:['verde','matrix','hacker','terminal','código','green','monocromo','sci-fi'],
  p:{contrast:.3,ramp:[[0,.02,0],[.06,.5,.15],[.72,1,.78]],rampAmount:.92}},
 {stem:'sepia-suave',title:'Sepia suave',description:'Sepia delicada, mezclada con el color original, para recuerdos y fotografía antigua.',
  tags:['sepia','antiguo','vintage','fotografía antigua','old photo','marrón','recuerdo','nostalgia'],
  p:{contrast:.1,ramp:[[.09,.05,.03],[.55,.43,.3],[1,.94,.8]],rampAmount:.85}},
 {stem:'dramatico-oscuro',title:'Dramático oscuro',description:'Exposición baja, contraste alto y sombras frías para escenas serias, tensas o de suspense.',
  tags:['dramático','oscuro','dramatic','dark','moody','sombrío','suspense','intenso'],
  p:{exposure:-.35,contrast:.6,sat:.85,gamma:[.88,.88,.9],gain:[.97,.98,1],shadowTint:[-.01,0,.03]}},
 {stem:'vivo-youtuber',title:'Vivo para YouTube',description:'Colores vivos, luces con chispa y contraste de miniatura: el acabado enérgico típico de los creadores.',
  tags:['vivo','youtuber','youtube','vibrante','vivid','punchy','pop','saturado','creador'],
  p:{exposure:.04,contrast:.25,sat:1.35,satShadows:1.1,gain:[1.03,1.02,1],gamma:[1.06,1.06,1.06]}},
 {stem:'piel-natural',title:'Piel natural',description:'Ajuste casi neutro con un toque cálido y contraste suave que favorece los tonos de piel en retratos.',
  tags:['piel','natural','retrato','portrait','skin','neutro','suave','entrevista'],
  p:{contrast:.08,sat:1.04,gain:[1.02,1,.98],gamma:[1.02,1,.99]}},
 {stem:'noche-americana',title:'Noche americana',description:'Convierte una escena de día en noche: exposición baja, color apagado y dominante azul lunar.',
  tags:['noche americana','day for night','noche','night','nocturno','luna','azul','moonlight'],
  p:{exposure:-.5,contrast:.3,sat:.55,gain:[.6,.8,1.15],gamma:[.95,.95,1.05],shadowTint:[-.01,.01,.06]}},
];
const BY_STEM=new Map(LOOKS.map(l=>[l.stem,{...l,fn:grade(l.p)}]));
export const LUT_STEMS=LOOKS.map(l=>l.stem);
export const LUT_TITLES=Object.fromEntries(LOOKS.map(l=>[l.stem,l.title]));

// Standard .cube: red varies fastest, then green, then blue.
function cubeText(look){
 const lines=[`TITLE "${look.title}"`,`# Elite Editor - ${LICENSE} - original look generated in code`,`LUT_3D_SIZE ${SIZE}`,'DOMAIN_MIN 0.0 0.0 0.0','DOMAIN_MAX 1.0 1.0 1.0'],last=SIZE-1;
 for(let b=0;b<SIZE;b++)for(let g=0;g<SIZE;g++)for(let r=0;r<SIZE;r++)lines.push(look.fn([r/last,g/last,b/last]).map(v=>clamp(v).toFixed(6)).join(' '));
 return lines.join('\n')+'\n';
}

// Synthetic test card (sky, sun, hills, skin and colour swatches, grey and hue ramps) as a binary PPM.
function testCard(w=480,h=270){
 const px=Buffer.alloc(w*h*3),put=(x,y,c)=>{const i=(y*w+x)*3;px[i]=Math.round(clamp(c[0])*255);px[i+1]=Math.round(clamp(c[1])*255);px[i+2]=Math.round(clamp(c[2])*255);};
 const hsv=(hh,s,v)=>{const k=n=>(n+hh*6)%6;return [5,3,1].map(n=>v-v*s*Math.max(0,Math.min(k(n),4-k(n),1)));};
 const swatches=[[.95,.8,.7],[.85,.65,.52],[.62,.43,.32],[.4,.27,.2],[.85,.12,.1],[.95,.55,.1],[.95,.88,.15],[.15,.7,.25],[.1,.75,.8],[.12,.25,.85],[.8,.15,.7],[.92,.92,.92]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let c;
  if(y<176){
   const t=clamp(y/130)**1.2,sky=[lerp(.2,.98,t),lerp(.42,.82,t),lerp(.82,.62,t)],dx=x-370,dy=y-96,d=Math.hypot(dx,dy),glow=Math.exp(-d*d/7200)*.35;
   c=[sky[0]+glow,sky[1]+glow*.9,sky[2]+glow*.6];
   if(d<20)c=[1,.97,.86];
   const far=124+18*Math.sin(x/55)+9*Math.sin(x/23+1),near=146+14*Math.sin(x/70+2)+6*Math.sin(x/17);
   if(y>far)c=[.35,.5,.62];
   if(y>near){const k=(y-near)/40;c=[lerp(.2,.1,clamp(k)),lerp(.46,.3,clamp(k)),lerp(.18,.1,clamp(k))];}
  }else if(y<224)c=swatches[Math.min(11,Math.floor(x/(w/12)))];
  else if(y<250)c=[x/(w-1),x/(w-1),x/(w-1)];
  else c=hsv(x/w,1,.9);
  put(x,y,c);
 }
 return Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),px]);
}

const ffmpeg=args=>new Promise((resolve,reject)=>execFile('ffmpeg',args,{windowsHide:true,timeout:90000,maxBuffer:4e6},(e,out,err)=>e?reject(Error('ffmpeg: '+String(err||e.message).trim().split(/\r?\n/).slice(-3).join(' | '))):resolve(out)));

/** Absolute .cube path for a stem inside dir, or null when the stem is invalid or the file is missing. */
export function lutFileIn(dir,stem){
 if(typeof stem!=='string'||!/^[a-z0-9-]{2,40}$/.test(stem))return null;
 const file=path.join(dir,stem+'.cube');
 return existsSync(file)?file:null;
}
// ELITE_LUT_DIR lets tests (and portable setups) point validation at another folder.
const lutDir=()=>process.env.ELITE_LUT_DIR||LUT_DIR;
/** Synchronous: absolute path of an installed look or null. */
export const lutFile=stem=>lutFileIn(lutDir(),stem);

/** ffmpeg lut3d filter for an absolute path. Quotes protect spaces and separators; ":" and "'" need escaping on Windows. */
export function lutFilter(file){
 const p=path.resolve(file).replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"'\\\\\\''");
 return `lut3d=file='${p}':interp=tetrahedral`;
}

/** Looks that exist on disk, in catalogue order. preview is null when the thumbnail is missing. */
export function listLuts(dir=lutDir()){
 return LOOKS.filter(l=>existsSync(path.join(dir,l.stem+'.cube'))).map(l=>{const preview=path.join(dir,l.stem+'.jpg');return {stem:l.stem,title:l.title,description:l.description,file:path.join(dir,l.stem+'.cube'),preview:existsSync(preview)?preview:null};});
}

async function writeAtomic(file,data){const temp=`${file}.${randomUUID().slice(0,8)}.tmp`;try{await fs.writeFile(temp,data);await fs.rename(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}}

async function writePreview(cube,jpg,card){
 const temp=`${jpg}.${randomUUID().slice(0,8)}.tmp`;
 try{await ffmpeg(['-v','error','-nostdin','-y','-i',card,'-vf',lutFilter(cube),'-frames:v','1','-update','1','-q:v','3','-pix_fmt','yuvj420p','-f','image2',temp]);await fs.rename(temp,jpg);}
 catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
}

export async function generate({dir=LUT_DIR,force=false,log=()=>{},only}={}){
 dir=path.resolve(dir);await fs.mkdir(dir,{recursive:true});
 const wanted=Array.isArray(only)&&only.length?LOOKS.filter(l=>only.includes(l.stem)):LOOKS,items=[],failed=[];
 let card=null;
 try{
  for(const look of wanted){
   const cube=path.join(dir,look.stem+'.cube'),jpg=path.join(dir,look.stem+'.jpg');
   try{
    if(force||!existsSync(cube)){await writeAtomic(cube,cubeText(BY_STEM.get(look.stem)));log(`LUT ${look.stem}: cubo ${SIZE}x${SIZE}x${SIZE} escrito`);}
    let preview=null;
    if(!force&&existsSync(jpg))preview=jpg;
    else{
     try{
      if(!card){card=path.join(dir,`.card-${randomUUID().slice(0,8)}.ppm`);await fs.writeFile(card,testCard());}
      await writePreview(cube,jpg,card);preview=jpg;
     }catch(e){failed.push({id:look.stem+'-preview',error:'Vista previa: '+(e.message||e)});log(`LUT ${look.stem}: sin vista previa (${e.message||e})`);}
    }
    items.push({id:look.stem,file:cube,title:look.title,kind:'lut',category:'LUT de color',tags:['lut','look','color','etalonaje','color grading','corrección de color','cube',...look.tags],description:look.description,preview});
   }catch(e){failed.push({id:look.stem,error:String(e.message||e)});log(`LUT ${look.stem}: error (${e.message||e})`);}
  }
 }finally{if(card)await fs.unlink(card).catch(()=>{});}
 // The manifest describes every look present in the folder, not only the ones requested this run.
 const present=listLuts(dir);
 await writeAtomic(path.join(dir,'manifest.json'),JSON.stringify({pack:PACK.id,title:PACK.title,license:LICENSE,author:AUTHOR,lutSize:SIZE,generatedAt:new Date().toISOString(),looks:present.map(l=>({stem:l.stem,title:l.title,description:l.description,cube:path.basename(l.file),preview:l.preview?path.basename(l.preview):null}))},null,2)).catch(e=>log('manifest.json: '+e.message));
 return {made:items.length,total:wanted.length,failed,items};
}
