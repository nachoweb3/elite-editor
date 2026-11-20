import fs from 'node:fs/promises';
import path from 'node:path';
import {CACHE_ROOT,run} from './core.mjs';

const quote=value=>`'${String(value).replace(/'/g,"''")}'`;
const windowsZip=(command,timeout=900000)=>run('powershell',[
  '-NoProfile','-NonInteractive','-Command',
  "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; "+command,
],{timeout});

// Creates a real .zip using the tools that ship with the system: PowerShell on
// Windows and the classic zip/unzip pair elsewhere. No extra dependency.
export async function zipDirectory(dir,target){
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.unlink(target).catch(()=>{});
  if(process.platform==='win32'){
    await windowsZip(`[IO.Compression.ZipFile]::CreateFromDirectory(${quote(dir)}, ${quote(target)}, [IO.Compression.CompressionLevel]::Fastest, $false)`);
  }else{
    await run('zip',['-r','-q',target,'.'],{cwd:dir,timeout:900000});
  }
  const stat=await fs.stat(target).catch(()=>null);
  if(!stat?.size)throw new Error('El paquete quedó vacío. Comprueba que hay archivos para incluir.');
  return target;
}

export async function extractZip(zip,target,{maxBytes=Infinity,maxEntries=Infinity}={}){
  const limits=Number.isFinite(maxBytes)||Number.isFinite(maxEntries);
  if(limits){
    const {out}=process.platform==='win32'
      ?await windowsZip([
        '$archive = [IO.Compression.ZipFile]::OpenRead('+quote(zip)+')',
        'try { $files = $archive.Entries; $bytes = ($files | Measure-Object -Property Length -Sum).Sum; "$($files.Count) $([long]$bytes)" } finally { $archive.Dispose() }',
      ].join('; '),30_000)
      :await run('unzip',['-Z','-t',zip],{timeout:30_000});
    const stats=process.platform==='win32'?/^(\d+) (\d+)$/.exec(out.trim()):/(\d+) files?,\s+(\d+) bytes? uncompressed/.exec(out);
    if(!stats)throw new Error('No se pudo comprobar el tamaño del paquete ZIP.');
    if(Number(stats[1])>maxEntries||Number(stats[2])>maxBytes){
      throw new Error('El paquete supera el límite de archivos o de espacio al extraerlo.');
    }
  }
  await fs.mkdir(target,{recursive:true});
  if(process.platform==='win32'){
    await windowsZip(`[IO.Compression.ZipFile]::ExtractToDirectory(${quote(zip)}, ${quote(target)})`);
  }else{
    await run('unzip',['-q','-o',zip,'-d',target],{timeout:900000});
  }
  return target;
}

export async function createZip(entries,target){
  await fs.mkdir(CACHE_ROOT,{recursive:true});
  const staging=await fs.mkdtemp(path.join(CACHE_ROOT,'zip-'));
  try{
    for(const entry of entries){
      const dest=path.join(staging,entry.name);
      await fs.mkdir(path.dirname(dest),{recursive:true});
      await fs.copyFile(entry.path,dest);
    }
    return await zipDirectory(staging,target);
  }catch(error){
    await fs.unlink(target).catch(()=>{});
    throw error;
  }finally{
    await fs.rm(staging,{recursive:true,force:true});
  }
}
