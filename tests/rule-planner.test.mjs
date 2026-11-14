import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {rulePlan,normalize} from '../server/rule-planner.mjs';
import {applyPlan,previewInstruction,enhanceInstruction} from '../server/prompt-editor.mjs';
import {defaults,projectDir,save} from '../server/core.mjs';

const project=(duration=180,settings={})=>({id:'00000000-0000-0000-0000-000000000000',name:'Synthetic',media:{duration},settings:{...defaults,...settings},clips:[{id:'0',start:0,end:duration,enabled:true}]});
const keys=plan=>Object.fromEntries(plan.changes.map(c=>[c.key,c.value]));

test('cuts need explicit numbers and accept Spanish, English, ranges and mm:ss',()=>{
 const p=project();
 assert.deepEqual(rulePlan('Elimina los primeros 5 segundos',p).remove,[{start:0,end:5}]);
 assert.deepEqual(rulePlan('quita los 10 últimos segundos',p).remove,[{start:170,end:180}]);
 assert.deepEqual(rulePlan('recorta del segundo 10 al 20',p).remove,[{start:10,end:20}]);
 assert.deepEqual(rulePlan('corta entre el minuto 1 y el 2',p).remove,[{start:60,end:120}]);
 assert.deepEqual(rulePlan('borra de 1:05 a 1:30',p).remove,[{start:65,end:90}]);
 assert.deepEqual(rulePlan('quita todo a partir del minuto 2',p).remove,[{start:120,end:180}]);
 assert.deepEqual(rulePlan('remove the first three seconds',p).remove,[{start:0,end:3}]);
 assert.deepEqual(rulePlan('quita un minuto y medio del principio: los primeros 1.5 minutos',p).remove,[{start:0,end:90}]);
 // No number, no cut: the interpreter never invents a time.
 assert.equal(rulePlan('elimina los primeros segundos',p).unsupported,true);
});

test('cuts outside the recording are clamped or rejected, never passed through',()=>{
 const p=project(30);
 assert.deepEqual(rulePlan('quita del segundo 20 al 50',p).remove,[{start:20,end:30}]);
 const outside=rulePlan('quita del segundo 40 al 50',p);
 assert.equal(outside.unsupported,true);assert.match(outside.explanation,/fuera del vídeo/);
});

test('settings move by bounded steps, respect intensity and stay inside validated ranges',()=>{
 const p=project();
 assert.deepEqual(keys(rulePlan('sube un poco el contraste y baja la música',p)),{contrast:'1.06',musicVolume:'0.05'});
 assert.deepEqual(keys(rulePlan('sube mucho el contraste',p)),{contrast:'1.24'});
 assert.deepEqual(keys(rulePlan('ponlo en blanco y negro',p)),{saturation:'0'});
 assert.deepEqual(keys(rulePlan('zoom al 110%',p)),{zoom:'1.1'});
 assert.deepEqual(keys(rulePlan('sin música',p)),{musicVolume:'0'});
 assert.deepEqual(keys(rulePlan('aclara la imagen, está muy oscuro',p)),{exposure:'0.05'});
 assert.deepEqual(keys(rulePlan('make it darker',p)),{exposure:'-0.05'});
 const capped=rulePlan('contraste al 300%',p);assert.equal(keys(capped).contrast,'1.4');
 // Already at the limit: nothing to change is reported, not silently "applied".
 assert.equal(rulePlan('sube el contraste',project(180,{contrast:1.4})).unsupported,true);
});

test('corrective controls read the problem word, not the verb',()=>{
 const p=project();
 assert.deepEqual(keys(rulePlan('quita las ojeras',p)),{faceUnderEyes:'0.32'});
 assert.deepEqual(keys(rulePlan('menos grano',p)),{videoDenoise:'0.25'});
 assert.deepEqual(keys(rulePlan('menos reducción de ruido de vídeo',project(180,{videoDenoise:.5}))),{videoDenoise:'0.25'});
 assert.deepEqual(keys(rulePlan('ilumina mi cara y quita las ojeras',p)),{faceLight:'0.27',faceUnderEyes:'0.32'});
 assert.deepEqual(keys(rulePlan('quita el retoque',p)),{faceRetouch:'false'});
 assert.equal(keys(rulePlan('quita el ruido de fondo',project(180,{cleanAudio:false}))).cleanAudio,'true');
});

