import test from 'node:test';
import assert from 'node:assert/strict';
import {clipsFromV1,toV1} from '../server/editor-bridge.mjs';
test('puente Auto-Editor conserva cortes y huecos a 30 fps',()=>{const p={source:'source.mp4',media:{duration:10},clips:[{start:1,end:3,enabled:true},{start:4,end:6,enabled:false},{start:7,end:9,enabled:true}]};const v1=toV1(p);assert.deepEqual(v1.chunks,[[0,30,0],[30,90,1],[90,210,0],[210,270,1],[270,300,0]]);assert.deepEqual(clipsFromV1(v1,10).map(c=>[c.start,c.end]),[[1,3],[7,9]]);});
