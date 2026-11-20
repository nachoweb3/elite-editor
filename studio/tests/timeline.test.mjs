import test from 'node:test';
import assert from 'node:assert/strict';
import {removedRanges,restoreRange,sourceAtMontage,montageAtSource} from '../web/src/timeline.ts';
import {indexMontageTranscript,montageChapters,chapterText} from '../web/src/transcript-index.ts';
const clip=(id,start,end,sourceId='original',enabled=true)=>({id,start,end,sourceId,enabled});
test('review detects only missing original intervals despite reordered, duplicate and foreign clips',()=>{
 assert.deepEqual(removedRanges([clip('b',7,9),clip('a',1,4),clip('copy',2,5),clip('foreign',0,10,'other'),clip('disabled',5,7,'original',false)],'original',10),[{start:0,end:1},{start:5,end:7},{start:9,end:10}]);
});
test('restoring a range does not duplicate material and preserves unrelated montage order',()=>{
 const clips=[clip('foreign',0,3,'other'),clip('a',0,4),clip('b',7,10)];
 const restored=restoreRange(clips,'original',10,{start:3,end:8},r=>clip('restored',r.start,r.end));
 assert.deepEqual(restored,[clips[0],clips[1],clip('restored',4,7),clips[2]]);
 assert.deepEqual(restoreRange(restored,'original',10,{start:3,end:8},()=>{throw Error('Already restored');}),restored);
});
test('monitor maps source and montage time across removed pauses and multiple sources',()=>{
 const clips=[clip('a',10,15),clip('b',40,45),clip('c',0,2,'other')];
 assert.deepEqual(sourceAtMontage(clips,6),{sourceId:'original',time:41});
 assert.equal(montageAtSource(clips,'original',42),7);
 assert.equal(montageAtSource(clips,'original',20),5);
 assert.deepEqual(sourceAtMontage(clips,11),{sourceId:'other',time:1});
 assert.equal(sourceAtMontage([],0),null);
});
test('montage transcript ignores trimmed words and follows reordered clips from multiple sources',()=>{
 const montage=[clip('m',2,6,'other'),clip('n',11,15),clip('disabled',2,5,'original',false)];
 const transcript=new Map([
  ['original',[
   {start:2,end:4,text:'Quitado',words:[]},
   {start:10,end:14,text:'Sobra Qué edición',words:[{start:10,end:11,word:'Sobra'},{start:12,end:13,word:'Qué'},{start:13,end:14,word:'edición'}]}
  ]],
  ['other',[{start:3,end:5,text:'Otra grabación',words:[]}]]
 ]);
 const hits=indexMontageTranscript(montage,transcript,'original');
 assert.deepEqual(hits.map(({time,text,searchable})=>({time,text,searchable})),[
  {time:1,text:'Otra grabación',searchable:'otra grabacion'},
  {time:5,text:'Qué edición',searchable:'que edicion'}
 ]);
});
test('chapter timestamps start at zero and use playback time, with no chapter in the closing seconds',()=>{
 const chapters=montageChapters([{id:'a',time:11,text:'El comienzo'},{id:'b',time:76.3,text:'Parte siguiente'},{id:'c',time:158,text:'Cierre'}],165);
 assert.equal(chapterText(chapters),'00:00 Inicio\n01:16 Parte siguiente');
 assert.equal(chapterText([{time:3661.9,title:'Una hora más tarde'}]),'1:01:01 Una hora más tarde');
});
