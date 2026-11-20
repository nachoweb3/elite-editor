import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CACHE=path.join(ROOT,'cache');
await fs.mkdir(CACHE,{recursive:true});
const WORK=await fs.mkdtemp(path.join(CACHE,'portable-test-'));
process.env.STUDIO_PROJECTS_DIR=path.join(WORK,'projects');
process.env.STUDIO_ASSETS_FILE=path.join(WORK,'assets.json');
process.env.STUDIO_CACHE_DIR=path.join(WORK,'cache');
process.env.STUDIO_INPUT_DIR=path.join(WORK,'input');

const {ASSETS_FILE,CACHE_ROOT,INPUT_ROOT,PROJECTS_ROOT,defaults,projectDir,load,run,save}=await import('../server/core.mjs');
const {packageProject,importPackage}=await import('../server/portable.mjs');
const {createVersion,listVersions,restoreVersion}=await import('../server/versions.mjs');
const {exportPreflight}=await import('../server/preflight.mjs');
const {extractZip,zipDirectory}=await import('../server/zip.mjs');

const OWNER='prueba-portable';
const originalSource=path.join(WORK,'grabacion original.mp4');
const audioFile=path.join(WORK,'musica.wav');
const audioAssetId=randomUUID();

const exists=target=>fs.access(target).then(()=>true,()=>false);

before(async()=>{
  await run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:s=1280x720:r=30:d=10','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',originalSource],{timeout:30_000});
  await run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',audioFile],{timeout:30_000});
  await fs.writeFile(ASSETS_FILE,JSON.stringify([{id:audioAssetId,name:'Música de prueba',kind:'music',duration:2,license:'CC0',tags:[],file:audioFile,ownerId:OWNER}],null,2));
});

async function cleanup(){
  assert.equal(path.dirname(WORK),CACHE);
  assert.ok(path.basename(WORK).startsWith('portable-test-'));
  await fs.rm(WORK,{recursive:true,force:true});
}

after(cleanup);

async function makeProject(patch={}){
  const id=randomUUID();
  const project={
    id,
    name:'Montaje de prueba',
    ownerId:OWNER,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    source:originalSource,
    media:{duration:10,width:1280,height:720,audio:true},
    settings:{...defaults,profile:'youtube',musicId:audioAssetId},
    clips:[
      {id:'clip-a',sourceId:id,start:0,end:6,enabled:true,transitionIn:'none',motion:'none'},
      {id:'clip-b',sourceId:id,start:6.5,end:10,enabled:true,transitionIn:'none',motion:'none'},
    ],
    transcript:[{start:0,end:5,text:'Hola, bienvenidos al estudio.'}],
    audioTracks:[{id:'track-a',assetId:audioAssetId,at:1,sourceIn:0,duration:1.5,kind:'music',volume:.4,fadeIn:0,fadeOut:0}],
    revision:3,
    artifacts:{export:{file:path.join(WORK,'render.mp4')}},
    jobs:[{id:'job-1',type:'render',status:'failed',message:'Cancelado por el usuario'}],
    shorts:{status:'ready',count:1,items:[]},
    versions:[],
    history:[],
    ...patch,
  };
  await fs.mkdir(projectDir(id),{recursive:true});
  await save(project);
  return project;
}

test('el paquete portable lleva el montaje, el vídeo y el audio usado, sin renders ni shorts',async()=>{
  const project=await makeProject();
  const [pack,other]=await Promise.all([packageProject(project.id),packageProject(project.id)]);
  assert.notEqual(pack.path,other.path);
  assert.equal(pack.name,'Montaje de prueba.zip');
  assert.ok((await fs.stat(pack.path)).size>0);
  await assert.rejects(()=>extractZip(pack.path,path.join(WORK,'limit'),{maxBytes:1024}),/supera el límite/);
  assert.equal(await exists(path.join(WORK,'limit')),false);
  const unzipped=await fs.mkdtemp(path.join(WORK,'unzip-'));
  await extractZip(pack.path,unzipped);
  const exported=JSON.parse(await fs.readFile(path.join(unzipped,'project.json'),'utf8'));
  assert.equal(exported.packageVersion,2);
  assert.equal(exported.id,project.id);
  assert.deepEqual(exported.artifacts,{});
  assert.deepEqual(exported.jobs,[]);
  assert.deepEqual(exported.versions,[]);
  assert.deepEqual(exported.history,[]);
  assert.equal(exported.shorts,undefined);
  assert.equal(exported.ownerId,null);
  assert.equal(exported.source,'media/grabacion original.mp4');
  assert.ok(await exists(path.join(unzipped,exported.source)));
  assert.ok(await exists(path.join(unzipped,'LEEME.txt')));
  const manifest=JSON.parse(await fs.readFile(path.join(unzipped,'assets.json'),'utf8'));
  assert.equal(manifest.length,1);
  assert.equal(manifest[0].id,audioAssetId);
  assert.equal(manifest[0].file,'assets/musica.wav');
  assert.ok(await exists(path.join(unzipped,'assets','musica.wav')));
});

