import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../server/core.mjs';
import {projectSource} from '../server/diffusion-bridge.mjs';
import {parseComposition,syncPlan} from '../server/diffusion-sync.mjs';
import {remapWords} from '../server/subtitles.mjs';
const p={name:'Test',media:{duration:10,width:1920,height:1080},settings:defaults,clips:[{id:'0',start:0,end:10,enabled:true}],transcript:[{start:1,end:2,text:'Hola mundo',words:[{start:1,end:1.5,word:'Hola'},{start:1.5,end:2,word:'mundo'}]}]};
const original=projectSource(p,'C:/source.mp4');
test('imports a shortened source clip and edited caption without running code',()=>{
 const edited=original.replace('sourceOut={10}','sourceOut={8}').replace('end={10} sourceIn','end={8} sourceIn').replace('Hola mundo','Hola Nacho');
 const plan=syncPlan(p,original,edited);assert.equal(plan.clips[0].end,8);assert.equal(remapWords(plan.transcript,plan.clips).map(w=>w.word).join(' '),'Hola Nacho');
});
test('rejects dynamic expressions and executable statements',()=>{
 assert.throws(()=>parseComposition(original.replace('sourceIn={0}','sourceIn={process.exit()}')),/dinámica/);
 assert.throws(()=>parseComposition('globalThis.bad=true;'+original),/estática/);
 assert.throws(()=>parseComposition(original.replace('return <stage','console.log(1); return <stage')),/Estructura/);
});
test('rejects style changes, deleted brand, timeline gaps and replaced sources',()=>{
 for(const edited of [original.replace('fill="#FFFFFF"','fill="#00FF00"'),original.replace(/<text id="brand"[\s\S]*?<\/text>/,''),original.replace('start={0} end={10} sourceIn','start={1} end={11} sourceIn'),original.replace('C:/source.mp4','C:/other.mp4')])assert.throws(()=>syncPlan(p,original,edited));
});
test('supports a split clip with a new id, preserving its original source offsets',()=>{
 const start=original.indexOf('<video'),end=original.indexOf('/>',start)+2,clip=original.slice(start,end);
 const a=clip.replace('end={10}','end={5}').replace('sourceOut={10}','sourceOut={5}');
 const b=clip.replace('id="clip-0"','id="split-new-id"').replace('start={0}','start={5}').replace('sourceIn={0}','sourceIn={5}');
 const plan=syncPlan(p,original,original.slice(0,start)+a+b+original.slice(end));assert.deepEqual(plan.clips.map(c=>[c.start,c.end]),[[0,5],[5,10]]);
});
