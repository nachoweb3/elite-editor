import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../server/core.mjs';
import {generationPayload,generationSettings,submitGeneration,refreshGeneration} from '../server/generative.mjs';
test('provider catalog adapter validates inputs and uses supported dimensions',()=>{const p=generationPayload({model:'flux-schnell',prompt:'A landscape',ratio:'16:9'});assert.equal(p.model.endpoint,'flux-schnell-image');assert.equal(p.payload.width,1024);assert.equal(p.payload.height,576);assert.equal(p.payload.num_images,1);assert.throws(()=>generationPayload({model:'unknown',prompt:'Hi',ratio:'16:9'}));assert.throws(()=>generationPayload({model:'flux-schnell',prompt:'Hi',ratio:'free'}));assert.equal(generationPayload({model:'wan2.2-text-to-video',prompt:'Scene',ratio:'9:16'}).payload.duration,5);});
test('submission and resumed polling persist jobs without leaking credentials or retrying uncertain charges',async()=>{
 const originalFetch=globalThis.fetch,originalKey=process.env.MUAPI_API_KEY;process.env.MUAPI_API_KEY='test-never-sent-key';const ids=[];let calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{request_id:'provider-job'}:{status:'completed',outputs:['https://example.com/result.mp4']}};};
 try{assert.equal((await generationSettings()).configured,true);const job=await submitGeneration({model:'wan2.2-text-to-video',prompt:'Test scene',ratio:'16:9'});ids.push(job.id);assert.equal(job.status,'pending');assert(!JSON.stringify(job).includes('test-never-sent-key'));assert.equal(calls[0].options.headers['x-api-key'],'test-never-sent-key');const complete=await refreshGeneration(job.id);assert.equal(complete.status,'completed');assert.equal(complete.url,'https://example.com/result.mp4');assert(calls[1].url.endsWith('/predictions/provider-job/result'));await refreshGeneration(job.id);assert.equal(calls.length,2);
 globalThis.fetch=async()=>{throw Error('network timeout')};const uncertain=await submitGeneration({model:'flux-schnell',prompt:'Test image',ratio:'16:9'});ids.push(uncertain.id);assert.equal(uncertain.status,'unknown');assert.equal((await refreshGeneration(uncertain.id)).status,'unknown');
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.MUAPI_API_KEY;else process.env.MUAPI_API_KEY=originalKey;for(const id of ids)await fs.unlink(path.join(ROOT,'projects/generations',id+'.json'));}
});
