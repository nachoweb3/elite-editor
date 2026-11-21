import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'elite-join-parts-'));
process.env.STUDIO_PROJECTS_DIR=path.join(directory,'projects');
process.env.STUDIO_INPUT_DIR=path.join(directory,'input');
process.env.STUDIO_CACHE_DIR=path.join(directory,'cache');
const {CACHE_ROOT,list,run}=await import('../server/core.mjs');
const {importRecordingParts}=await import('../server/join-parts.mjs');
const owner={id:'join-parts-test',role:'owner'};
after(()=>fs.rm(directory,{recursive:true,force:true}));

function upload(parts,name='Montaje de varias partes',alter=body=>body){
  const manifest=Buffer.from(JSON.stringify({name,parts:parts.map(part=>({name:part.name,size:part.data.length}))})+'\n');
  const body=alter(Buffer.concat([manifest,...parts.map(part=>part.data)]));
  const request=Readable.from([body.subarray(0,7),body.subarray(7,manifest.length+1),body.subarray(manifest.length+1)]);
  request.headers={'content-length':String(body.length)};
  return request;
}

test('rechaza los fragmentos truncados y los bytes adicionales sin dejar proyectos o temporales',async()=>{
  const parts=[{name:'parte1.mp4',data:Buffer.from('primero')},{name:'parte2.mov',data:Buffer.from('segundo')}];
  await assert.rejects(importRecordingParts(upload(parts,undefined,body=>body.subarray(0,-1)),owner),/quedó incompleta/);
  await assert.rejects(importRecordingParts(upload(parts,undefined,body=>Buffer.concat([body,Buffer.from('x')])),owner),/fuera de las partes/);
  assert.deepEqual(await fs.readdir(CACHE_ROOT),[]);
  assert.deepEqual(await list(),[]);
});

test('copia partes compatibles y convierte partes distintas manteniendo el orden confirmado',async t=>{
  try{await run('ffmpeg',['-version'],{timeout:5000});}
  catch{t.skip('FFmpeg no está disponible');return;}
  async function clip(name,color,shape,rate,{audio=true,codec='libx264'}={}){
    const file=path.join(directory,name);
    const args=['-v','error','-y','-f','lavfi','-i',`color=c=${color}:s=${shape}:r=${rate}:d=1`];
    if(audio)args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-shortest','-c:a','aac');
    await run('ffmpeg',[...args,'-c:v',codec,'-pix_fmt','yuv420p',file]);
    return {name,data:await fs.readFile(file)};
  }
  const [red,blue,green]=await Promise.all([
    clip('parte-1.mp4','red','320x180',24),
    clip('parte-2.mp4','blue','320x180',24),
    clip('parte-3.webm','lime','200x300',25,{audio:false,codec:'libvpx-vp9'}),
  ]);
  const copied=await importRecordingParts(upload([red,blue]),owner);
  const normalized=await importRecordingParts(upload([green,red]),owner);
  assert.equal(copied.name,'Montaje de varias partes.mp4');
  assert.equal(copied.media.fps,'24/1','La copia conserva la cadencia original');
  assert.equal(normalized.media.fps,'25/1','La conversión conserva la cadencia más alta de las partes');
  assert.deepEqual([normalized.media.width,normalized.media.height],[320,480],'El lienzo vertical tiene espacio para ambas partes a resolución nativa');
  assert.equal(normalized.media.audio,true);
  for(const [project,colors] of [[copied,[0,2]],[normalized,[1,0]]]){
    assert.ok(Math.abs(project.media.duration-2)<.2);
    assert.equal(project.clips[0].end,project.media.duration);
    assert.equal(project.sourceParts[0].start,0);
    assert.ok(Math.abs(project.sourceParts[1].start-1)<.08);
    assert.equal(project.sourceParts[0].end,project.sourceParts[1].start);
    assert.equal(project.sourceParts[1].end,project.media.duration);
    for (const [index,channel] of colors.entries()){
      const pixel=path.join(directory,'color.bin');
      await run('ffmpeg',['-v','error','-y','-ss',String(index+.3),'-i',project.source,
        '-vf','format=rgb24,crop=1:1:(iw-1)/2:(ih-1)/2','-frames:v','1','-f','rawvideo',pixel]);
      assert.ok((await fs.readFile(pixel))[channel]>210);
    }
  }
  assert.deepEqual(copied.sourceParts.map(part=>part.name),[red.name,blue.name]);
  assert.deepEqual(normalized.sourceParts.map(part=>part.name),[green.name,red.name]);
  assert.deepEqual(await fs.readdir(CACHE_ROOT),[]);
  assert.equal((await list()).length,2);
});