test('importar el paquete crea un proyecto nuevo con sus medios y el audio remapeado',async()=>{
  const project=await makeProject();
  const pack=await packageProject(project.id);
  const {project:imported,audio}=await importPackage(pack.path,{id:OWNER});
  assert.notEqual(imported.id,project.id);
  assert.equal(imported.name,'Montaje de prueba (importado)');
  assert.equal(imported.ownerId,OWNER);
  assert.equal(imported.revision,0);
  assert.equal(imported.clips.length,2);
  assert.deepEqual(imported.clips.map(clip=>[clip.start,clip.end]),[[0,6],[6.5,10]]);
  assert.ok(imported.clips.every(clip=>clip.sourceId===imported.id));
  assert.notEqual(imported.source,originalSource);
  assert.equal(path.dirname(imported.source),INPUT_ROOT);
  assert.ok(await exists(imported.source));
  assert.equal(imported.artifacts.export,undefined);
  assert.equal(imported.shorts,undefined);
  assert.deepEqual(imported.jobs,[]);
  assert.equal(audio,1);
  assert.equal(imported.audioTracks.length,1);
  const track=imported.audioTracks[0];
  assert.notEqual(track.assetId,audioAssetId);
  assert.equal(imported.settings.musicId,track.assetId);
  const assets=JSON.parse(await fs.readFile(ASSETS_FILE,'utf8'));
  const asset=assets.find(item=>item.id===track.assetId);
  assert.ok(asset,'el audio importado queda registrado en la biblioteca');
  assert.equal(path.dirname(asset.file),path.join(INPUT_ROOT,'assets'));
  assert.ok(await exists(asset.file));
  assert.equal((await listVersions(imported.id)).versions.length,0);
  assert.ok((await fs.readdir(projectDir(imported.id))).includes('project.json'));
});

test('importa el formato anterior aunque repita un audio en el manifiesto',async()=>{
  const project=await makeProject();
  const pack=await packageProject(project.id);
  const legacy=await fs.mkdtemp(path.join(WORK,'legacy-'));
  await extractZip(pack.path,legacy);
  const projectFile=path.join(legacy,'project.json'),assetsFile=path.join(legacy,'assets.json');
  const metadata=JSON.parse(await fs.readFile(projectFile,'utf8'));
  delete metadata.packageVersion;
  const assets=JSON.parse(await fs.readFile(assetsFile,'utf8'));
  await fs.writeFile(projectFile,JSON.stringify(metadata));
  await fs.writeFile(assetsFile,JSON.stringify([...assets,...assets]));
  const archive=await zipDirectory(legacy,path.join(WORK,'legado.zip'));
  const imported=await importPackage(archive,{id:OWNER});
  assert.equal(imported.audio,1);
  assert.equal(imported.project.audioTracks[0].assetId,imported.project.settings.musicId);
});

test('si no se registra el audio, la importación limpia el montaje y todas sus copias',async()=>{
  const pack=await packageProject((await makeProject()).id);
  const assetsDir=path.join(INPUT_ROOT,'assets');
  const directories=[PROJECTS_ROOT,INPUT_ROOT,assetsDir];
  const original=await Promise.all(directories.map(dir=>fs.readdir(dir)));
  const registry=await fs.readFile(ASSETS_FILE);
  await fs.unlink(ASSETS_FILE);
  await fs.mkdir(ASSETS_FILE);
  try{
    await assert.rejects(()=>importPackage(pack.path,{id:OWNER}),/EISDIR|EPERM/);
  }finally{
    await fs.rmdir(ASSETS_FILE);
    await fs.writeFile(ASSETS_FILE,registry);
  }
  assert.deepEqual(await Promise.all(directories.map(dir=>fs.readdir(dir))),original);
  assert.deepEqual(await fs.readFile(ASSETS_FILE),registry);
});

