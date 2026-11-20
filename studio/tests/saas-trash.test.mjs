import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('trash retention frees disk without touching active projects', async t => {
  const base=path.join(process.cwd(),'cache','saas-trash-'+randomUUID());
  const projects=path.join(base,'projects');
  const assetsFile=path.join(base,'assets.json');
  await fs.mkdir(projects,{recursive:true});
  process.env.STUDIO_PROJECTS_DIR=projects;
  process.env.STUDIO_ASSETS_FILE=assetsFile;
  try{
    const trash=await import('../server/trash.mjs?saas='+randomUUID());
    const days=24*60*60*1000;
    const oldTrash=new Date(Date.now()-40*days).toISOString();
    const recentTrash=new Date(Date.now()-5*days).toISOString();

    async function project(id,{trashedAt=null,source=null}={}){
      const directory=path.join(projects,id),sourceFile=source?path.join(base,id+'.mp4'):null;
      await fs.mkdir(directory,{recursive:true});
      await fs.writeFile(path.join(directory,'project.json'),JSON.stringify({
        id,ownerId:'user-1',name:'Prueba '+id,trashedAt,source:sourceFile,
        createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
        media:{duration:1},settings:{},clips:[],audioTracks:[],jobs:[],artifacts:{},
      }));
      if(sourceFile)await fs.writeFile(sourceFile,'video');
      return {directory,sourceFile};
    }

    const old=await project(randomUUID(),{trashedAt:oldTrash,source:true});
    const recent=await project(randomUUID(),{trashedAt:recentTrash,source:true});
    const active=await project(randomUUID());

    const oldAssetFile=path.join(base,'old.mp3'),recentAssetFile=path.join(base,'recent.mp3');
    await fs.writeFile(oldAssetFile,'audio');
    await fs.writeFile(recentAssetFile,'audio');
    await fs.writeFile(assetsFile,JSON.stringify([
      {id:randomUUID(),ownerId:'user-1',kind:'music',trashedAt:oldTrash,file:oldAssetFile},
      {id:randomUUID(),ownerId:'user-1',kind:'music',trashedAt:recentTrash,file:recentAssetFile},
    ]));

    const before=await trash.trashSummary({id:'user-1'});
    assert.equal(before.projects,2);
    assert.equal(before.assets,2);
    assert.ok(before.bytes>0);

    const purged=await trash.purgeExpired(30);
    assert.equal(purged.projects,1);
    assert.equal(purged.assets,1);
    await assert.rejects(fs.stat(old.directory),/ENOENT/);
    await assert.rejects(fs.stat(old.sourceFile),/ENOENT/);
    await fs.stat(recent.directory);
    await fs.stat(active.directory);
    await assert.rejects(fs.stat(oldAssetFile),/ENOENT/);
    await fs.stat(recentAssetFile);

    const emptied=await trash.emptyTrash({id:'user-1'},{days:0});
    assert.equal(emptied.projects,1);
    assert.equal(emptied.assets,1);
    await assert.rejects(fs.stat(recent.directory),/ENOENT/);
    await assert.rejects(fs.stat(recentAssetFile),/ENOENT/);
    await fs.stat(active.directory);

    const after=await trash.trashSummary({id:'user-1'});
    assert.equal(after.projects,0);
    assert.equal(after.assets,0);
  }finally{
    delete process.env.STUDIO_PROJECTS_DIR;
    delete process.env.STUDIO_ASSETS_FILE;
    await fs.rm(base,{recursive:true,force:true});
  }
});
