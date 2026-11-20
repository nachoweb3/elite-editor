import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CACHE_ROOT,run} from './core.mjs';
import {createZip} from './zip.mjs';

const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();

// Deterministic, editable copy for each short: nothing is invented, the hook
// and its sentence come from the analysis.
export function shortMetadata(p,item){
  const hook=clean(item.hook)||`Short ${String(item.index).padStart(2,'0')}`;
  const title=hook.replace(/^["'«»]+|["'«»]+$/g,'').slice(0,90);
  const words=[...new Set(hook.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>4))].slice(0,4);
  const hashtags=['#shorts','#vertical',...words.map(w=>`#${w}`)].slice(0,7).join(' ');
  const description=[hook,item.sentence?clean(item.sentence):'',`Corte ${clock(item.start)}–${clock(item.end)} de «${p.name}».`].filter(Boolean).join('\n\n');
  return {title,description,hashtags};
}

export async function packageShorts(p,ids=[]){
  const items=(p.shorts?.items||[]).filter(item=>item.status==='ready'&&item.file&&(!ids.length||ids.includes(item.id)));
  if(!items.length)throw new Error('No hay shorts listos para descargar. Genera los shorts primero.');
  await fs.mkdir(CACHE_ROOT,{recursive:true});
  const staging=await fs.mkdtemp(path.join(CACHE_ROOT,'shorts-pack-'));
  try{
    const entries=[];
    const manifest=[];
    for(const item of items){
      const base=`short-${String(item.index).padStart(2,'0')}`;
      entries.push({name:`${base}/${base}.mp4`,path:item.file});
      if(item.srt)entries.push({name:`${base}/${base}.srt`,path:item.srt});
      const metadata=shortMetadata(p,item);
      const thumb=path.join(staging,'thumbs',`${base}.jpg`);
      await fs.mkdir(path.dirname(thumb),{recursive:true});
      try{
        await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(item.start),'-i',p.source,'-frames:v','1','-vf','scale=1080:-2',thumb],{timeout:120000});
        entries.push({name:`${base}/${base}.jpg`,path:thumb});
      }catch{}
      const copy=path.join(staging,'copy',`${base}.md`);
      await fs.mkdir(path.dirname(copy),{recursive:true});
      await fs.writeFile(copy,`# ${metadata.title}\n\n## Descripción\n\n${metadata.description}\n\n## Hashtags\n\n${metadata.hashtags}\n`,{encoding:'utf8'});
      entries.push({name:`${base}/${base}.md`,path:copy});
      manifest.push({index:item.index,start:item.start,end:item.end,...metadata,file:`${base}/${base}.mp4`});
    }
    const jsonPath=path.join(staging,'shorts.json');
    await fs.writeFile(jsonPath,JSON.stringify({project:p.name,generatedAt:new Date().toISOString(),shorts:manifest},null,2),{encoding:'utf8'});
    entries.push({name:'shorts.json',path:jsonPath});
    const target=path.join(CACHE_ROOT,'packages',`${p.id}-shorts-${randomUUID()}.zip`);
    return {path:await createZip(entries,target),name:`${String(p.name||'shorts').replace(/\.zip$/i,'').replace(/[^\w\-. ]+/g,'').trim()||'shorts'}-shorts.zip`,count:items.length};
  }finally{
    await fs.rm(staging,{recursive:true,force:true});
  }
}