test('subtitle toggles and positions, and recipes for vague requests',()=>{
 const p=project();
 assert.deepEqual(keys(rulePlan('quita los subtítulos',p)),{subtitles:'false'});
 assert.deepEqual(keys(rulePlan('subtítulos arriba',p)),{subtitlePosition:'top'});
 assert.deepEqual(keys(rulePlan('pon los subtitulos, no muy grandes',project(180,{subtitles:false}))),{subtitles:'true'});
 assert.deepEqual(keys(rulePlan('hazlo más dinámico',p)),{contrast:'1.08',saturation:'1.12',zoom:'1.03'});
 assert.equal(rulePlan('qué tiempo hace hoy',p).unsupported,true);
});

test('every rule plan passes the same validation as a model plan',()=>{
 const p=project(120);
 for(const prompt of ['quita los primeros 5 segundos y sube el contraste','agranda los ojos un poco','piel más cálida','más nitidez y menos grano','quita los graves','quita el zumbido de la voz','hazlo cinematográfico']){
  const plan=rulePlan(prompt,p);assert.equal(plan.unsupported,false,prompt);
  assert.doesNotThrow(()=>applyPlan(p,plan),prompt);
 }
 assert.equal(normalize('Quítame 2,5 segundos'),'quitame 2.5 segundos');
});

test('explicit cuts use exact rules; the model is asked otherwise and rules cover its failures',async()=>{
 const id=randomUUID(),dir=projectDir(id),originalFetch=globalThis.fetch;
 await fs.mkdir(dir,{recursive:true});
 let calls=0,reply=null;
 globalThis.fetch=async()=>{calls++;if(!reply)throw new TypeError('fetch failed');return {ok:true,status:200,json:async()=>({message:{content:JSON.stringify(reply)}})};};
 try{
  await save({...project(60),id,revision:1,jobs:[],artifacts:{},transcript:[]});
  const cut=await previewInstruction(id,'quita los primeros 5 segundos y sube el contraste',1);
  assert.equal(cut.engine,'rules');assert.equal(calls,0,'no model round trip for an exact cut');
  assert.equal(cut.cuts.seconds,5);assert.equal(cut.changes[0].key,'contrast');
  // Ollama down: settings still work through the rules, and the reason is visible.
  const offline=await previewInstruction(id,'sube el contraste',1);
  assert.equal(offline.engine,'rules');assert.match(offline.fallbackReason,/Ollama/);assert.equal(calls,1);
  // The model answers with an impossible interval: the rules take over instead of failing.
  reply={explanation:'x',unsupported:false,changes:[],remove:[{start:0,end:0}]};
  const invalid=await previewInstruction(id,'baja un poco la música',1);
  assert.equal(invalid.engine,'rules');assert.match(invalid.fallbackReason,/no válido/);
  reply={explanation:'Más color',unsupported:false,changes:[{key:'saturation',value:'1.2'}],remove:[]};
  const model=await previewInstruction(id,'dale más color',1);
  assert.equal(model.engine,'ollama');assert.equal(model.changes[0].after,1.2);
  globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
  const enhanced=await enhanceInstruction(id,'sube el contraste',1);
  assert.equal(enhanced.instruction,'sube el contraste');assert.equal(enhanced.engine,'rules');assert.match(enhanced.notes,/contraste/);
  await assert.rejects(previewInstruction(id,'escribe un poema',1),/Ollama.*No he reconocido/);
 }finally{globalThis.fetch=originalFetch;await fs.rm(dir,{recursive:true,force:true});}
});
