// Elite SFX: original sound effects synthesised with FFmpeg (aevalsrc), so they are
// CC0 and need no download. `npm run setup` generates missing files; `npm run sfx`
// regenerates them all. Each entry: file stem, Spanish title, category, seconds,
// expression (t = time in seconds, random(0) = noise) and optional extra filters.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,run} from '../server/core.mjs';

export const SFX_DIR=path.join(ROOT,'resources/elite-sfx');
const N='(2*random(0)-1)';
const env=(attack,decay)=>`min(t/${attack},1)*exp(-t*${decay})`;
const tone=(f,decay,start=0)=>`if(gte(t,${start}),sin(2*PI*${f}*(t-${start}))*exp(-(t-${start})*${decay}),0)`;
const square=(f,start,end,amp=.35)=>`if(between(t,${start},${end}),${amp}*sgn(sin(2*PI*${f}*(t-${start}))),0)`;
const saw=(f,start,end,amp=.4,vib=0)=>`if(between(t,${start},${end}),${amp}*(sin(2*PI*${f}*(t-${start})+${vib}*sin(2*PI*6*t))+sin(4*PI*${f}*(t-${start}))/2+sin(6*PI*${f}*(t-${start}))/3)*exp(-(t-${start})*1.5),0)`;
const thump=(start,f=70)=>`if(gte(t,${start}),sin(2*PI*(t-${start})*(${f}+120*exp(-(t-${start})*25)))*exp(-(t-${start})*14),0)`;

