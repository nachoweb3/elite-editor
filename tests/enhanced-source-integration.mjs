import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,defaults,projectDir,save,probe,run,load} from '../server/core.mjs';
import {prepareEnhancedSource} from '../server/enhanced-source.mjs';
const id=randomUUID(),dir=projectDir(id),source=path.join(ROOT,'cache',`enhancement-test-${id}.mp4`);let output,filteredOutput;
await fs.mkdir(dir);
try{
 await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);
 const media=await probe(source);await save({id,name:'Enhanced source test',source,media,settings:{...defaults,faceRetouch:false,cleanAudio:true},revision:1,jobs:[],clips:[{start:0,end:2,enabled:true}],artifacts:{}});
 const artifact=await prepareEnhancedSource(id);output=artifact.file;assert.equal(artifact.media.width,160);assert.equal(artifact.media.height,90);assert(artifact.media.audio);assert(Math.abs(artifact.media.duration-media.duration)<.1);assert.equal(artifact.revision,1);assert.equal((await load(id)).source,source);
 const hashes=await Promise.all([source,output].map(file=>run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-f','framemd5','-'])));const frames=s=>s.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());assert.deepEqual(frames(hashes[0].out),frames(hashes[1].out),'Video pixels and frame count must be unchanged when only cleaning voice');
 const audio=await run('ffmpeg',['-hide_banner','-i',output,'-vn','-af','volumedetect','-f','null','-']);assert.match(audio.err,/mean_volume: -[0-9.]+ dB/);
 const before=(await fs.stat(output)).mtimeMs;const cached=await prepareEnhancedSource(id);assert.equal(cached.key,artifact.key);assert.equal((await fs.stat(output)).mtimeMs,before);
 const changed=await load(id);changed.settings={...changed.settings,videoDenoise:.4,videoSharpen:.3,audioNoiseReduction:20,audioHighpass:100,audioNormalize:false};changed.revision++;await save(changed);
 const filtered=await prepareEnhancedSource(id);filteredOutput=filtered.file;assert.notEqual(filtered.key,artifact.key);assert.equal(filtered.media.width,160);assert.equal(filtered.media.height,90);assert(Math.abs(filtered.media.duration-media.duration)<.1);
 const filteredHash=await run('ffmpeg',['-v','error','-i',filteredOutput,'-map','0:v:0','-f','framemd5','-']);assert.notDeepEqual(frames(filteredHash.out),frames(hashes[0].out));assert.equal((await load(id)).source,source);
 console.log('PASS actual FFmpeg: duration, dimensions, clean voice, manual denoise/sharpen, settings invalidate cache, original preserved. Facial retouch disabled in this synthetic test.');
}finally{for(const file of [source,output,filteredOutput,path.join(dir,'project.json')].filter(Boolean))await fs.unlink(file).catch(()=>{});await fs.rmdir(dir);}
