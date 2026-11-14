import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {findShortClips,applyShortClip,shortClipCuts,measureLoudness,loudnessReport,loudnessPlatforms,parseLoudnorm,peakCheck,publishChecklist} from '../server/creator.mjs';
import {undoPrompt} from '../server/prompt-editor.mjs';
import {keptSeconds} from '../server/transcript-tools.mjs';
import {projectDir,save,load,defaults,run} from '../server/core.mjs';

// Speech generator: every sentence is {text, wps, pause}; words are evenly spaced with real timings.
const speech=(sentences,start=0)=>{
 let t=start;const transcript=[];
 for(const x of sentences){
  const tokens=x.text.split(' '),step=1/(x.wps||3);
  const words=tokens.map((tok,i)=>({word:' '+tok,start:+(t+i*step).toFixed(3),end:+(t+i*step+step*.8).toFixed(3)}));
  const end=words.at(-1).end;transcript.push({start:t,end,text:x.text,words});t=end+(x.pause??.4);
 }
 return {transcript,end:t};
};
const NAMES=['alfa','bravo','charlie','delta','eco','foxtrot','golf','hotel','india','julieta','kilo','lima','mike','noviembre','oscar','papa','quebec','romeo','sierra','tango','uniforme','victor','whisky','rayos','yanqui','zulu'];
const phrase=i=>({text:`Frase ${NAMES[i%NAMES.length]} del montaje de prueba hoy mismo.`,wps:2.8});
const project=(transcript,duration,over={})=>({id:'00000000-0000-0000-0000-000000000002',name:'C',revision:1,reviewed:true,media:{duration,width:1920,height:1080},settings:{...defaults},clips:[{id:'0',start:0,end:duration,enabled:true}],transcript,jobs:[],artifacts:{},...over});

/* ---------------------------------- findShortClips ---------------------------------- */
test('short clips: within limits, never overlapping, aligned to sentence boundaries, best first',()=>{
 const {transcript,end}=speech(Array.from({length:40},(_,i)=>phrase(i)));
 const p=project(transcript,Math.ceil(end)),result=findShortClips(p,{min:20,max:59,count:5});
 assert.equal(result.revision,1);
 assert(result.candidates.length>=2&&result.candidates.length<=5);
 const sorted=[...result.candidates].sort((a,b)=>a.start-b.start);
 for(let i=0;i<result.candidates.length;i++){
  const c=result.candidates[i];
  assert(c.duration>=20-.05&&c.duration<=59+.05,`duration ${c.duration}`);
  assert(c.start>=0&&c.end<=p.media.duration&&c.end>c.start);
  assert(Math.abs(keptSeconds(p,c.start,c.end)-c.duration)<=.06,'duration is what stays in the edit');
  assert(c.score>=0&&c.score<=100&&Number.isInteger(c.score));
  if(i)assert(c.score<=result.candidates[i-1].score,'best first');
  assert(transcript.some(s=>c.start<=s.start+1e-3&&c.start>=s.start-.121),'starts at the beginning of a sentence');
  assert(transcript.some(s=>c.end>=s.end-1e-3&&c.end<=s.end+.201),'ends at the end of a sentence');
  assert.match(c.text,/^Frase .*mismo\.$/);assert(c.title.length>0);
  assert(c.reasons.length>=4&&c.reasons.every(r=>typeof r==='string'&&r));
 }
 for(let i=1;i<sorted.length;i++)assert(sorted[i].start>=sorted[i-1].end,'no overlap');
 assert.equal(findShortClips(p,{min:20,max:59,count:1}).candidates.length,1);
 assert(findShortClips(p,{min:10,max:15,count:20}).candidates.length<=20);
 // Bad options fall back to the defaults or fail clearly.
 assert.equal(findShortClips(p,{min:'x',max:NaN,count:undefined}).candidates.length,result.candidates.length);
 assert.throws(()=>findShortClips(p,{min:30,max:30}),/máxima/);
});

