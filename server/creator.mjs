// Creator tools: short-clip finder, loudness report and per-platform publish checklists.
// Everything is a pure function over a project except the async ones (applyShortClip, measureLoudness,
// loudnessReport). Times are seconds of the ORIGINAL recording unless a field says otherwise.
import fs from 'node:fs/promises';
import {load,save,run} from './core.mjs';
import {timedWords,keptSeconds,activeFillers} from './transcript-tools.mjs';
import {headline,chaptersFor,transcriptStats,chapterStamp} from './insights.mjs';
import {cutClips} from './prompt-editor.mjs';
import {profiles} from './engine.mjs';

const round=(n,d=1)=>{const f=10**d;return Math.round(n*f)/f;};
const ownClips=p=>(p.clips||[]).filter(c=>c.enabled&&(!c.sourceId||c.sourceId===p.id));
const keptWord=(p,w)=>keptSeconds(p,w.start,w.end)>(w.end-w.start)/2;
const seconds=s=>s<120?`${Math.round(s)} s`:`${Math.floor(s/60)} min ${Math.round(s%60)} s`;
const busy=p=>(p.jobs||[]).some(j=>['queued','running'].includes(j.status));

/* ------------------------------- A) Short clips ------------------------------- */
const CLOSED=/[.?!…]["'”’»)\]]*$/;
// Lowercase word without surrounding punctuation but WITH accents ("cómo" is a hook, "como" is not).
const rawOf=w=>w.word.toLowerCase().replace(/^[¿¡"'“«(]+|[.,;:!?…"'”’»)]+$/g,'');
// Compared against accent-stripped tokens (timedWords.token).
const HOOK_WORDS=new Set(('secreto secretos error errores truco trucos nadie increible increibles mira mirad miren descubre nunca jamas cuidado atencion '
 +'secret secrets mistake mistakes trick tricks nobody incredible amazing look watch never wrong truth stop').split(' '));
const HOOK_RAW=new Set(['cómo','how','why']);

// Hook signals in the first 3 s of a candidate: question, number, trigger word.
function hookSignals(list,question){
 const found={question,number:null,keyword:null};
 for(let i=0;i<list.length;i++){
  const w=list[i],raw=rawOf(w),next=list[i+1]&&rawOf(list[i+1]);
  if(!found.number&&/\d/.test(w.word))found.number=w.word.replace(/^[¿¡"'“«(]+|[.,;:!?…"'”’»)]+$/g,'');
  if(found.keyword)continue;
  if(HOOK_WORDS.has(w.token)||HOOK_RAW.has(raw))found.keyword=raw;
  else if((raw==='por'&&next==='qué')||(raw==='no'&&next==='one'))found.keyword=raw+' '+next;
 }
 return found;
}
const densityScore=wps=>wps>=2.2&&wps<=3.5?25:wps<2.2?Math.max(0,25*(wps-1.2)):Math.max(0,25*(5-wps)/1.5);

// Best short-form windows. A window starts at the beginning of a sentence and ends at the end of
// another; its duration is what stays in the edit (removed material does not count). Score (0-100):
// speaking pace 25, hook in the first 3 s 30, few fillers 15, no pauses over 1.5 s 15, closed final
// phrase 15. Pauses over 4 s rule a window out entirely.
export function findShortClips(p,{min=20,max=59,count=5,fillers}={}){
 min=Number(min);max=Number(max);count=Math.round(Number(count));
 const all=timedWords(p.transcript);
 if(!all.length)throw new Error('Analiza el vídeo para obtener la transcripción antes de buscar clips');
 if(!Number.isFinite(min))min=20;if(!Number.isFinite(max))max=59;if(!Number.isFinite(count))count=5;
 min=Math.max(5,min);count=Math.min(20,Math.max(1,count));
 if(max<=min)throw new Error('La duración máxima debe ser mayor que la mínima (y la mínima, de al menos 5 s)');
 const words=all.filter(w=>keptWord(p,w)),n=words.length,limit=Number(p.media?.duration)>0?Number(p.media.duration):Infinity;
 const result=(candidates,note='')=>({revision:p.revision,candidates,note});
 if(n<3)return result([],'Quedan muy pocas palabras en el montaje actual para proponer un clip.');
 const segLast=new Set();
 for(const s of Array.isArray(p.transcript)?p.transcript:[]){const t=timedWords([s]);if(t.length)segLast.add(t.at(-1).start);}
 const clips=ownClips(p),K=t=>{let k=0;for(const c of clips)if(t>c.start)k+=Math.min(t,c.end)-c.start;return k;};
 const spans=activeFillers(p,{extra:fillers}),isFiller=w=>{const mid=(w.start+w.end)/2;return spans.some(f=>mid>=f.start&&mid<=f.end);};
 // Pauses are measured in montage time: a gap that was cut out of the edit is not a pause.
 const gap=words.map((w,i)=>i<n-1?keptSeconds(p,w.end,words[i+1].start):Infinity);
 const closed=words.map(w=>CLOSED.test(w.word));
 // Without punctuation (some transcripts) segment ends stand in for sentence ends.
 const punctuated=closed.filter(Boolean).length>=Math.max(1,n/40);
 const boundary=words.map((w,i)=>i===n-1||closed[i]||gap[i]>.8||(!punctuated&&segLast.has(w.start)));
 // A little air around the first and last word, never into the neighbouring words.
 const ps=words.map((w,i)=>Math.max(i?Math.min(words[i-1].end,w.start):0,w.start-.12));
 const pe=words.map((w,i)=>Math.min(limit,Math.max(w.end,Math.min(i<n-1?words[i+1].start:limit,w.end+.2))));
 const Ks=ps.map(K),Ke=pe.map(K),Kw=words.map(w=>K(w.start));
 const fillPre=[0],pausePre=[0];
 words.forEach((w,i)=>{fillPre.push(fillPre[i]+(isFiller(w)?1:0));pausePre.push(pausePre[i]+(gap[i]>1.5?1:0));});
 const mid=(min+max)/2,found=[];
 for(let s=0;s<n;s++){
  if(s>0&&!boundary[s-1])continue;
  // Hook: first 3 s of the window; a question is a first sentence that ends in "?" or opens with "¿".
  let f=s;while(f<n-1&&!closed[f]&&words[f+1].start-words[s].start<8)f++;
  const question=/\?["'”’»)\]]*$/.test(words[f].word)||words[s].word.startsWith('¿');
  const zone=[];for(let k=s;k<n&&Kw[k]-Kw[s]<3;k++)zone.push(words[k]);
  const hook=hookSignals(zone,question),hookScore=Math.min(30,(hook.question?12:0)+(hook.number?10:0)+(hook.keyword?12:0));
  for(let e=s;e<n;e++){
   // Dead air of more than 4 s inside a short is never worth proposing (tighten the pauses first).
   if(e>s&&gap[e-1]>4)break;
   const D=Ke[e]-Ks[s];
   if(D>max+1e-9)break;
   if(!boundary[e]||D<min-1e-9)continue;
   const wps=(e-s+1)/D,fill=fillPre[e+1]-fillPre[s],pauses=pausePre[e]-pausePre[s];
   const score=Math.max(0,Math.min(100,Math.round(densityScore(wps)+hookScore+Math.max(0,15-5*fill)+(pauses?-Math.min(15,5*pauses):15)+(closed[e]?15:0))));
   found.push({s,e,score,D,wps,fill,pauses,hook,tie:Math.abs(D-mid)});
  }
 }
 found.sort((a,b)=>b.score-a.score||a.tie-b.tie||a.s-b.s);
 const picked=[];
 for(const c of found){
  if(picked.length>=count)break;
  const a=[ps[c.s],pe[c.e]];
  if(picked.some(x=>a[0]<pe[x.e]&&ps[x.s]<a[1]))continue;
  picked.push(c);
 }
 const candidates=picked.map(c=>{
  const reasons=[],{hook:h}=c;
  if(h.question)reasons.push('Gancho: arranca con una pregunta');
  if(h.number)reasons.push(`Gancho: la cifra «${h.number}» en los primeros 3 s`);
  if(h.keyword)reasons.push(`Gancho: «${h.keyword}» en los primeros 3 s`);
  const pace=round(c.wps);
  reasons.push(c.wps>=2.2&&c.wps<=3.5?`Ritmo de habla ideal (${pace} palabras/s)`:c.wps<2.2?`Aviso: ritmo lento (${pace} palabras/s)`:`Aviso: ritmo muy rápido (${pace} palabras/s)`);
  reasons.push(c.fill?`Aviso: ${c.fill} ${c.fill===1?'muletilla':'muletillas'} dentro del tramo`:'Sin muletillas');
  reasons.push(c.pauses?`Aviso: ${c.pauses} ${c.pauses===1?'pausa':'pausas'} de más de 1.5 s`:'Sin pausas largas (más de 1.5 s)');
  reasons.push(closed[c.e]?'Termina en frase cerrada':'Aviso: termina sin cerrar la frase');
  const text=words.slice(c.s,c.e+1).map(w=>w.word).join(' ').replace(/\s+/g,' ').trim();
  return {start:round(ps[c.s],3),end:round(pe[c.e],3),duration:round(c.D),score:c.score,reasons,text,title:headline(text)||'Clip sin título'};
 });
 return result(candidates,candidates.length?'':`No hay tramos de ${min}–${max} s que empiecen y terminen en una frase; prueba con otro rango de duración.`);
}

/* ---------------------------- B) Apply a short clip ---------------------------- */
// Same bookkeeping as prompt-editor's private helpers: resources anchored to the original speech
// follow the new cut.
function resourceTime(time,p){let offset=0;for(const c of p.clips.filter(c=>c.enabled)){if((c.sourceId||p.id)===p.id&&time>=c.start&&time<c.end)return offset+time-c.start;offset+=c.end-c.start;}return null;}
function remapResources(p){const d=p.automatic?.direction;if(d)for(const key of ['events','media'])d[key]=(d[key]||[]).map(e=>({...e,outputTime:resourceTime(e.at,p)})).filter(e=>e.outputTime!==null);}
// Keeps only [start,end] of the original; returns the new clip list (validated by cutClips).
export function shortClipCuts(p,start,end){
 start=Number(start);end=Number(end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Rango no válido: el final debe ser posterior al inicio y ambos no negativos');
 const duration=Number(p.media?.duration);
 if(!(duration>0)||end>duration+.001)throw new Error('El rango termina después del final del vídeo original');
 if(keptSeconds(p,start,end)<.5)throw new Error('No hay material en ese rango: ya está eliminado del montaje');
 const remove=[];
 if(start>.001)remove.push({start:0,end:start});
 if(end<duration-.001)remove.push({start:end,end:duration});
 return cutClips(p,remove);
}
export async function applyShortClip(id,revision,start,end){
 const p=await load(id);
 if(p.revision!==revision)throw new Error('El proyecto cambió. Recarga antes de crear el Short');
 if(busy(p))throw new Error('Espera a que termine el procesamiento antes de modificar el proyecto');
 const clips=shortClipCuts(p,start,end),total=cs=>cs.filter(c=>c.enabled).reduce((a,c)=>a+c.end-c.start,0);
 if(total(p.clips)-total(clips)<.05)throw new Error('El tramo elegido ya cubre todo el montaje: no hay nada que recortar');
 const kept=round(total(clips)),a=Number(start),b=Number(end);
 p.history=[...(p.history||[]),{settings:p.settings,clips:p.clips,manual:p.manual===true,automatic:structuredClone(p.automatic??null)}].slice(-20);
 p.clips=clips;remapResources(p);p.revision++;p.reviewed=true;p.artifacts={};
 p.lastInstruction={prompt:'Crear Short',explanation:`Se ha conservado solo el tramo ${chapterStamp(a)}–${chapterStamp(b)} del original (${kept} s) y se ha quitado el resto del montaje. Puedes deshacer el cambio.`};
 return save(p);
}

/* ------------------------------- C) Loudness ------------------------------- */
// ffmpeg prints the loudnorm JSON on stderr after its usual log; take the last well-formed block.
export function parseLoudnorm(text){
 let found=null;
 for(const m of String(text).matchAll(/\{[^{}]*\}/g)){try{const j=JSON.parse(m[0]);if(j&&typeof j==='object'&&'input_i' in j)found=j;}catch{}}
 if(!found)throw new Error('FFmpeg no devolvió la medición de volumen');
 const num=v=>{const x=Number(String(v).trim());return Number.isFinite(x)?x:null;};
 return {integrated:num(found.input_i),truePeak:num(found.input_tp),lra:num(found.input_lra),threshold:num(found.input_thresh)};
}
// Integrated loudness (LUFS), true peak (dBTP), loudness range (LU) and gating threshold (LUFS).
// Values are null when the audio is digital silence.
export async function measureLoudness(file){
 if(typeof file!=='string'||!file)throw new Error('Indica el archivo que quieres medir');
 await fs.access(file).catch(()=>{throw new Error('No se encuentra el archivo a medir; vuelve a generarlo');});
 let err;
 try{({err}=await run('ffmpeg',['-hide_banner','-nostdin','-i',file,'-map','0:a:0','-vn','-sn','-dn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{timeout:15*60*1000}));}
 catch(e){
  if(/matches no streams|does not contain any stream|Stream map/i.test(String(e?.message)))throw new Error('El archivo no tiene pista de audio que medir');
  throw e;
 }
 return parseLoudnorm(err);
}
// Indicative targets, not the exact behaviour of each platform.
export const LOUDNESS_TARGETS=[
 {id:'youtube',name:'YouTube',target:-14,high:'YouTube suele bajar el volumen de lo que supera su referencia, así que no ganas nada y puedes perder dinámica.',low:'Un vídeo más flojo que la referencia se oirá bajo frente a otros y la plataforma puede no subirlo.'},
 {id:'tiktok',name:'TikTok',target:-14,high:'La plataforma puede reajustar el volumen y un nivel alto arriesga saturar en los altavoces del móvil.',low:'En el móvil, con ruido alrededor, un nivel bajo hace que la voz se pierda.'},
 {id:'reels',name:'Instagram Reels',target:-14,high:'La plataforma puede reajustar el volumen y un nivel alto arriesga saturar en los altavoces del móvil.',low:'En el móvil, con ruido alrededor, un nivel bajo hace que la voz se pierda.'},
 {id:'spotify',name:'Spotify / podcasts',target:-16,high:'Los servicios de audio suelen normalizar a un nivel más bajo y pueden atenuar lo que se pasa.',low:'Un episodio más flojo que el resto obliga al oyente a subir el volumen.'},
 {id:'tv',name:'TV (EBU R128)',target:-23,high:'La emisión de televisión suele exigir un nivel integrado cercano a -23 LUFS; un programa más fuerte puede ser rechazado o normalizado.',low:'Por debajo del nivel de emisión el programa se oirá flojo frente a la programación habitual.'}
];
export const TRUE_PEAK_LIMIT=-1;
export function peakCheck(truePeak){
 const value=Number.isFinite(truePeak)?truePeak:null,ok=value===null||value<=TRUE_PEAK_LIMIT;
 return {limit:TRUE_PEAK_LIMIT,value,ok,advice:ok?'':`El pico real (${round(value,1)} dBTP) supera ${TRUE_PEAK_LIMIT} dBTP: al recodificar puede distorsionar. Baja el nivel general o usa un limitador.`};
}
export function loudnessPlatforms({integrated,truePeak}={}){
 if(!Number.isFinite(integrated))throw new Error('Medición de volumen no válida');
 const peak=peakCheck(truePeak);
 return LOUDNESS_TARGETS.map(t=>{
  const delta=round(integrated-t.target),status=Math.abs(delta)<=1?'ok':delta>0?'alto':'bajo';
  const advice=status==='ok'?`Orientativo: dentro de ±1 LU del objetivo de ${t.name} (${t.target} LUFS).`
   :status==='alto'?`Orientativo: ${t.high} Baja unos ${Math.abs(delta)} LU para acercarte a ${t.target} LUFS.`
   :`Orientativo: ${t.low} Sube unos ${Math.abs(delta)} LU para acercarte a ${t.target} LUFS.`;
  return {id:t.id,name:t.name,target:t.target,delta,status,advice:peak.ok?advice:`${advice} ${peak.advice}`};
 });
}
// Measures the final render, or the preview when there is none.
export async function loudnessReport(p){
 const source=p.artifacts?.export?.file?'export':p.artifacts?.preview?.file?'preview':null;
 if(!source)throw new Error('Genera una previsualización o un render para medir el volumen');
 const artifact=p.artifacts[source],m=await measureLoudness(artifact.file);
 if(m.integrated===null)throw new Error('No se pudo medir el volumen: el audio del vídeo está en silencio');
 return {source,fresh:artifact.revision===p.revision,integrated:m.integrated,truePeak:m.truePeak,lra:m.lra,threshold:m.threshold,peak:peakCheck(m.truePeak),platforms:loudnessPlatforms(m)};
}

/* --------------------------- D) Publishing checklist --------------------------- */
// ideal: indicative duration in seconds; vertical: expected orientation.
export const PLATFORMS={
 youtube:{name:'YouTube',vertical:false,ideal:null,loudness:'youtube'},
 shorts:{name:'YouTube Shorts',vertical:true,ideal:60,loudness:'youtube',advice:'orientativo: los Shorts funcionan mejor en torno a 60 s o menos'},
 reels:{name:'Instagram Reels',vertical:true,ideal:90,loudness:'reels',advice:'orientativo: los Reels rinden mejor hasta unos 90 s'},
 tiktok:{name:'TikTok',vertical:true,ideal:600,loudness:'tiktok',advice:'orientativo: lo habitual es no pasar de unos 10 min'}
};
export function publishChecklist(p,platform,{loudness}={}){
 if(typeof platform!=='string'||!Object.hasOwn(PLATFORMS,platform))throw new Error('Plataforma no válida: usa youtube, shorts, reels o tiktok');
 const spec=PLATFORMS[platform],s=p.settings||{},items=[];
 const add=(id,level,title,detail)=>items.push({id,level,title,detail});
 const artifact=p.artifacts?.export,montage=(p.clips||[]).filter(c=>c.enabled).reduce((a,c)=>a+c.end-c.start,0);
 const words=timedWords(p.transcript),hasText=words.length>0||(Array.isArray(p.transcript)?p.transcript:[]).some(x=>String(x.text||'').trim());

 p.reviewed?add('approved','ok','Propuesta aprobada','Los cortes están revisados y aprobados.')
  :add('approved','error','Propuesta aprobada','Todavía no has aprobado la propuesta: revisa los cortes y apruébala para poder renderizar.');

 if(!artifact?.file)add('render','error','Render al día','Todavía no hay render final: genera el vídeo antes de publicar.');
 else if(artifact.revision!==p.revision)add('render','warn','Render al día','El render final es de una versión anterior del montaje: vuelve a renderizar para incluir los últimos cambios.');
 else add('render','ok','Render al día',`El vídeo exportado corresponde a la versión actual del montaje (revisión ${p.revision}).`);

 const dims=profiles[s.profile];
 if(!dims)add('format','error','Formato de salida','El formato de salida no es válido: elige uno de los disponibles.');
 else{
  const [w,h]=dims,vertical=h>w;
  if(vertical===spec.vertical)add('format','ok','Formato de salida',`Salida ${w}×${h} (${vertical?'vertical 9:16':'horizontal 16:9'}), adecuada para ${spec.name}.`);
  else if(spec.vertical)add('format','error','Formato de salida',`La salida es horizontal (${w}×${h}) y ${spec.name} es vertical: cambia el formato a vertical (Reels, TikTok o Shorts).`);
  else add('format','warn','Formato de salida',`La salida es vertical (${w}×${h}); en YouTube un vídeo vertical puede tratarse como Short. Para un vídeo normal usa el formato horizontal.`);
 }

 if(montage<=0)add('duration','error','Duración','No hay fragmentos activos en el montaje.');
 else if(!spec.ideal)add('duration','ok','Duración',`El vídeo dura ${seconds(montage)}.`);
 else if(montage<=spec.ideal+.5)add('duration','ok','Duración',`El vídeo dura ${seconds(montage)} (${spec.advice}).`);
 else add('duration','warn','Duración',`El vídeo dura ${seconds(montage)}, más de lo recomendable (${spec.advice}). Considera recortarlo.`);

 const side=Math.max(Number(p.media?.width)||0,Number(p.media?.height)||0);
 if(!side)add('resolution','warn','Resolución del original','No se conoce la resolución del vídeo original.');
 else if(side>=1080)add('resolution','ok','Resolución del original',`El original es de ${p.media.width}×${p.media.height}.`);
 else add('resolution','warn','Resolución del original',`El original es de ${p.media.width}×${p.media.height}: por debajo de 1080 px en su lado largo se verá con menos nitidez.`);

 if(!s.subtitles)add('subtitles','warn','Subtítulos','Los subtítulos están desactivados; muchos espectadores ven el vídeo sin sonido.');
 else if(!hasText)add('subtitles','warn','Subtítulos','Los subtítulos están activados pero no hay transcripción: analiza el vídeo o desactívalos.');
 else add('subtitles','ok','Subtítulos','Subtítulos activados y con transcripción.');

 if(!words.length){
  add('fillers','warn','Muletillas','Sin transcripción con tiempos reales no se pueden detectar muletillas.');
  add('pauses','warn','Pausas','Sin transcripción con tiempos reales no se puede medir la pausa más larga.');
 }else{
  const fillers=activeFillers(p).length;
  fillers?add('fillers','warn','Muletillas',`Quedan ${fillers} ${fillers===1?'muletilla o repetición':'muletillas o repeticiones'}: quítalas desde la transcripción.`):add('fillers','ok','Muletillas','No quedan muletillas ni repeticiones detectables.');
  const longest=transcriptStats(p).longestPause;
  longest>1.5?add('pauses','warn','Pausas',`La pausa más larga dura ${round(longest)} s: acórtala para mantener el ritmo.`):add('pauses','ok','Pausas',longest>0?`La pausa más larga dura ${round(longest)} s (hasta 1.5 s es cómodo).`:'No hay pausas largas.');
 }

 String(s.title||'').trim()?add('title','ok','Título de portada',`Título: «${String(s.title).trim()}».`):add('title','warn','Título de portada','No hay título de portada: añade uno que enganche en los primeros segundos.');

 if(platform==='youtube'){
  p.artifacts?.thumbnail?.file?add('thumbnail','ok','Miniatura','La miniatura está creada.'):add('thumbnail','warn','Miniatura','Todavía no has creado la miniatura del vídeo.');
  const {chapters,note}=chaptersFor(p);
  chapters.length>=3?add('chapters','ok','Capítulos',`Se pueden proponer ${chapters.length} capítulos para la descripción.`):add('chapters','warn','Capítulos',note||'No hay suficientes capítulos posibles (YouTube pide al menos tres).');
 }

 const loud=loudness||artifact?.loudness,target=LOUDNESS_TARGETS.find(t=>t.id===spec.loudness).target;
 if(!loud||!Number.isFinite(loud.integrated))add('loudness','warn','Volumen',`Todavía no se ha medido el volumen: mídelo en el render para comprobar que está cerca de ${target} LUFS.`);
 else{
  const delta=round(loud.integrated-target),peak=peakCheck(loud.truePeak),near=Math.abs(delta)<=1;
  const base=`Volumen integrado de ${round(loud.integrated)} LUFS (objetivo orientativo ${target} LUFS)`;
  add('loudness',near&&peak.ok?'ok':'warn','Volumen',near?`${base}.${peak.ok?'':' '+peak.advice}`:`${base}: ${Math.abs(delta)} LU ${delta>0?'por encima':'por debajo'}.${peak.ok?'':' '+peak.advice}`);
 }

 const summary={ok:0,warn:0,error:0};for(const i of items)summary[i.level]++;
 return {platform,items,summary};
}