test('crear una versión y restaurarla devuelve el montaje de ese punto',async()=>{
  const project=await makeProject();
  const first=await createVersion(project.id,{label:'Antes de recortar'});
  assert.equal(first.versions.length,1);
  assert.equal(first.versions[0].label,'Antes de recortar');
  assert.equal(first.versions[0].clips,2);
  assert.equal(first.versions[0].audioTracks,1);
  assert.equal(first.versions[0].duration,9.5);
  const edited=await load(project.id);
  edited.clips=[{id:'clip-a',sourceId:project.id,start:0,end:4,enabled:true,transitionIn:'none',motion:'none'}];
  edited.artifacts={export:{file:path.join(WORK,'nuevo.mp4')}};
  await save(edited);
  const second=await createVersion(project.id,{label:'Recorte rápido'});
  assert.equal(second.versions.length,2);
  assert.equal(second.versions[0].label,'Recorte rápido');
  await assert.rejects(()=>restoreVersion(project.id,{versionId:second.versions[1].id,revision:edited.revision-1}),{status:409});
  const restored=await restoreVersion(project.id,{versionId:second.versions[1].id,revision:edited.revision});
  assert.equal(restored.clips.length,2);
  assert.deepEqual(restored.clips.map(clip=>clip.end),[6,10]);
  assert.equal(restored.manual,true);
  assert.equal(restored.reviewed,true);
  assert.deepEqual(restored.artifacts,{});
  assert.equal(restored.history.length,1);
  assert.ok(restored.revision>edited.revision);
  const result=await listVersions(project.id);
  assert.equal(result.versions[0].rescue,true);
  assert.equal(result.versions[0].label,'Antes de restaurar «Antes de recortar»');
  assert.equal(result.versions[0].duration,4);
  const rescued=await restoreVersion(project.id,{versionId:result.versions[0].id});
  assert.deepEqual(rescued.clips.map(clip=>clip.end),[4]);
  await assert.rejects(()=>restoreVersion(project.id,{versionId:randomUUID()}),/ya no existe/);
});

test('dos peticiones de versión sobre el mismo montaje conservan ambos puntos',async()=>{
  const project=await makeProject();
  await Promise.all([
    createVersion(project.id,{label:'Una',revision:project.revision}),
    createVersion(project.id,{label:'Dos',revision:project.revision}),
  ]);
  assert.deepEqual((await listVersions(project.id)).versions.map(version=>version.label),['Dos','Una']);
});

test('solo se conservan las 12 últimas versiones',async()=>{
  const project=await makeProject();
  for(let index=1;index<=13;index++)await createVersion(project.id,{label:`v${index}`});
  const list=await listVersions(project.id);
  assert.equal(list.versions.length,12);
  assert.equal(list.versions[0].label,'v13');
  assert.equal(list.current.clips,2);
  assert.equal(list.current.revision,project.revision);
});

test('el preflight resume formato, tamaño y avisos, y bloquea lo imposible',async()=>{
  const project=await makeProject();
  const report=await exportPreflight(project);
  assert.equal(report.ok,true);
  assert.equal(report.profile,'youtube');
  assert.deepEqual([report.width,report.height],[1920,1080]);
  assert.equal(report.duration,9.5);
  assert.ok(report.sizeRangeMB[0]<report.sizeMB&&report.sizeMB<report.sizeRangeMB[1]);
  assert.ok(report.minutes>0&&report.minutes<=1);
  assert.equal(report.name,'Montaje de prueba-final.mp4');
  assert.equal(report.resumable,true);
  assert.ok(report.checks.some(check=>check.level==='ok'&&/NVENC|CPU/.test(check.label)));
  const fourK=await exportPreflight({...project,settings:{...project.settings,profile:'youtube4k'}});
  assert.equal(fourK.ok,false);
  assert.ok(fourK.checks.some(check=>check.level==='error'&&check.label==='4K sin origen 4K'));
  const missing=await exportPreflight({...project,source:path.join(WORK,'no-existe.mp4')});
  assert.equal(missing.ok,false);
  assert.ok(missing.checks.some(check=>check.level==='error'&&check.label==='Falta el vídeo original'));
  const noAudio=await exportPreflight({...project,audioTracks:[{id:'perdida',assetId:randomUUID(),at:0,duration:4,kind:'music'}]});
  assert.ok(noAudio.checks.some(check=>check.level==='warn'&&check.label==='Audio no disponible'));
  const long=await exportPreflight({...project,clips:[{id:'larga',sourceId:project.id,start:0,end:1500,enabled:true,transitionIn:'none',motion:'none'}]});
  assert.equal(long.duration,1500);
  assert.ok(long.checks.some(check=>check.level==='warn'&&check.label==='Exportación larga'));
  const empty=await exportPreflight({...project,clips:[]});
  assert.equal(empty.ok,false);
  assert.ok(empty.checks.some(check=>check.level==='error'&&check.label==='Sin clips activos'));
});

test('un proyecto sin vídeo original no se puede empaquetar',async()=>{
  const project=await makeProject({source:path.join(WORK,'perdido.mp4')});
  await assert.rejects(()=>packageProject(project.id),/vídeo original no está disponible/);
});

test('la regresión no deja proyectos, paquetes ni recursos temporales',async()=>{
  assert.ok((await fs.readdir(CACHE_ROOT)).every(name=>!name.startsWith('package-')&&!name.startsWith('import-')));
  await cleanup();
  assert.equal(await exists(WORK),false);
  assert.equal(await exists(ASSETS_FILE),false);
  assert.equal(await exists(PROJECTS_ROOT),false);
  assert.equal(await exists(INPUT_ROOT),false);
  assert.equal(await exists(CACHE_ROOT),false);
});
