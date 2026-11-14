import test from 'node:test';
import assert from 'node:assert/strict';
import {run,jobContext,Cancelled} from '../server/core.mjs';
import {progressTracker,liveProgress} from '../server/jobs.mjs';

const slow=['-e','setTimeout(()=>{},20000)'];

test('a job signal stops the running process and every later process of the job',async()=>{
 const controller=new AbortController(),started=Date.now();
 await jobContext.run({signal:controller.signal},async()=>{
  setTimeout(()=>controller.abort(),150);
  await assert.rejects(run(process.execPath,slow),e=>e instanceof Cancelled);
  // Once cancelled, the job cannot start new work.
  await assert.rejects(run(process.execPath,['-e','0']),e=>e instanceof Cancelled);
 });
 assert(Date.now()-started<10000,'the child is killed, not awaited');
});

test('processes outside a job and explicit null signals are unaffected',async()=>{
 const controller=new AbortController();controller.abort();
 await jobContext.run({signal:controller.signal},async()=>{
  const {out}=await run(process.execPath,['-e','process.stdout.write("ok")'],{signal:null});
  assert.equal(out,'ok');
 });
 assert.equal((await run(process.execPath,['-e','process.stdout.write("free")'])).out,'free');
});

test('progress follows fragments, FFmpeg time and transcription, and never goes backwards',()=>{
 const track=progressTracker('p-test',{source:100,montage:30,parts:[10,20]}),now=()=>liveProgress.get('p-test');
 track('Renderizando calidad final: fragmento 1/2');assert.equal(now().fraction,0);
 track('frame=1 time=00:00:05.00 bitrate');assert.equal(now().fraction,.25);
 track('frame=1 time=00:00:02.00 bitrate');assert.equal(now().fraction,.25,'monotonic');
 track('Renderizando calidad final: fragmento 2/2');assert.equal(now().fraction,.5);
 track('time=00:00:10.00');assert.equal(now().fraction,.75);
 track('Componiendo subtítulos, marca y mezcla de audio');assert.equal(now().fraction,null);
 track('size= time=00:00:15.00');assert.equal(now().fraction,.5,'compose is measured against the 30 s montage');
 track('Transcripción local por palabra');track('Transcrito 40.0s');assert.equal(now().fraction,.4);
 track('Retocando rostro: seguimiento');assert.equal(now().fraction,null,'unknown stages are indeterminate');
 liveProgress.delete('p-test');
});

test('timeouts still reject with a clear message',async()=>{
 await assert.rejects(run(process.execPath,slow,{timeout:200}),/Tiempo máximo/);
});
