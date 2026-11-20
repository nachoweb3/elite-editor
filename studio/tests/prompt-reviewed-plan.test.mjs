import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectDir,save,load,defaults} from '../server/core.mjs';
import {previewInstruction,editByPrompt} from '../server/prompt-editor.mjs';
import {updateStickmen} from '../server/stickman.mjs';

test('reviewed prompt applies the exact cached plan; stale tokens never ask the model again',async()=>{
 const id=randomUUID(),dir=projectDir(id),originalFetch=globalThis.fetch,originalNow=Date.now;
 await fs.mkdir(dir,{recursive:true});
 let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({message:{content:JSON.stringify({explanation:'Contraste mejorado',changes:[{key:'contrast',value:'1.15'}],remove:[],unsupported:false})}})};};
 try{
  const p={id,name:'Synthetic plan test',revision:1,settings:{...defaults},clips:[{id:'0',start:0,end:10,enabled:true}],media:{duration:10},jobs:[],artifacts:{},transcript:[]};
  await save(p);
  const preview=await previewInstruction(id,'Sube el contraste',1);
  assert(preview.planId);assert.equal((await load(id)).revision,1);
  await assert.rejects(editByPrompt(id,'Sube el contraste',1,'invalid'),/caducado/);
  await assert.rejects(editByPrompt(id,'Baja el contraste',1,preview.planId),/caducado/);
  const now=Date.now();Date.now=()=>now+300001;
  await assert.rejects(editByPrompt(id,'Sube el contraste',1,preview.planId),/caducado/);
  Date.now=originalNow;
  const result=await editByPrompt(id,'Sube el contraste',1,preview.planId);
  assert.equal(result.settings.contrast,1.15);assert.equal(result.revision,2);assert.equal(calls,1);
  await assert.rejects(editByPrompt(id,'Sube el contraste',1,preview.planId),/cambió/);
  result.stickmen={enabled:true,mode:'overlay',items:[{id:'test'}]};await save(result);
  await assert.rejects(updateStickmen(id,{action:'remove',itemId:'test',revision:1}),/cambió/);
  result.jobs=[{status:'running'}];await save(result);
  await assert.rejects(updateStickmen(id,{action:'remove',itemId:'test',revision:2}),/termine/);
  assert.equal((await load(id)).stickmen.items.length,1);
 }finally{
  globalThis.fetch=originalFetch;Date.now=originalNow;
  await fs.unlink(path.join(dir,'project.json'));await fs.rmdir(dir);
 }
});
