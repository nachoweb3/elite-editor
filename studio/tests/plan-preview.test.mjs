import test from 'node:test';
import assert from 'node:assert/strict';
import {describeChanges,describeCuts,flagUnrequested,unrequested,enhancedInstruction} from '../server/prompt-editor.mjs';
import {validateSettings} from '../server/core.mjs';
test('plan preview lists only the settings that actually change',()=>{
  const p={settings:{contrast:1}};
  const next={settings:{...validateSettings({}),contrast:1.15}};
  assert.deepEqual(describeChanges(p,next),[ {key:'contrast',label:'Contraste',before:1,after:1.15} ]);
});
test('plan preview flags adjustments the instruction never mentioned',()=>{
  const changes=[{key:'exposure',label:'Exposición',before:0,after:0.05},{key:'cleanAudio',label:'Limpiar audio',before:true,after:false},{key:'musicVolume',label:'Volumen de música',before:0.08,after:0.15}];
  const flagged=flagUnrequested(changes,'Ilumina un poco mi cara');
  assert.deepEqual(flagged.map(c=>c.extra),[false,true,true]);
  assert.equal(unrequested('Hazlo más dinámico','contrast'),false);
  assert.equal(unrequested('Hazlo más dinámico','cleanAudio'),true);
  assert.equal(unrequested('quita el primer segundo','cuts'),false);
  assert.equal(unrequested('sube el contraste','cuts'),true);
});
test('an echo from the model keeps the original instruction instead of the notes',()=>{
  const echoed=enhancedInstruction('Sube el contraste','Sube el  contraste.','Se asume que ya hay luz natural.');
  assert.equal(echoed.instruction,'Sube el contraste');
  assert.equal(echoed.notes,'Se asume que ya hay luz natural.');
  assert.equal(enhancedInstruction('Sube el contraste','','La instrucción ya estaba clara.').instruction,'Sube el contraste');
  const better=enhancedInstruction('sube contraste','Sube el contraste un 10 % y mantén el color.','');
  assert.equal(better.instruction,'Sube el contraste un 10 % y mantén el color.');
});
test('plan preview adds up the removed seconds without counting splits as cuts',()=>{
  const p={clips:[{start:0,end:10,enabled:true}]};
  assert.deepEqual(describeCuts(p,{clips:[{start:1,end:10,enabled:true}]},{remove:[{start:0,end:1}]}),{seconds:1,pieces:1});
  assert.deepEqual(describeCuts(p,{clips:[{start:0,end:4,enabled:true},{start:4,end:10,enabled:true}]},{remove:[]}),{seconds:0,pieces:0});
});
