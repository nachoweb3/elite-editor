import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCutPlan} from '../server/engine.mjs';
import {clipsFromV1} from '../server/editor-bridge.mjs';
import {MIN_KEPT_FRAGMENT} from '../server/core.mjs';

const base={duration:10,hasAudio:true,transcriptionComplete:true,padding:.18};
const total=clips=>clips.reduce((sum,clip)=>sum+clip.end-clip.start,0);

test('sin voz se conserva la grabación completa aunque Auto-Editor proponga cortes',()=>{
 const plan=resolveCutPlan({...base,silences:[{start:2,end:4},{start:6,end:7.5}],autoClips:[{start:0,end:2},{start:5,end:8}],transcript:[]});
 assert.equal(plan.fullRecording,true);
 assert.equal(plan.engine,'ffmpeg');
 assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[0,10]]);
 assert.equal(total(plan.clips),10);
});

test('una transcripción incompleta tampoco recorta música o ambiente',()=>{
 const plan=resolveCutPlan({...base,transcriptionComplete:false,silences:[{start:0,end:4}],autoClips:[{start:0,end:4}],transcript:[]});
 assert.equal(plan.fullRecording,true);
 assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[0,10]]);
});

test('Auto-Editor sin cortes útiles cae al detector de silencios sin residuales',()=>{
 const plan=resolveCutPlan({...base,silences:[{start:0,end:2},{start:8,end:10}],autoClips:[{start:0,end:10}],transcript:[{start:1,end:9,text:'voz'}]});
 assert.equal(plan.fallback,true);
 assert.equal(plan.engine,'ffmpeg');
 assert.equal(plan.clips.length,1);
 assert.ok(Math.abs(plan.clips[0].start-1.82)<1e-9);
 assert.ok(Math.abs(plan.clips[0].end-8.18)<1e-9);
 for(const clip of plan.clips)assert.ok(clip.end-clip.start>=MIN_KEPT_FRAGMENT);
});

test('Auto-Editor sin propuesta no deja la línea de tiempo vacía',()=>{
 const plan=resolveCutPlan({...base,silences:[],autoClips:[],transcript:[{start:0,end:10,text:'voz'}]});
 assert.equal(plan.engine,'ffmpeg');
 assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[0,10]]);
});

test('Auto-Editor con cortes útiles se usa y no produce fragmentos residuales',()=>{
 const plan=resolveCutPlan({...base,silences:[],autoClips:[{start:1,end:4},{start:6,end:9}],transcript:[{start:1,end:9,text:'voz'}]});
 assert.equal(plan.engine,'auto-editor');
 assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[1,4],[6,9]]);
});

test('un plan de Auto-Editor con un fragmento residual no lo deja pasar',()=>{
 const plan=resolveCutPlan({...base,silences:[],autoClips:[{start:0,end:9.8},{start:9.9,end:10}],transcript:[{start:0,end:9.8,text:'voz'}]});
 assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[0,10]]);
 for(const clip of plan.clips)assert.ok(clip.end-clip.start>=MIN_KEPT_FRAGMENT);
});

test('el puente de Auto-Editor descarta chunks por debajo del mínimo',()=>{
 assert.deepEqual(clipsFromV1({timebase:'30/1',chunks:[[0,6,1],[6,300,0]]},10),[]);
});