test('short clips: hook, fillers, pauses and pace explain the score',()=>{
 const good=[{text:'¿Por qué el 90% de los vídeos fracasa en tres segundos?',wps:3},...Array.from({length:8},()=>({text:'Aprende a cortar las pausas largas sin perder el ritmo del vídeo.',wps:3}))];
 good.at(-1).pause=6;
 const bad=Array.from({length:10},()=>({text:'Pues eh no sé qué decir eh la verdad hoy.',wps:1.2,pause:2}));
 const a=speech(good),b=speech(bad,a.end);
 const p=project([...a.transcript,...b.transcript],Math.ceil(b.end)),{candidates}=findShortClips(p,{min:20,max:40,count:5});
 const best=candidates[0];
 assert.equal(best.start,0);assert(best.score>=90,`score ${best.score}`);
 assert(best.reasons.includes('Gancho: arranca con una pregunta'));
 assert(best.reasons.some(r=>/Gancho: la cifra «90%»/.test(r)));
 assert(best.reasons.some(r=>/Gancho: «por qué»/.test(r)));
 assert(best.reasons.includes('Sin muletillas'));assert(best.reasons.includes('Termina en frase cerrada'));
 assert(best.reasons.some(r=>/Ritmo de habla ideal/.test(r)));assert(best.reasons.some(r=>/Sin pausas largas/.test(r)));
 const rest=candidates.slice(1);assert(rest.length>=1);
 for(const c of rest){
  assert(c.start>=a.end-.2,'the weak candidates live in the second part');
  assert(c.score<best.score-40,`weak score ${c.score}`);
  assert(c.reasons.some(r=>/^Aviso: ritmo lento/.test(r)));
  assert(c.reasons.some(r=>/^Aviso: \d+ muletillas/.test(r)));
  assert(c.reasons.some(r=>/^Aviso: \d+ pausas de más de 1\.5 s/.test(r)));
  assert(!c.reasons.some(r=>/^Gancho/.test(r)));
 }
});

test('short clips: a trigger word in the first seconds adds exactly one hook, "como" without accent is not one',()=>{
 const rest=Array.from({length:7},(_,i)=>phrase(i));
 const region=(first,start)=>{const list=[{text:first,wps:2.8},...rest.map(r=>({...r}))];list.at(-1).pause=8;return speech(list,start);};
 const y=region('Nadie te cuenta este truco de edición sencillo hoy.',0);
 const x2=region('Todos te cuentan este método de edición sencillo hoy.',y.end);
 const p=project([...y.transcript,...x2.transcript],Math.ceil(x2.end)),{candidates}=findShortClips(p,{min:20,max:40,count:2});
 const hooked=candidates.find(c=>c.start<y.end-1),plain=candidates.find(c=>c.start>=y.end-1);
 assert(hooked&&plain);
 assert(hooked.reasons.includes('Gancho: «nadie» en los primeros 3 s'));
 assert(!plain.reasons.some(r=>/^Gancho/.test(r)));
 assert.equal(hooked.score-plain.score,12,'one trigger word is worth 12 points, no matter how many appear');
 const como=speech([{text:'Te enseño como editar un vídeo largo sin perder tiempo hoy.',wps:2.8},...rest]);
 assert(!findShortClips(project(como.transcript,Math.ceil(como.end)),{min:20,max:40,count:1}).candidates[0].reasons.some(r=>/^Gancho/.test(r)));
 const accent=speech([{text:'Cómo editar un vídeo largo sin perder tiempo hoy mismo.',wps:2.8},...rest]);
 assert(findShortClips(project(accent.transcript,Math.ceil(accent.end)),{min:20,max:40,count:1}).candidates[0].reasons.some(r=>/«cómo»/.test(r)));
});

test('short clips: only speech that is still in the edit counts, and the duration is what stays',()=>{
 const {transcript,end}=speech(Array.from({length:30},(_,i)=>phrase(i)));
 // Remove the middle third: sentences 10..19 are gone from the montage.
 const gapStart=transcript[10].start-.05,gapEnd=transcript[20].start-.05;
 const p=project(transcript,Math.ceil(end),{clips:[{id:'0',start:0,end:gapStart,enabled:true},{id:'1',start:gapEnd,end:Math.ceil(end),enabled:true}]});
 const {candidates}=findShortClips(p,{min:15,max:30,count:10});
 assert(candidates.length>=2);
 const removed=NAMES.slice(10,20).map(n=>`Frase ${n} `);
 for(const c of candidates){
  assert(c.duration<=30.05);
  assert(!removed.some(r=>c.text.includes(r)),'removed sentences are never proposed');
  assert(Math.abs(keptSeconds(p,c.start,c.end)-c.duration)<=.06);
 }
 // A window may span the cut: its pause is measured in montage time, so it is not penalised.
 const across=candidates.filter(c=>c.start<gapStart&&c.end>gapEnd);
 for(const c of across)assert(c.reasons.includes('Sin pausas largas (más de 1.5 s)'));
});

