import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {findLongPauses,retimeSegment,replaceInTranscript,transcriptStats,keywords,chaptersFor,publishingDraft,chapterStamp,headline} from '../server/insights.mjs';
import {mergeModelKit,publishKit} from '../server/publish.mjs';
import {cues} from '../server/subtitles.mjs';
import {opencutManifest} from '../server/opencut-bridge.mjs';
import {rulePlan} from '../server/rule-planner.mjs';
import {applyPlan,tightenPauses,correctSegment,replaceText,undoPrompt,previewInstruction,approveProposal,setOutputFormat} from '../server/prompt-editor.mjs';
import {projectDir,save,load,defaults} from '../server/core.mjs';

const w=(word,start,end,extra={})=>({word:' '+word,start,end,...extra});
const seg=(start,end,list)=>({start,end,text:list.map(x=>x.word.trim()).join(' '),words:list});
const transcript=[
 seg(0,2,[w('Hola',0,.4),w('a',.5,.6),w('todos',.7,1.2)]),
 seg(3.5,5,[w('hoy',3.5,3.8),w('vemos',3.9,4.4),w('edición',4.5,5)]),
 seg(5.2,6,[w('rápida',5.2,6)]),
];
const project=(over={})=>({id:'00000000-0000-0000-0000-000000000001',name:'P',media:{duration:10},settings:{...defaults},clips:[{id:'0',start:0,end:10,enabled:true}],transcript,...over});

test('long pauses are shortened to the chosen breathing room, only inside the edit',()=>{
 const items=findLongPauses(project(),{maxPause:.6,keep:.3});
 assert.equal(items.length,1);assert.deepEqual([items[0].start,items[0].end],[1.35,3.35]);assert.equal(items[0].gap,2.3);
 assert.equal(findLongPauses(project(),{maxPause:3}).length,0,'below the limit nothing is cut');
 assert.equal(findLongPauses(project({clips:[{start:0,end:1.3,enabled:true}]})).length,0,'gap next to removed speech is left alone');
 const keep=findLongPauses(project(),{maxPause:.6,keep:5})[0];assert(keep===undefined||keep.end-keep.start>=.05,'keep is clamped to the limit');
});

test('text corrections keep real timings when the word count matches, otherwise estimate',()=>{
 const same=retimeSegment(transcript[1],'hoy vemos edicion');
 assert.deepEqual(same.words.map(x=>[x.word.trim(),x.start,x.estimated]),[['hoy',3.5,undefined],['vemos',3.9,undefined],['edicion',4.5,undefined]]);
 const longer=retimeSegment(transcript[1],'hoy vamos a ver edición');
 assert.equal(longer.words.length,5);assert(longer.words.every(x=>x.estimated));assert.equal(longer.words.at(-1).end,5);
 assert.throws(()=>retimeSegment(transcript[1],'   '),/entre 1 y 5000/);
});

test('find and replace respects whole words, accents and case, and counts matches',()=>{
 const t=[{start:0,end:1,text:'Open cut y opencut. OPENCUT gana',words:[]}];
 const r=replaceInTranscript(t,'opencut','OpenCut');
 assert.equal(r.count,2);assert.equal(r.transcript[0].text,'Open cut y OpenCut. OpenCut gana');
 assert.equal(replaceInTranscript([{start:0,end:1,text:'tecnología',words:[]}],'tecno','x').count,0,'no partial words');
 assert.equal(replaceInTranscript([{start:0,end:1,text:'a+b (x)',words:[]}],'(x)','y',{wholeWord:false}).transcript[0].text,'a+b y','regex characters are literal');
 assert.throws(()=>replaceInTranscript(t,' ','x'),/buscar/);
});

test('stats describe the montage: removed share, pace, speech and longest pause',()=>{
 const s=transcriptStats(project({clips:[{start:0,end:6,enabled:true}]}));
 assert.equal(s.original,10);assert.equal(s.montage,6);assert.equal(s.removedPercent,40);assert.equal(s.words,7);assert.equal(s.wordsPerMinute,70);assert.equal(s.longestPause,2.3);
});