export const SFX=[
 // Impactos
 ['boom-grave','Boom grave','Impactos',2.2,`0.9*sin(2*PI*t*(45+160*exp(-t*9)))*exp(-t*2.2)+0.35*${N}*exp(-t*18)`,'lowpass=f=1800'],
 ['boom-cine','Boom cinemático','Impactos',3.2,`0.9*sin(2*PI*t*(38+140*exp(-t*6)))*exp(-t*1.4)+0.25*${N}*exp(-t*6)`,'lowpass=f=1100,aecho=0.8:0.55:70:0.35'],
 ['golpe-seco','Golpe seco','Impactos',0.6,`0.9*sin(2*PI*t*(80+300*exp(-t*40)))*exp(-t*12)+0.5*${N}*exp(-t*45)`,''],
 ['dun-dun-dun','Dun dun duuun','Impactos',2.6,`${saw(110,0,0.35,.45)}+${saw(104,0.45,0.8,.45)}+${saw(92,0.9,2.6,.5,1.2)}`,'lowpass=f=2400'],
 ['revelacion','Revelación','Impactos',2.4,`0.25*${tone(1568,3)}+0.2*${tone(2093,3,0.12)}+0.18*${tone(2637,3,0.24)}+0.15*${tone(3136,3,0.36)}+0.2*${N}*min(t/2,1)*exp(-t*0.8)`,'highpass=f=600'],
 // Transiciones
 ['whoosh-corto','Whoosh corto','Transiciones',0.45,`${N}*pow(sin(PI*t/0.45),2)`,'bandpass=f=1400:w=2200,volume=2.2'],
 ['whoosh','Whoosh','Transiciones',0.8,`${N}*pow(sin(PI*t/0.8),2)`,'bandpass=f=900:w=1600,volume=2.2'],
 ['whoosh-largo','Whoosh largo','Transiciones',1.4,`${N}*pow(sin(PI*t/1.4),3)`,'bandpass=f=700:w=1200,volume=2.4'],
 ['swoosh-agudo','Swoosh agudo','Transiciones',0.5,`${N}*pow(sin(PI*t/0.5),2)`,'bandpass=f=3200:w=3000,volume=2'],
 ['riser','Subida de tensión','Transiciones',3,`0.35*sin(2*PI*(180*t+110*t*t))*pow(t/3,2)+0.3*${N}*pow(t/3,3)`,'highpass=f=150'],
 ['downlifter','Bajada','Transiciones',2,`0.4*sin(2*PI*(900*t-200*t*t))*exp(-t*1.2)+0.2*${N}*exp(-t*2)`,'lowpass=f=4000'],
 ['platillo-inverso','Platillo inverso','Transiciones',1.6,`${N}*pow(t/1.6,4)`,'highpass=f=2500,volume=1.8'],
 ['zoom-rapido','Zoom rápido','Transiciones',0.6,`0.4*sin(2*PI*(300*t+1800*t*t))*pow(sin(PI*t/0.6),2)+0.3*${N}*pow(sin(PI*t/0.6),2)`,'bandpass=f=1800:w=3000,volume=1.6'],
 ['transicion-glitch','Transición glitch','Transiciones',0.7,`0.4*sgn(sin(2*PI*t*(700+500*sin(2*PI*t*37))))*gt(sin(2*PI*t*13),0.1)*(1-t/0.7)`,'highpass=f=200'],
 // Memes
 ['fallo-epico','Fallo épico','Memes',2.6,`${saw(392,0,0.4)}+${saw(370,0.45,0.85)}+${saw(349,0.9,1.3)}+${saw(330,1.35,2.6,.45,2.5)}`,'lowpass=f=2600'],
 ['chiste-malo','Chiste malo (ba dum tss)','Memes',1.4,`0.8*${thump(0,90)}+0.8*${thump(0.18,70)}+if(gte(t,0.38),0.45*${N}*exp(-(t-0.38)*4),0)`,'highpass=f=40'],
 ['boing','Boing','Memes',1.2,`0.7*sin(2*PI*230*t+9*sin(2*PI*11*t)*exp(-t*1.5))*exp(-t*2.6)`,''],
 ['silbato-sube','Silbato que sube','Memes',1,`0.5*sin(2*PI*(500*t+500*t*t)+0.6*sin(2*PI*7*t))*pow(sin(PI*t),0.5)`,''],
 ['silbato-baja','Silbato que baja','Memes',1,`0.5*sin(2*PI*(1500*t-500*t*t)+0.6*sin(2*PI*7*t))*pow(sin(PI*t),0.5)`,''],
 ['grillos','Silencio incómodo (grillos)','Memes',3,`0.25*sin(2*PI*4400*t)*gt(sin(2*PI*28*t),0.3)*gt(sin(2*PI*1.1*t),0.2)`,'highpass=f=2000'],
 ['parón-disco','Parón de disco','Memes',0.9,`0.45*(sin(2*PI*(520*t-280*t*t))+0.5*sin(2*PI*(780*t-420*t*t)))*(1-t/0.9)`,'lowpass=f=3000'],
 ['bocina','Bocina de payaso','Memes',0.7,`0.45*sgn(sin(2*PI*(330+40*sin(2*PI*9*t))*t))*${env(0.02,2)}`,'lowpass=f=2200'],
 ['tension-drama','Tensión dramática','Memes',4,`0.35*(sin(2*PI*55*t)+sin(2*PI*58.3*t)+0.5*sin(2*PI*110.4*t))*min(t/1.5,1)+0.08*${N}*min(t/2,1)`,'lowpass=f=900'],
 ['sirena','Sirena de alerta','Memes',2,`0.35*sin(2*PI*(if(lt(mod(t,0.5),0.25),720,920))*t)`,''],
 ['laser','Láser','Memes',0.35,`0.5*sin(2*PI*(2000*t-2600*t*t))*exp(-t*6)`,''],
 // Interfaz
 ['ding','Ding','Interfaz',1.6,`0.55*${tone(1320,3)}+0.25*${tone(3643,6)}+0.1*${tone(7128,9)}`,''],
 ['ding-doble','Ding doble','Interfaz',1.6,`0.45*${tone(1320,4)}+0.45*${tone(1760,4,0.15)}`,''],
 ['pop','Pop','Interfaz',0.25,`0.8*sin(2*PI*t*(900*exp(-t*30)+180))*exp(-t*25)`,''],
 ['burbuja','Burbuja','Interfaz',0.3,`0.6*sin(2*PI*t*(300+1400*t))*sin(PI*t/0.3)`,''],
 ['clic','Clic','Interfaz',0.08,`0.9*${N}*exp(-t*120)`,'highpass=f=1500'],
 ['notificacion','Notificación','Interfaz',0.9,`0.4*${tone(660,5)}+0.4*${tone(990,4,0.12)}`,''],
 ['correcto','Respuesta correcta','Interfaz',0.9,`0.35*${tone(523,6)}+0.35*${tone(659,6,0.09)}+0.35*${tone(784,4,0.18)}`,''],
 ['incorrecto','Respuesta incorrecta','Interfaz',0.7,`0.35*sgn(sin(2*PI*140*t))*(1-t/0.7)*(0.7+0.3*sin(2*PI*18*t))`,'lowpass=f=1600'],
 ['teclado','Teclado','Interfaz',1.5,`0.7*${N}*exp(-mod(t,0.13)*90)*gt(sin(2*PI*3.3*t+1),-0.6)`,'highpass=f=1200'],
 ['obturador','Disparo de cámara','Interfaz',0.3,`0.8*${N}*(exp(-t*90)+if(gte(t,0.09),exp(-(t-0.09)*70),0))`,'highpass=f=900'],
 // Juego
 ['moneda','Moneda','Juego',0.6,`${square(988,0,0.08)}+${square(1319,0.08,0.6,.3)}*exp(-(t-0.08)*5)`,'lowpass=f=6000'],
 ['subir-nivel','Subir de nivel','Juego',0.9,`${square(523,0,0.1)}+${square(659,0.1,0.2)}+${square(784,0.2,0.3)}+${square(1047,0.3,0.9,.3)}*exp(-(t-0.3)*3)`,'lowpass=f=6000'],
 ['game-over','Game over','Juego',1.6,`${square(392,0,0.3)}+${square(330,0.32,0.62)}+${square(262,0.64,1.6,.3)}*exp(-(t-0.64)*2)`,'lowpass=f=4000'],
 ['power-up','Power-up','Juego',0.8,`0.35*sgn(sin(2*PI*(400*t+1600*t*t)))*(1-t/0.8)`,'lowpass=f=5000'],
 // Ritmo y tiempo
 ['tic-tac','Tic tac','Tiempo',2,`0.8*(sin(2*PI*2600*t)*exp(-mod(t,0.5)*80)*lt(mod(t,1),0.5)+sin(2*PI*2000*t)*exp(-mod(t,0.5)*80)*gte(mod(t,1),0.5))`,''],
 ['latido','Latido','Tiempo',2,`0.9*(${thump(0,55)}+0.7*${thump(0.22,50)}+${thump(1,55)}+0.7*${thump(1.22,50)})`,'lowpass=f=400'],
 ['redoble','Redoble','Tiempo',2.4,`0.5*${N}*(0.5+0.5*sin(2*PI*28*t))*min(t/2,1)*lt(t,2)+if(gte(t,2),0.7*${N}*exp(-(t-2)*5),0)+0.6*${thump(2,80)}`,'highpass=f=120'],
 ['cuenta-atras','Cuenta atrás','Tiempo',3.4,`0.4*(${tone(880,8)}+${tone(880,8,1)}+${tone(880,8,2)})+0.5*${tone(1760,3,3)}`,''],
];