test('short clips: refuses without real timings, reports when nothing fits',()=>{
 const message=/Analiza el vídeo para obtener la transcripción antes de buscar clips/;
 assert.throws(()=>findShortClips(project([],60)),message);
 assert.throws(()=>findShortClips(project(undefined,60)),message);
 assert.throws(()=>findShortClips(project([{start:0,end:5,text:'hola',words:[{word:'hola',start:0,end:5,estimated:true}]}],60)),message,'estimated words are display-only');
 const {transcript}=speech(Array.from({length:6},(_,i)=>phrase(i)));
 const none=findShortClips(project(transcript,60),{min:50,max:59});
 assert.deepEqual(none.candidates,[]);assert.match(none.note,/No hay tramos/);
 const gone=findShortClips(project(transcript,200,{clips:[{id:'0',start:100,end:110,enabled:true}]}));
 assert.deepEqual(gone.candidates,[]);assert.match(gone.note,/pocas palabras/);
 // Pure: the project is not modified.
 const p=project(transcript,60),before=JSON.stringify(p);findShortClips(p);assert.equal(JSON.stringify(p),before);
});

test('short clips: transcripts without punctuation fall back to segment ends',()=>{
 const raw=speech(Array.from({length:30},(_,i)=>({text:`frase ${NAMES[i%26]} del montaje de prueba hoy mismo`,wps:2.8})));
 const p=project(raw.transcript,Math.ceil(raw.end)),{candidates}=findShortClips(p,{min:20,max:40,count:3});
 assert(candidates.length>=2);
 for(const c of candidates){assert(raw.transcript.some(s=>Math.abs(s.start-c.start)<=.121),'starts on a segment');assert(c.reasons.some(r=>/^Aviso: termina sin cerrar la frase/.test(r)));}
});

test('short clips: a long recording is searched quickly',()=>{
 const {transcript,end}=speech(Array.from({length:600},(_,i)=>phrase(i)));
 const started=Date.now(),result=findShortClips(project(transcript,Math.ceil(end)),{count:10});
 assert(result.candidates.length>=5);assert(Date.now()-started<8000,'about 35 minutes of speech');
});

