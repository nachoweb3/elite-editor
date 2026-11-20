import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPlan} from '../server/prompt-editor.mjs';
import {defaults} from '../server/core.mjs';
import {projectSource} from '../server/diffusion-bridge.mjs';
const p={name:'Test </scene>',media:{duration:30,width:1920,height:1080},settings:defaults,clips:[{id:'0',start:0,end:30,enabled:true}],transcript:[{start:1,end:2,text:'Hola {mundo}',words:[]}]};
test('prompt plan preserves source timing and splits only requested interval',()=>{
 const out=applyPlan(p,{changes:[{key:'faceSmooth',value:'0.15'}],remove:[{start:10,end:12}],explanation:'Recorte'});
 assert.deepEqual(out.clips.map(c=>[c.start,c.end]),[[0,10],[12,30]]);assert.equal(out.settings.faceSmooth,.15);
});
test('prompt plan cannot introduce code, invalid strengths or remove the full source',()=>{
 for(const changes of [[{key:'command',value:'delete'}],[{key:'faceJaw',value:'2'}],[{key:'faceRetouch',value:'yes'}]])assert.throws(()=>applyPlan(p,{changes,remove:[],explanation:'x'}));
 assert.throws(()=>applyPlan(p,{changes:[],remove:[{start:0,end:30}],explanation:'x'}));
});
test('editable project escapes text and keeps discrete source trims',()=>{
 const source=projectSource(p,'C:\\video.mp4');assert.ok(source.includes('name={"Test </scene>"}'));assert.ok(source.includes('sourceOut={30}'));assert.ok(source.includes('{"Hola {mundo}"}'));
});