test('keywords skip stopwords and fillers; chapters follow YouTube rules',()=>{
 assert.deepEqual(keywords('el editor de vídeo editor local y el vídeo local eh mmm editor'),['editor','local','video']);
 assert.equal(chapterStamp(65),'1:05');assert.equal(chapterStamp(3725),'1:02:05');
 assert.equal(headline('eh, ¿cómo editamos vídeo largo rápido sin perder calidad hoy mismo?'),'Cómo editamos vídeo largo rápido sin perder');
 const long=[];for(let i=0;i<12;i++){const start=i*10+(i%4===0&&i?3:0);long.push(seg(start,start+8,[w(`Tema${i}`,start,start+1),w('explicado',start+1.2,start+8)]));}
 const p=project({media:{duration:130},clips:[{start:0,end:130,enabled:true}],transcript:long});
 const {chapters}=chaptersFor(p);
 assert(chapters.length>=3);assert.equal(chapters[0].at,0);
 for(let i=1;i<chapters.length;i++)assert(chapters[i].at-chapters[i-1].at>=10,'at least ten seconds per chapter');
 assert.deepEqual(chaptersFor(project()).chapters,[],'too short for chapters');
 const draft=publishingDraft(p);assert(draft.hashtags.every(h=>/^#\w+$/.test(h)));assert(draft.titles.length>=1);
});

test('the model can only reword the kit; malformed answers keep the rule draft',()=>{
 const draft={engine:'rules',titles:['A'],description:'D',hashtags:['#a'],chapters:[{at:0,title:'x',text:''},{at:20,title:'y',text:''}]};
 const merged=mergeModelKit(draft,{titles:['Un título bastante largo','corto'],description:'Nueva descripción',hashtags:['# edición rápida','#ok!'],chapterTitles:['Inicio','Final']});
 assert.equal(merged.engine,'ollama');assert.deepEqual(merged.titles,['Un título bastante largo']);assert.deepEqual(merged.hashtags,['#ediciónrápida','#ok']);assert.deepEqual(merged.chapters.map(c=>c.title),['Inicio','Final']);
 assert.deepEqual(mergeModelKit(draft,{titles:['Un título bastante largo'],description:'',hashtags:[],chapterTitles:['solo uno']}).chapters.map(c=>c.title),['x','y'],'mismatched chapter count keeps rules');
 assert.throws(()=>mergeModelKit(draft,{titles:[],description:'',hashtags:[],chapterTitles:[]}),/sin títulos/);
});

test('short-form captions group one to five words, and the manifest honours it',()=>{
 const words=[w('uno',0,.2),w('dos',.25,.4),w('tres',.45,.6),w('cuatro',.65,.8)];
 assert.equal(cues(words).length,1);assert.equal(cues(words,1).length,4);assert.equal(cues(words,2).length,2);
 const p={...project(),source:'x.mp4',revision:1};
 assert(opencutManifest(p,{wordsPerCaption:1}).captions.length>opencutManifest(p).captions.length);
});

test('rules set format, caption style and a quoted title verbatim',()=>{
 const p=project({settings:{...defaults,profile:'youtube'}});
 const keys=t=>Object.fromEntries(rulePlan(t,p).changes.map(c=>[c.key,c.value]));
 assert.deepEqual(keys('ponlo en formato vertical'),{profile:'reels'});
 assert.deepEqual(keys('hazlo para tiktok'),{profile:'tiktok'});
 assert.deepEqual(keys('subtítulos estilo viral'),{subtitle:'Viral'});
 assert.deepEqual(keys('pon el título «Cómo editar RÁPIDO»'),{title:'Cómo editar RÁPIDO'});
 const both=rulePlan('pon el titulo "Sube el contraste" y quita los primeros 2 segundos',p);
 assert.deepEqual(both.changes,[{key:'title',value:'Sube el contraste'}],'the quoted text is not read as an instruction');
 assert.equal(both.exact,true);assert.doesNotThrow(()=>applyPlan(p,both));
 assert.match(rulePlan('quita el título',p).explanation,/no tiene título/);
 assert.throws(()=>applyPlan(p,{explanation:'',changes:[{key:'profile',value:'cuadrado'}],remove:[]}),/no admitido/);
});

test('pause tightening, text fixes and replacements are revision-checked and undoable',async()=>{
 const id=randomUUID(),dir=projectDir(id);await fs.mkdir(dir,{recursive:true});
 try{
  await save({...project(),id,revision:1,jobs:[],artifacts:{}});
  const tightened=await tightenPauses(id,1,{maxPause:.6,keep:.3});
  assert.equal(tightened.revision,2);assert.match(tightened.lastInstruction.explanation,/1 pausas largas \(2 s menos\)/);
  await assert.rejects(tightenPauses(id,2,{maxPause:.6,keep:.3}),/No hay pausas/);
  const fixed=await correctSegment(id,2,1,'hoy vemos edición');assert.equal(fixed.transcript[1].text,'hoy vemos edición');
  await assert.rejects(correctSegment(id,2,1,'x'),/cambió/);await assert.rejects(correctSegment(id,3,9,'x'),/no encontrada/);
  const replaced=await replaceText(id,3,'edición','montaje');assert.equal(replaced.transcript[1].text,'hoy vemos montaje');assert.match(replaced.lastInstruction.explanation,/1 aparición/);
  await assert.rejects(replaceText(id,4,'inexistente','x'),/no aparece/);
  const undone=await undoPrompt(id);assert.equal(undone.transcript[1].text,'hoy vemos edición');
  assert.equal((await load(id)).clips.length,tightened.clips.length,'text undo keeps the tightened cuts');
  // Approval changes nothing but the reviewed flag; format changes are validated and undoable.
  const current=await load(id);current.reviewed=false;await save(current);
  await assert.rejects(approveProposal(id,current.revision-1),/cambió/);
  const approved=await approveProposal(id,current.revision);assert.equal(approved.reviewed,true);assert.equal(approved.revision,current.revision);
  await assert.rejects(setOutputFormat(id,approved.revision,'cuadrado'),/no válido/);
  const vertical=await setOutputFormat(id,approved.revision,'tiktok');assert.equal(vertical.settings.profile,'tiktok');assert.equal(vertical.revision,approved.revision+1);
  assert.equal((await undoPrompt(id)).settings.profile,defaults.profile);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('publishing kit: rules without Ollama, model wording when available, cached per revision',async()=>{
 const id=randomUUID(),dir=projectDir(id),originalFetch=globalThis.fetch;await fs.mkdir(dir,{recursive:true});
 const long=[];for(let i=0;i<9;i++){const s=i*12;long.push(seg(s,s+9,[w('Explicamos',s,s+1),w(`montaje${i}`,s+1.2,s+3),w('local.',s+3.2,s+9)]));}
 try{
  const p={...project(),id,revision:1,media:{duration:110},clips:[{id:'0',start:0,end:110,enabled:true}],transcript:long,jobs:[],artifacts:{}};await save(p);
  globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
  const offline=await publishKit(p);assert.equal(offline.engine,'rules');assert.match(offline.note,/Ollama/);assert.match(offline.chapterText,/^0:00 /);
  let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({message:{content:JSON.stringify({titles:['Edición local paso a paso'],description:'Cómo montar en local.',hashtags:['edicion'],chapterTitles:offline.chapters.map((_,i)=>`Parte ${i+1}`)})}})};};
  assert.equal((await publishKit(p)).engine,'rules','cached for the same revision');
  const fresh=await publishKit(p,{fresh:true});assert.equal(fresh.engine,'ollama');assert.equal(calls,1);assert.match(fresh.chapterText,/0:00 Parte 1/);
  await assert.rejects(publishKit({...p,revision:2,transcript:[]}),/transcripción/);
  // Format request through the full preview path picks the exact rules for a quoted title.
  globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
  const preview=await previewInstruction(id,'pon el título «Mi vídeo»',1);assert.equal(preview.engine,'rules');assert.equal(preview.changes[0].after,'Mi vídeo');
 }finally{globalThis.fetch=originalFetch;await fs.rm(dir,{recursive:true,force:true});}
});
