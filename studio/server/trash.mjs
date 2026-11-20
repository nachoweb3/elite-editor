// Trash retention. Trashed projects keep their media on disk, so without a
// purge the studio fills up with files nobody can see. The retention is
// configurable and the manual empty action only touches the caller's items.
import fs from 'node:fs/promises';
import path from 'node:path';
import {list,projectDir,readAssets,changeAssets} from './core.mjs';

const DAY=24*60*60*1000;

async function sizeOf(target){
  try{
    const stat=await fs.stat(target);
    if(!stat.isDirectory())return stat.size;
    let total=0;
    for(const entry of await fs.readdir(target,{withFileTypes:true}))total+=await sizeOf(path.join(target,entry.name));
    return total;
  }catch{return 0;}
}

function referencedAssets(projects){
  const used=new Set();
  for(const project of projects){
    if(project.settings?.musicId)used.add(project.settings.musicId);
    for(const track of project.audioTracks||[])if(track.assetId)used.add(track.assetId);
  }
  return used;
}

async function removeProject(project,keptSources){
  if(project.source&&!keptSources.has(project.source))await fs.unlink(project.source).catch(()=>{});
  await fs.rm(projectDir(project.id),{recursive:true,force:true});
}

export async function trashSummary(user){
  const projects=(await list()).filter(project=>project.ownerId===user.id&&project.trashedAt);
  const assets=(await readAssets()).filter(asset=>asset.ownerId===user.id&&asset.trashedAt);
  let bytes=0;
  for(const project of projects){
    bytes+=await sizeOf(projectDir(project.id));
    if(project.source)bytes+=await sizeOf(project.source);
  }
  for(const asset of assets)if(asset.file)bytes+=await sizeOf(asset.file);
  const oldest=[...projects.map(project=>project.trashedAt),...assets.map(asset=>asset.trashedAt)].filter(Boolean).sort()[0]||null;
  return {projects:projects.length,assets:assets.length,bytes,oldest};
}

export async function emptyTrash(user,{days=0}={}){
  const cutoff=days>0?Date.now()-days*DAY:Infinity;
  const all=await list();
  const removed=all.filter(project=>project.ownerId===user.id&&project.trashedAt&&Date.parse(project.trashedAt)<=cutoff);
  const kept=all.filter(project=>!removed.includes(project));
  const keptSources=new Set(kept.map(project=>project.source).filter(Boolean));
  let bytes=0;
  for(const project of removed){
    bytes+=await sizeOf(projectDir(project.id));
    if(project.source)bytes+=await sizeOf(project.source);
    await removeProject(project,keptSources);
  }
  const used=referencedAssets(kept);
  let dropped=0;
  await changeAssets(async assets=>{
    const drop=assets.filter(asset=>asset.ownerId===user.id&&asset.trashedAt&&Date.parse(asset.trashedAt)<=cutoff&&!used.has(asset.id));
    if(!drop.length)return;
    dropped=drop.length;
    for(const asset of drop){
      if(asset.file)bytes+=await sizeOf(asset.file);
      if(asset.file)await fs.unlink(asset.file).catch(()=>{});
    }
    return assets.filter(asset=>!drop.includes(asset));
  });
  return {projects:removed.length,assets:dropped,bytes};
}

// Runs at startup and every few hours. It applies to every account because the
// retention is a property of the installation, not of one user.
export async function purgeExpired(days=30){
  if(!(Number(days)>0))return {projects:0,assets:0};
  const cutoff=Date.now()-Number(days)*DAY;
  const all=await list();
  const removed=all.filter(project=>project.trashedAt&&Date.parse(project.trashedAt)<=cutoff);
  const kept=all.filter(project=>!removed.includes(project));
  const keptSources=new Set(kept.map(project=>project.source).filter(Boolean));
  for(const project of removed)await removeProject(project,keptSources);
  const used=referencedAssets(kept);
  let dropped=0;
  await changeAssets(async assets=>{
    const drop=assets.filter(asset=>asset.trashedAt&&Date.parse(asset.trashedAt)<=cutoff&&!used.has(asset.id));
    if(!drop.length)return;
    dropped=drop.length;
    for(const asset of drop)if(asset.file)await fs.unlink(asset.file).catch(()=>{});
    return assets.filter(asset=>!drop.includes(asset));
  });
  return {projects:removed.length,assets:dropped};
}
