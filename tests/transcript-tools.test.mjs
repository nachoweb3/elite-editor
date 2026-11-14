import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {findFillers,activeFillers,transcriptView,restoreRange,montageWords,vtt,plainText} from '../server/transcript-tools.mjs';
import {projectDir,save,load,defaults,ROOT,resolveAssetFile,storedAssetFile} from '../server/core.mjs';
import {removeFillers,restoreTranscript,cutRanges,undoPrompt} from '../server/prompt-editor.mjs';

const w=(word,start,end,extra={})=>({word,start,end,...extra});
const transcript=[
 {start:0,end:4,text:'Hola eh bienvenidos que que tal',words:[w(' Hola',0,.5),w(' eh',.7,1),w(' bienvenidos',1.1,1.9),w(' que',2,2.2),w(' que',2.3,2.5),w(' tal',2.6,3)]},
 {start:5,end:8,text:'Esto es un ejemplo, mmm, claro',words:[w(' Esto',5,5.3),w(' es',5.35,5.5),w(' un',5.55,5.7),w(' ejemplo,',5.75,6.3),w(' mmm,',6.5,7),w(' claro',7.1,7.6)]},
];

test('fillers and immediate repeats are found with padding that never eats neighbours',()=>{
 const items=findFillers(transcript);
 assert.deepEqual(items.map(i=>[i.word.trim(),i.kind]),[['eh','filler'],['que','repeat'],['mmm,','filler']]);
 const eh=items[0];assert(eh.start>=.5&&eh.end<=1.1,'stays between Hola and bienvenidos');
 const repeat=items[1];assert(repeat.start>=1.9&&repeat.end<=2.3,'removes the first take only');
 // Ambiguous words are not fillers unless the user lists them; multi-word phrases are supported.
 assert.equal(findFillers([{words:[w('este',0,.3),w('vídeo',.4,.8)]}]).length,0);
 assert.equal(findFillers([{words:[w('o',0,.1),w('sea',.15,.3),w('vale',.4,.8)]}],{extra:['o sea']}).length,1);
 // Restarted phrases keep only the second take.
 const restarted=findFillers([{words:[w('hoy',0,.2),w('vamos',.3,.5),w('a',.55,.6),w('vamos',.7,.9),w('a',.95,1),w('probar',1.1,1.5)]}]);
 assert.deepEqual(restarted.map(i=>[i.word.trim(),i.kind]),[['vamos a','repeat']]);
 assert(restarted[0].start>=.2&&restarted[0].end<=.7,'cuts between "hoy" and the second "vamos"');
 // Estimated timings (from manual text edits) are never used to cut.
 assert.equal(findFillers([{words:[w('eh',0,.5,{estimated:true})]}]).length,0);
});

test('already-removed fillers are not proposed again and the view marks removed phrases',()=>{
 const p={id:'x',media:{duration:8},transcript,clips:[{start:0,end:4,enabled:true}]};
 assert.deepEqual(activeFillers(p).map(i=>i.word.trim()),['eh','que']);
 assert.deepEqual(transcriptView(p).segments.map(s=>s.state),['kept','removed']);
});

test('restoring a phrase fills only the gap and keeps unrelated clips',()=>{
 const p={id:'x',media:{duration:10},clips:[{id:'0',start:0,end:2,enabled:true,reason:'A'},{id:'1',start:6,end:10,enabled:true,reason:'B'}]};
 const clips=restoreRange(p,1,7);
 assert.deepEqual(clips.map(c=>[c.start,c.end,c.reason]),[[0,2,'A'],[2,6,'Recuperado desde la transcripción'],[6,10,'B']]);
 assert.equal(restoreRange(p,0,2),null);
 assert.throws(()=>restoreRange({...p,manual:true},1,3),/montaje manual/);
 assert.throws(()=>restoreRange(p,5,20),/fuera/);
});

test('montage subtitles follow the cut, in SRT order, VTT and plain text',async()=>{
 const p={id:'x',transcript,clips:[{start:5,end:8,enabled:true},{start:0,end:1,enabled:true}]};
 const words=await montageWords(p,async()=>null);
 assert.equal(words[0].word.trim(),'Esto');assert(words[0].start<.01);
 const hola=words.find(x=>x.word.trim()==='Hola');assert(Math.abs(hola.start-3)<.01,'second clip starts after the 3 s first clip');
 const text=vtt(words);assert.match(text,/^WEBVTT\n\n1\n00:00:00\.000 --> /);
 assert.match(plainText(words),/^Esto es un ejemplo, mmm, claro Hola eh\n$/);
});

test('removing fillers, restoring and undo are revision-checked and reversible',async()=>{
 const id=randomUUID(),dir=projectDir(id);await fs.mkdir(dir,{recursive:true});
 try{
  await save({id,name:'Fillers',media:{duration:8},settings:{...defaults},clips:[{id:'0',start:0,end:8,enabled:true}],transcript,revision:1,jobs:[],artifacts:{}});
  await assert.rejects(removeFillers(id,0),/cambió/);
  const cleaned=await removeFillers(id,1);
  assert.equal(cleaned.revision,2);assert.match(cleaned.lastInstruction.explanation,/3 muletillas/);
  const kept=cleaned.clips.reduce((a,c)=>a+c.end-c.start,0);assert(kept<8&&kept>6.5,'removes a little more than one second');
  await assert.rejects(removeFillers(id,2),/No quedan/);
  const restored=await restoreTranscript(id,0,8,2);assert(Math.abs(restored.clips.reduce((a,c)=>a+c.end-c.start,0)-8)<1e-6);
  const undone=await undoPrompt(id);assert.equal(undone.clips.length,cleaned.clips.length);
  await assert.rejects(cutRanges(id,[],undone.revision),/intervalos/);
  const busy=await load(id);busy.jobs=[{id:'j',status:'running'}];await save(busy);
  await assert.rejects(cutRanges(id,[{start:0,end:1}],busy.revision),/termine/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('asset paths are stored relative to the checkout and re-anchored after a move',()=>{
 const inside=path.join(ROOT,'resources','pack','a.wav');
 assert.equal(storedAssetFile(inside),'resources/pack/a.wav');
 assert.equal(resolveAssetFile('resources/pack/a.wav'),inside);
 assert.equal(storedAssetFile('D:/elsewhere/a.wav'),'D:/elsewhere/a.wav');
 const bundled=fs.readdir(path.join(ROOT,'resources')).then(()=>true,()=>false);
 return bundled.then(async ok=>{if(!ok)return;const moved='C:/old/place/Elite-Editor-public/resources/kenney-interface-sounds/LICENSE.txt';assert.equal(resolveAssetFile(moved),path.join(ROOT,'resources/kenney-interface-sounds/LICENSE.txt'));});
});
