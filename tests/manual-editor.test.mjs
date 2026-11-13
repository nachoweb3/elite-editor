import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualClips} from '../server/manual-editor.mjs';
const sources=new Map([['a',{name:'A',media:{duration:10}}],['b',{name:'B',media:{duration:5}}]]);
test('manual montage allows reordering, repeating and mixing sources',()=>{const clips=validateManualClips([{id:'1',sourceId:'a',start:7,end:9},{id:'2',sourceId:'b',start:1,end:3},{id:'3',sourceId:'a',start:0,end:2}],sources);assert.deepEqual(clips.map(c=>c.sourceId),['a','b','a']);});
test('manual montage keeps the chosen camera move and defaults to a fixed frame',()=>{const clips=validateManualClips([{id:'1',sourceId:'a',start:0,end:2,motion:'dolly-in'},{id:'2',sourceId:'a',start:2,end:4}],sources);assert.deepEqual(clips.map(c=>c.motion),['dolly-in','none']);});
test('manual montage rejects nonexistent sources and invalid bounds',()=>{for(const c of [{sourceId:'missing',start:0,end:1},{sourceId:'b',start:0,end:6},{sourceId:'a',start:1,end:1},{sourceId:'a',start:0,end:2,transitionIn:'evil'},{sourceId:'a',start:0,end:2,motion:'orbit'}])assert.throws(()=>validateManualClips([c],sources));});
