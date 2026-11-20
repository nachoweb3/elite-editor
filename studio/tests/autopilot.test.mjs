import test from 'node:test';
import assert from 'node:assert/strict';
import {protectSpeech} from '../server/autopilot.mjs';
import {validateEvents,sourceToOutput} from '../server/director.mjs';
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
test('automatic output honors explicit canvas orientation and detects rotated phone clips',()=>{
 const horizontal={width:1920,height:1080};
 const vertical={width:1080,height:1920};
 assert.deepEqual(profiles[resolveAutomationProfile(horizontal,'vertical')].slice(0,2),[1080,1920]);
 assert.deepEqual(profiles[resolveAutomationProfile(vertical,'horizontal')].slice(0,2),[1920,1080]);
 assert.equal(resolveAutomationProfile(horizontal),'youtube');
 assert.equal(resolveAutomationProfile(vertical,'auto'),'reels');
 assert.equal(resolveAutomationProfile({...horizontal,rotation:-90},'auto'),'reels');
 assert.equal(resolveAutomationProfile({...vertical,rotation:90},'auto'),'youtube');
 assert.throws(()=>resolveAutomationProfile(horizontal,null),/formato de montaje/);
});
