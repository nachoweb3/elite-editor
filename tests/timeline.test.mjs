import test from 'node:test';
import assert from 'node:assert/strict';
import {removedRanges,restoreRange,sourceAtMontage,montageAtSource} from '../web/src/timeline.ts';
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