export async function generateSfx({force=false,log=()=>{}}={}){
 await fs.mkdir(SFX_DIR,{recursive:true});
 const manifest=[],failed=[];let made=0;
 for(const [stem,title,category,seconds,expression,filters] of SFX){
  const file=path.join(SFX_DIR,`${stem}.ogg`);
  if(!force){try{await fs.access(file);manifest.push({file:`${stem}.ogg`,title,category,seconds});continue;}catch{}}
  const af=['aformat=channel_layouts=stereo',filters,'afade=t=out:st='+Math.max(0,seconds-0.04)+':d=0.04'].filter(Boolean).join(',');
  const wav=path.join(SFX_DIR,`.${stem}.tmp.wav`);
  // One bad recipe must not stop the rest of the library.
  try{
   await run('ffmpeg',['-v','error','-y','-f','lavfi','-i',`aevalsrc=exprs='${expression}':s=48000:d=${seconds}`,'-af',af,'-c:a','pcm_s16le',wav],{signal:null,timeout:60000});
   // Peak-normalise to -1 dBFS: filtered noise recipes come out far quieter than tones.
   const {err}=await run('ffmpeg',['-hide_banner','-nostats','-i',wav,'-af','volumedetect','-f','null','-'],{signal:null,timeout:60000});
   const peak=Number(/max_volume:\s*(-?[\d.]+) dB/.exec(err)?.[1]??0),gain=Math.min(40,Math.max(-12,-1-peak));
   await run('ffmpeg',['-v','error','-y','-i',wav,'-af',`volume=${gain.toFixed(2)}dB,alimiter=limit=0.9`,'-c:a','libvorbis','-q:a','5',file],{signal:null,timeout:60000});
   manifest.push({file:`${stem}.ogg`,title,category,seconds});made++;log(title);
  }catch(e){failed.push({stem,error:String(e.message).split('\n').at(-1)});}
  finally{await fs.unlink(wav).catch(()=>{});}
 }
 await fs.writeFile(path.join(SFX_DIR,'manifest.json'),JSON.stringify({license:'CC0-1.0',author:'Elite Editor (sintetizado con FFmpeg)',sounds:manifest},null,2));
 return {made,total:SFX.length,failed};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await generateSfx({force:process.argv.includes('--force'),log:s=>console.log('  ♪',s)});
 console.log(`Efectos Elite: ${result.made} generados de ${result.total} en resources/elite-sfx.`);if(result.failed.length)console.log('Fallaron:',result.failed);
}
