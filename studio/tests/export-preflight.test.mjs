import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportPreflight} from '../server/preflight.mjs';
import {nvenc,resolveRenderEncoder} from '../server/engine.mjs';
import {artifactDownloadName,attachmentHeader} from '../server/export-filename.mjs';

test('forced CPU skips probing; automatic chooses available hardware and forced NVENC requires it',async()=>{
  assert.equal(await resolveRenderEncoder('cpu',()=>assert.fail('CPU must not probe NVENC')),'CPU');
  assert.equal(await resolveRenderEncoder('auto',async()=>true),'NVENC');
  assert.equal(await resolveRenderEncoder('auto',async()=>false),'CPU');
  assert.equal(await resolveRenderEncoder('nvenc',async()=>true),'NVENC');
  assert.equal(await resolveRenderEncoder('nvenc',async()=>false),null);
});

test('preflight estimates based on output load and measures only a compatible real MP4',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'elite-preflight-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const source=path.join(directory,'source.mp4');
  await fs.writeFile(source,Buffer.alloc(1_250_000));
  const project={
    name:'Prueba de cámara (ñ).MOV',revision:3,source,media:{width:3840,height:2160},
    settings:{profile:'youtube',encoder:'cpu'},clips:[{enabled:true,start:0,end:60}],
  };
  const report=await exportPreflight(project);
  assert.equal(report.ok,true);
  assert.equal(report.revision,3);
  assert.equal(report.name,'Prueba de cámara (ñ)-final.mp4');
  assert.equal(report.encoder,'CPU');
  assert.equal(report.fps,30);
  assert.equal(report.duration,60);
  assert.equal(report.measuredSizeMB,null);
  assert.ok(report.sizeRangeMB[0]<=14.8&&14.8<=report.sizeRangeMB[1]);
  const fourK=await exportPreflight({...project,settings:{...project.settings,profile:'youtube4k'}});
  assert.equal(fourK.ok,true);
  assert.ok(fourK.timeRangeSeconds[0]>report.timeRangeSeconds[0]);
  assert.ok(fourK.timeRangeSeconds[1]>report.timeRangeSeconds[1]);
  assert.ok(fourK.sizeRangeMB[1]>report.sizeRangeMB[1]);
  const artifact={file:source,revision:3,width:1920,height:1080,duration:60,encoder:'CPU',quality:'high',fps:30};
  assert.equal((await exportPreflight({...project,artifacts:{export:artifact}})).measuredSizeMB,1.25);
  const small=path.join(directory,'small-final.mp4');
  await fs.writeFile(small,Buffer.alloc(42_238));
  assert.equal((await exportPreflight({...project,artifacts:{export:{...artifact,file:small}}})).measuredSizeMB,0.042238);
  assert.equal((await exportPreflight({...project,revision:4,artifacts:{export:artifact}})).measuredSizeMB,null);
  assert.equal((await exportPreflight({...project,artifacts:{export:{...artifact,encoder:'NVENC'}}})).measuredSizeMB,null);
  const forceNvenc=await exportPreflight({...project,settings:{...project.settings,encoder:'nvenc'}});
  const available=await nvenc();
  assert.equal(forceNvenc.ok,available);
  assert.equal(forceNvenc.encoder,available?'NVENC':null);
  assert.equal(forceNvenc.checks.some(check=>check.level==='error'&&check.label==='NVENC no disponible'),!available);
});

test('a 60 fps 4K source drives the preflight, flags reductions, and invalidates a 30 fps size',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'elite-quality-probe-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const source=path.join(directory,'recording.mp4');
  await fs.writeFile(source,Buffer.alloc(100));
  const settings={profile:'source',encoder:'cpu',frameRate:'source',exportQuality:'high'};
  const project={source,settings,name:'Grabación',revision:2,media:{width:3840,height:2160,fps:'60/1',pixelFormat:'yuv420p'},clips:[{start:0,end:30,enabled:true}]};
  const report=await exportPreflight(project);
  assert.equal(report.fps,60);
  assert.equal(report.width,3840);
  assert(report.ok);
  assert.equal(report.reducesQuality,false);
  const reduced=await exportPreflight({...project,settings:{...settings,profile:'youtube',frameRate:'30'}});
  assert(reduced.checks.some(check=>check.label==='Reducción de resolución'));
  assert(reduced.checks.some(check=>check.label==='Menos fotogramas por segundo'));
  assert.equal(reduced.reducesQuality,true);
  assert.equal((await exportPreflight({...project,artifacts:{export:{file:source,revision:2,width:3840,height:2160,duration:30,encoder:'CPU',fps:30,quality:'high'}}})).measuredSizeMB,null);
  const hdr=await exportPreflight({...project,media:{...project.media,pixelFormat:'yuv420p10le',colorTransfer:'smpte2084'}});
  assert.equal(hdr.ok,false);
  assert(hdr.checks.some(check=>check.label==='HDR o profundidad de color incompatible'));
});

test('download header keeps the announced name, RFC 5987 encoding and suffix for long titles',()=>{
  const name=artifactDownloadName({name:'Cámara 7: (grabación).mp4'},'export','.mp4');
  const header=attachmentHeader(name);
  assert.match(header,/filename="Camara-7-grabacion-final\.mp4"/);
  assert.match(header,/%28grabaci%C3%B3n%29/);
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]),name);
  const longName=artifactDownloadName({name:'📼 video '.repeat(35)},'export','.mp4');
  const longHeader=attachmentHeader(longName);
  assert.match(longHeader,/filename="[^"]+-final\.mp4"/);
  assert.equal(decodeURIComponent(longHeader.split("filename*=UTF-8''")[1]),longName);
  assert.ok(longName.endsWith('-final.mp4'));
});
