import test from 'node:test';
import assert from 'node:assert/strict';
import {protectSpeech} from '../server/autopilot.mjs';
import {validateEvents,sourceToOutput} from '../server/director.mjs';
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

test('subtitle and meme options configure automatic editing',()=>{
 const withoutSubtitles={subtitles:false,memes:false};
 assert.equal(withoutSubtitles.subtitles,false);
 assert.equal(withoutSubtitles.memes,false);
});
