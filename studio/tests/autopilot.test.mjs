import test from 'node:test';
import assert from 'node:assert/strict';
import {protectSpeech} from '../server/autopilot.mjs';
import {applyPlannedTransitions,planLocalTransitions,validateEvents,sourceToOutput} from '../server/director.mjs';
import {automationOptions,resolveAutomationProfile} from '../server/automation-options.mjs';
import {profiles} from '../server/engine.mjs';
test('speech crossing a proposed silence remains in the timeline',()=>{
 const clips=protectSpeech([{start:0,end:2,enabled:true},{start:5,end:8,enabled:true}],[{words:[{start:1.9,end:3.2},{start:4.8,end:5.2}]}],8);
 assert.ok(clips.some(c=>c.start<=1.9&&c.end>=3.2));
 assert.equal(sourceToOutput(3.8,clips),null);
});
test('sin transcripción no se inventan cortes ni se pierde la grabación completa',()=>{
 const clip={id:'0',start:0,end:8,enabled:true,reason:'No se detectó voz clara; se conserva la grabación completa para revisión'};
 assert.deepEqual(protectSpeech([clip],[],8),[clip]);
});
test('director rejects fabricated evidence and unknown assets',()=>{
 const segments=[{start:0,end:10,text:'Ahora cambiamos a la iluminación del estudio.'}];
 const base={at:5,type:'transition',effect:'slide',confidence:.95,reason:'Nuevo tema',evidence:'la iluminación del estudio'};
 assert.equal(validateEvents([base,{...base,evidence:'Esto nunca se dijo'},{...base,type:'meme',resource:'missing'},{...base,at:90}],segments,30,[]).length,1);
 assert.equal(sourceToOutput(8,[{start:2,end:4,enabled:true},{start:7,end:10,enabled:true}]),3);
});

test('automation retries keep valid recipe settings, including independent Pexels and memes',()=>{
 const recipe={targetFormat:'horizontal',subtitles:false,memes:false,broll:true,music:false,beauty:false,subtitle:'Tutorial',subtitlePosition:'top'};
 assert.deepEqual(automationOptions({...recipe,unexpected:{scope:'other'}}),recipe);
 assert.deepEqual(automationOptions({broll:'yes',subtitle:'otro'}),{});
 assert.throws(()=>automationOptions({targetFormat:'4k'}),/formato de montaje/);
});

test('automatic transitions apply only at strong spoken section boundaries and conserve the timeline',()=>{
 const clips=[
  {id:'a',start:0,end:28,enabled:true},
  {id:'b',start:30,end:70,enabled:true},
 ];
 const transcript=[
  {start:7,text:'La pantalla es de color azul.'},
  {start:12,text:'Pasemos a los ajustes del encuadre.'},
  {start:16,text:'Siguiente tema, el foco.'},
  {start:30,text:'Siguiente capítulo, el sonido.'},
  {start:55,text:'Para terminar, vamos a resumir los cambios.'},
 ];
 const proposed=planLocalTransitions(transcript,clips);
 assert.deepEqual(proposed.map(event=>event.effect),['open-horizontal','iris']);
 const existingBoundary={at:30,type:'transition',effect:'wipe-right'};
 const applied=applyPlannedTransitions(clips,[existingBoundary,proposed[1]]);
 assert.deepEqual(applied.clips.map(clip=>[clip.start,clip.end,clip.transitionIn]),[
  [0,28,undefined],[30,55,'wipe-right'],[55,70,'iris'],
 ]);
 assert.deepEqual(applied.events.map(event=>event.outputTime),[28,53]);
 assert.equal(applied.clips.reduce((time,clip)=>time+clip.end-clip.start,0),68);
});
test('automatic output keeps the source canvas unless another orientation is selected',()=>{
 const horizontal={width:1920,height:1080};
 const vertical={width:1080,height:1920};
 assert.deepEqual(profiles[resolveAutomationProfile(horizontal,'vertical')].slice(0,2),[1080,1920]);
 assert.deepEqual(profiles[resolveAutomationProfile(vertical,'horizontal')].slice(0,2),[1920,1080]);
 assert.equal(resolveAutomationProfile(horizontal),'source');
 assert.equal(resolveAutomationProfile(vertical,'auto'),'source');
 assert.throws(()=>resolveAutomationProfile(horizontal,null),/formato de montaje/);
});