/* -------------------------------- applyShortClip -------------------------------- */
test('applying a short keeps only the range, is revision-checked, undoable and capped at 20 undo steps',async()=>{
 const id=randomUUID(),dir=projectDir(id);await fs.mkdir(dir,{recursive:true});
 try{
  const base=project([{start:0,end:10,text:'x',words:[]}],100,{id,revision:1,reviewed:false,artifacts:{preview:{file:'p.mp4',revision:1}},clips:[{id:'0',start:0,end:100,enabled:true,reason:'Original completo'}],automatic:{direction:{events:[{at:30,kind:'a'},{at:5,kind:'b'},{at:90,kind:'c'}],media:[]}}});
  await save(base);
  await assert.rejects(applyShortClip(id,0,20,60),/cambió/);
  for(const [a,b,message] of [[60,20,/Rango no válido/],[20,20,/Rango no válido/],[-5,20,/Rango no válido/],[NaN,20,/Rango no válido/],['x',20,/Rango no válido/],[20,Infinity,/Rango no válido/],[50,120,/después del final/]])
   await assert.rejects(applyShortClip(id,1,a,b),message,`range ${a}-${b}`);
  await assert.rejects(applyShortClip(id,1,0,100),/nada que recortar/);
  assert.equal((await load(id)).revision,1,'rejected calls change nothing');

  const short=await applyShortClip(id,1,20,60);
  assert.deepEqual(short.clips.map(c=>[c.start,c.end,c.enabled]),[[20,60,true]]);
  assert.equal(short.revision,2);assert.equal(short.reviewed,true);assert.deepEqual(short.artifacts,{});
  assert.equal(short.history.length,1);assert.deepEqual(short.history[0].clips.map(c=>[c.start,c.end]),[[0,100]]);
  assert.equal(short.lastInstruction.prompt,'Crear Short');assert.match(short.lastInstruction.explanation,/0:20–1:00.*40 s.*deshacer/);
  assert.deepEqual(short.automatic.direction.events.map(e=>[e.kind,e.outputTime]),[['a',10]],'resources outside the short are dropped, the rest follow the cut');
  assert.deepEqual((await load(id)).clips,JSON.parse(JSON.stringify(short.clips)),'persisted');

  await assert.rejects(applyShortClip(id,1,30,40),/cambió/);
  await assert.rejects(applyShortClip(id,2,70,90),/No hay material/);
  const inner=await applyShortClip(id,2,25,45);assert.deepEqual(inner.clips.map(c=>[c.start,c.end]),[[25,45]]);
  const undone=await undoPrompt(id);assert.deepEqual(undone.clips.map(c=>[c.start,c.end]),[[20,60]]);
  const undone2=await undoPrompt(id);assert.deepEqual(undone2.clips.map(c=>[c.start,c.end]),[[0,100]]);
  assert.deepEqual(undone2.automatic.direction.events.map(e=>e.at),[30,5,90],'undo brings the resources back');

  const current=await load(id);current.jobs=[{id:'j',status:'running'}];await save(current);
  await assert.rejects(applyShortClip(id,current.revision,10,50),/termine/);
  current.jobs=[{id:'k',status:'queued'}];await save(current);
  await assert.rejects(applyShortClip(id,current.revision,10,50),/termine/);
  current.jobs=[{id:'j',status:'done'}];current.history=Array.from({length:20},(_,i)=>({settings:current.settings,clips:current.clips,marker:i}));await save(current);
  const capped=await applyShortClip(id,current.revision,10,50);
  assert.equal(capped.history.length,20);assert.equal(capped.history[0].marker,1,'the oldest undo step was dropped');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('shortClipCuts handles disabled clips and multi-source montages like the other cutters',()=>{
 const p=project([],100,{clips:[{id:'0',start:0,end:30,enabled:true},{id:'1',start:30,end:60,enabled:false},{id:'2',start:60,end:100,enabled:true}]});
 assert.deepEqual(shortClipCuts(p,10,70).map(c=>[c.start,c.end,c.enabled]),[[10,30,true],[30,60,false],[60,70,true]]);
 assert.throws(()=>shortClipCuts(project([],100,{clips:[{id:'0',start:0,end:10,enabled:true}]}),50,60),/No hay material/);
 const multi=project([],100,{clips:[{id:'0',start:0,end:50,enabled:true,sourceId:'other'},{id:'1',start:0,end:50,enabled:true}]});
 assert.throws(()=>shortClipCuts(multi,10,40),/varios vídeos/);
});

/* ---------------------------------- Loudness ---------------------------------- */
test('loudnorm output is parsed even with noise around it',()=>{
 const noise=`ffmpeg version 9\n  Metadata: {not json}\n[Parsed_loudnorm_0 @ 000001] \n{\n\t"input_i" : "-23.05",\n\t"input_tp" : "-20.00",\n\t"input_lra" : "0.00",\n\t"input_thresh" : "-33.05",\n\t"output_i" : "-16.0",\n\t"target_offset" : "0.0"\n}\nsize=N/A time=00:00:05.00 {x}\n`;
 assert.deepEqual(parseLoudnorm(noise),{integrated:-23.05,truePeak:-20,lra:0,threshold:-33.05});
 assert.deepEqual(parseLoudnorm('{ "input_i" : "-inf", "input_tp" : "-inf", "input_lra" : "0.00", "input_thresh" : "-70.00" }'),{integrated:null,truePeak:null,lra:0,threshold:-70});
 assert.throws(()=>parseLoudnorm('sin nada {}'),/medición/);
});

test('platform statuses follow the ±1 LU margin around each indicative target',()=>{
 const by=(integrated,truePeak=-3)=>Object.fromEntries(loudnessPlatforms({integrated,truePeak}).map(x=>[x.id,x]));
 const a=by(-14);
 assert.deepEqual(['youtube','tiktok','reels'].map(k=>[a[k].status,a[k].delta,a[k].target]),[['ok',0,-14],['ok',0,-14],['ok',0,-14]]);
 assert.deepEqual([a.spotify.status,a.spotify.delta,a.spotify.target],['alto',2,-16]);
 assert.deepEqual([a.tv.status,a.tv.delta,a.tv.target],['alto',9,-23]);
 const b=by(-23);assert.deepEqual([b.tv.status,b.youtube.status,b.youtube.delta,b.spotify.status],['ok','bajo',-9,'bajo']);
 assert.equal(by(-15).youtube.status,'ok');assert.equal(by(-15.1).youtube.status,'bajo');assert.equal(by(-13).youtube.status,'ok');assert.equal(by(-12.9).youtube.status,'alto');
 for(const x of Object.values(a))assert.match(x.advice,/Orientativo/);
 assert.match(a.tv.advice,/Baja unos 9 LU/);assert.match(b.youtube.advice,/Sube unos 9 LU/);
 assert(Object.values(a).every(x=>!/pico real/.test(x.advice)));
 const hot=by(-14,-.2);assert(Object.values(hot).every(x=>/pico real \(-0\.2 dBTP\).*-1 dBTP/.test(x.advice)));
 assert.equal(peakCheck(-1).ok,true);assert.equal(peakCheck(-.99).ok,false);assert.equal(peakCheck(null).ok,true);
 assert.throws(()=>loudnessPlatforms({integrated:null}),/no válida/);
});

const tone=(file,amplitude,extra=[])=>run('ffmpeg',['-v','error','-y','-f','lavfi','-i',`aevalsrc=${amplitude}*sin(2*PI*1000*t):s=48000:d=4`,...extra,file],{signal:null});

test('measureLoudness reads a real tone: -20 dBFS peak is about -23 LUFS and -20 dBTP',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'creator-'));
 try{
  const quiet=path.join(dir,'quiet.wav'),loud=path.join(dir,'loud.wav');
  await tone(quiet,.1,['-c:a','pcm_s16le']);await tone(loud,.5,['-c:a','pcm_s16le']);
  const q=await measureLoudness(quiet),l=await measureLoudness(loud);
  assert(Math.abs(q.integrated+23)<=.5,`integrated ${q.integrated}`);assert(Math.abs(q.truePeak+20)<=.5,`true peak ${q.truePeak}`);
  assert(q.lra>=0&&q.lra<1&&Number.isFinite(q.threshold));
  assert(Math.abs((l.integrated-q.integrated)-13.98)<=.3,'a 5x amplitude is 14 dB louder');
  // Inside a video container, next to a video stream, and with a path that has spaces.
  const spaced=path.join(dir,'con espacios.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=64x64:d=4:r=10','-f','lavfi','-i','aevalsrc=0.1*sin(2*PI*1000*t):s=48000:d=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',spaced],{signal:null});
  const v=await measureLoudness(spaced);assert(Math.abs(v.integrated+23)<=1,`mp4 integrated ${v.integrated}`);
  const silentVideo=path.join(dir,'mudo.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=64x64:d=2:r=10','-an','-c:v','libx264','-pix_fmt','yuv420p',silentVideo],{signal:null});
  await assert.rejects(measureLoudness(silentVideo),/no tiene pista de audio/);
  await assert.rejects(measureLoudness(path.join(dir,'no-existe.wav')),/No se encuentra/);
  await assert.rejects(measureLoudness(''),/Indica el archivo/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('loudness report prefers the final render, falls back to the preview and flags stale files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'creator-'));
 try{
  const exportFile=path.join(dir,'final.wav'),previewFile=path.join(dir,'preview.wav'),hotFile=path.join(dir,'hot.wav'),silent=path.join(dir,'silence.wav');
  await tone(exportFile,.2,['-c:a','pcm_s16le']);await tone(previewFile,.1,['-c:a','pcm_s16le']);await tone(hotFile,.99,['-c:a','pcm_s16le']);
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=2','-c:a','pcm_s16le',silent],{signal:null});
  await assert.rejects(loudnessReport({revision:1,artifacts:{}}),/Genera una previsualización o un render para medir el volumen/);
  await assert.rejects(loudnessReport({revision:1}),/Genera una previsualización/);
  const both=await loudnessReport({revision:3,artifacts:{export:{file:exportFile,revision:3},preview:{file:previewFile,revision:3}}});
  assert.equal(both.source,'export');assert.equal(both.fresh,true);assert(Math.abs(both.integrated+17)<=.6,`integrated ${both.integrated}`);
  assert.deepEqual(both.platforms.map(x=>x.id),['youtube','tiktok','reels','spotify','tv']);
  assert.equal(both.platforms.find(x=>x.id==='youtube').status,'bajo');assert.equal(both.platforms.find(x=>x.id==='spotify').status,'bajo');
  assert.equal(both.peak.ok,true);
  const preview=await loudnessReport({revision:4,artifacts:{preview:{file:previewFile,revision:3}}});
  assert.equal(preview.source,'preview');assert.equal(preview.fresh,false);assert(Math.abs(preview.integrated+23)<=.5);
  assert.equal(preview.platforms.find(x=>x.id==='tv').status,'ok');
  const hot=await loudnessReport({revision:1,artifacts:{export:{file:hotFile,revision:1}}});
  assert.equal(hot.peak.ok,false);assert(hot.platforms.every(x=>/pico real/.test(x.advice)));
  await assert.rejects(loudnessReport({revision:1,artifacts:{export:{file:silent,revision:1}}}),/silencio/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

/* ------------------------------- publishChecklist ------------------------------- */
const clean=(count,start=0)=>speech(Array.from({length:count},(_,i)=>phrase(i)),start);
// A project that passes every check for the given platform.
function ready(platform){
 const long=platform==='youtube',spec=speech(Array.from({length:long?36:13},(_,i)=>phrase(i)));
 const duration=Math.ceil(spec.end),vertical=platform!=='youtube';
 return project(spec.transcript,duration,{revision:4,settings:{...defaults,profile:vertical?(platform==='shorts'?'shorts':platform):'youtube',title:'Mi vídeo',subtitles:true},
  artifacts:{export:{file:'x.mp4',revision:4,duration},...(long?{thumbnail:{file:'t.jpg'}}:{})}});
}
const loud={integrated:-14.3,truePeak:-3};
const levels=(p,platform,opts)=>Object.fromEntries(publishChecklist(p,platform,opts).items.map(i=>[i.id,i.level]));

test('checklist: a finished project passes every check on every platform',()=>{
 for(const platform of ['youtube','shorts','reels','tiktok']){
  const result=publishChecklist(ready(platform),platform,{loudness:loud});
  assert.equal(result.platform,platform);
  assert.deepEqual(result.summary,{ok:result.items.length,warn:0,error:0},`${platform}: ${JSON.stringify(result.items.filter(i=>i.level!=='ok'))}`);
  assert(result.items.every(i=>i.id&&i.title&&i.detail&&['ok','warn','error'].includes(i.level)));
 }
 const ids=p=>publishChecklist(ready(p),p,{loudness:loud}).items.map(i=>i.id);
 assert.deepEqual(ids('youtube'),['approved','render','format','duration','resolution','subtitles','fillers','pauses','title','thumbnail','chapters','loudness']);
 assert.deepEqual(ids('shorts'),['approved','render','format','duration','resolution','subtitles','fillers','pauses','title','loudness']);
 assert.throws(()=>publishChecklist(ready('youtube'),'facebook'),/Plataforma no válida/);
 assert.throws(()=>publishChecklist(ready('youtube'),'constructor'),/Plataforma no válida/);
 assert.throws(()=>publishChecklist(ready('youtube')),/Plataforma no válida/);
});

test('checklist: blocking problems are errors',()=>{
 const p=ready('shorts');
 assert.equal(levels({...p,reviewed:false},'shorts',{loudness:loud}).approved,'error');
 assert.equal(levels({...p,artifacts:{}},'shorts',{loudness:loud}).render,'error');
 assert.equal(levels({...p,settings:{...p.settings,profile:'youtube'}},'shorts',{loudness:loud}).format,'error');
 assert.equal(levels({...p,settings:{...p.settings,profile:'youtube'}},'tiktok',{loudness:loud}).format,'error');
 assert.equal(levels({...p,settings:{...p.settings,profile:'nope'}},'reels',{loudness:loud}).format,'error');
 assert.equal(levels({...p,clips:[{id:'0',start:0,end:10,enabled:false}]},'reels',{loudness:loud}).duration,'error');
 const bad=publishChecklist({...p,reviewed:false,artifacts:{}},'shorts');
 assert(bad.summary.error>=2);assert.equal(bad.summary.ok+bad.summary.warn+bad.summary.error,bad.items.length);
 assert.match(bad.items.find(i=>i.id==='approved').detail,/apruébala/);
});

test('checklist: recommendations are warnings, and orientation is judged per platform',()=>{
 const p=ready('shorts'),yt=ready('youtube');
 // Stale render: exists but is an older revision.
 assert.equal(levels({...p,revision:5},'shorts',{loudness:loud}).render,'warn');
 // Vertical output for YouTube is questionable, not wrong.
 assert.equal(levels({...yt,settings:{...yt.settings,profile:'reels'}},'youtube',{loudness:loud}).format,'warn');
 assert.equal(levels({...yt,settings:{...yt.settings,profile:'youtube4k'}},'youtube',{loudness:loud}).format,'ok');
 for(const profile of ['reels','tiktok','shorts'])assert.equal(levels({...p,settings:{...p.settings,profile}},'reels',{loudness:loud}).format,'ok');
 // Indicative duration limits.
 const longer=(platform,seconds)=>levels({...ready(platform),clips:[{id:'0',start:0,end:seconds,enabled:true}],media:{duration:seconds,width:1920,height:1080}},platform,{loudness:loud}).duration;
 assert.equal(longer('shorts',55),'ok');assert.equal(longer('shorts',75),'warn');
 assert.equal(longer('reels',85),'ok');assert.equal(longer('reels',120),'warn');
 assert.equal(longer('tiktok',590),'ok');assert.equal(longer('tiktok',700),'warn');
 assert.equal(longer('youtube',1800),'ok');
 assert.match(publishChecklist({...p,clips:[{id:'0',start:0,end:75,enabled:true}]},'shorts',{loudness:loud}).items.find(i=>i.id==='duration').detail,/orientativo/);
 // Resolution of the original.
 assert.equal(levels({...p,media:{...p.media,width:854,height:480}},'shorts',{loudness:loud}).resolution,'warn');
 assert.equal(levels({...p,media:{...p.media,width:1080,height:1920}},'shorts',{loudness:loud}).resolution,'ok');
 assert.equal(levels({...p,media:{duration:50}},'shorts',{loudness:loud}).resolution,'warn');
 // Captions.
 assert.equal(levels({...p,settings:{...p.settings,subtitles:false}},'shorts',{loudness:loud}).subtitles,'warn');
 assert.equal(levels({...p,transcript:[]},'shorts',{loudness:loud}).subtitles,'warn');
 // Title and thumbnail.
 assert.equal(levels({...p,settings:{...p.settings,title:'  '}},'shorts',{loudness:loud}).title,'warn');
 assert.equal(levels({...yt,artifacts:{export:yt.artifacts.export}},'youtube',{loudness:loud}).thumbnail,'warn');
});

test('checklist: fillers, long pauses and chapters come from the transcript',()=>{
 const talk=[...Array.from({length:6},(_,i)=>phrase(i)),{text:'Pues eh no sé qué decir hoy mismo.',wps:3},...Array.from({length:6},(_,i)=>phrase(i+6))];
 const withFiller=speech(talk),p=ready('shorts');
 const fp=project(withFiller.transcript,Math.ceil(withFiller.end),{...p,media:{duration:Math.ceil(withFiller.end),width:1920,height:1080},clips:[{id:'0',start:0,end:Math.ceil(withFiller.end),enabled:true}],transcript:withFiller.transcript});
 const fl=publishChecklist(fp,'shorts',{loudness:loud});
 assert.equal(fl.items.find(i=>i.id==='fillers').level,'warn');assert.match(fl.items.find(i=>i.id==='fillers').detail,/1 muletilla/);
 // Removing the filler from the montage clears the warning.
 const f=withFiller.transcript[6].words[1];
 const cut=project(withFiller.transcript,Math.ceil(withFiller.end),{...fp,clips:[{id:'0',start:0,end:f.start-.05,enabled:true},{id:'1',start:f.end+.05,end:Math.ceil(withFiller.end),enabled:true}]});
 assert.equal(levels(cut,'shorts',{loudness:loud}).fillers,'ok');
 // A 2 s silence between phrases.
 const gapped=speech([...Array.from({length:5},(_,i)=>phrase(i)),{...phrase(5),pause:2.2},...Array.from({length:5},(_,i)=>phrase(i+6))]);
 const gp=project(gapped.transcript,Math.ceil(gapped.end),{...p,transcript:gapped.transcript,clips:[{id:'0',start:0,end:Math.ceil(gapped.end),enabled:true}],media:{duration:Math.ceil(gapped.end),width:1920,height:1080}});
 const pauses=publishChecklist(gp,'shorts',{loudness:loud}).items.find(i=>i.id==='pauses');
 assert.equal(pauses.level,'warn');assert.match(pauses.detail,/2\.2 s/);
 // Unknown timings cannot be checked.
 const noWords=levels({...p,transcript:[{start:0,end:5,text:'hola',words:[]}]},'shorts',{loudness:loud});
 assert.deepEqual([noWords.fillers,noWords.pauses,noWords.subtitles],['warn','warn','ok']);
 // YouTube chapters: three or more are possible only for a long enough talk.
 const yt=ready('youtube');
 const chapters=publishChecklist(yt,'youtube',{loudness:loud}).items.find(i=>i.id==='chapters');assert.equal(chapters.level,'ok');assert.match(chapters.detail,/\d+ capítulos/);
 const short=ready('youtube'),few=speech(Array.from({length:4},(_,i)=>phrase(i)));
 const sp=project(few.transcript,Math.ceil(few.end),{...short,transcript:few.transcript,clips:[{id:'0',start:0,end:Math.ceil(few.end),enabled:true}],media:{duration:Math.ceil(few.end),width:1920,height:1080}});
 const sc=publishChecklist(sp,'youtube',{loudness:loud}).items.find(i=>i.id==='chapters');assert.equal(sc.level,'warn');assert.match(sc.detail,/30 s|capítulos/);
});

test('checklist: loudness comes from the given measurement or the render, and is judged against the platform target',()=>{
 const p=ready('tiktok'),find=(pp,opts)=>publishChecklist(pp,'tiktok',opts).items.find(i=>i.id==='loudness');
 assert.equal(find(p).level,'warn');assert.match(find(p).detail,/Todavía no se ha medido/);
 assert.equal(find(p,{loudness:{integrated:-14.9,truePeak:-2}}).level,'ok');
 const high=find(p,{loudness:{integrated:-9,truePeak:-2}});assert.equal(high.level,'warn');assert.match(high.detail,/5 LU por encima/);
 const low=find(p,{loudness:{integrated:-20,truePeak:-2}});assert.equal(low.level,'warn');assert.match(low.detail,/6 LU por debajo/);
 const peaky=find(p,{loudness:{integrated:-14,truePeak:-.3}});assert.equal(peaky.level,'warn');assert.match(peaky.detail,/pico real/);
 assert.equal(find({...p,artifacts:{export:{...p.artifacts.export,loudness:{integrated:-14.2,truePeak:-4}}}}).level,'ok','a measurement stored on the render is used');
 assert.equal(find(p,{loudness:{integrated:null}}).level,'warn');
 // A full loudnessReport result is accepted as is (extra fields are ignored).
 assert.equal(find(p,{loudness:{source:'export',fresh:true,integrated:-14,truePeak:-3,lra:2,platforms:loudnessPlatforms({integrated:-14,truePeak:-3})}}).level,'ok');
});
