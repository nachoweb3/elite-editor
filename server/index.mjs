import {opencutManifest} from './opencut-bridge.mjs';
import {generationSettings,listGenerations,submitGeneration,refreshGeneration} from './generative.mjs';
import {gallery,changeGallery,newProject} from './gallery.mjs';
import {saveManual} from './manual-editor.mjs';
import {updateStickmen} from './stickman.mjs';
import {importDiffusion} from './diffusion-sync.mjs';
import {editByPrompt,undoPrompt,cutByTranscript,previewInstruction,enhanceInstruction} from './prompt-editor.mjs';
import {faceSettings} from './retouch-settings.mjs';
import http from 'node:http';
import {pexelsStatus,searchPexels} from './pexels.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {randomUUID,randomBytes} from 'node:crypto';
import {ROOT,config,load,save,list,importVideo,validateSettings,validateTimeline,atomic,run} from './core.mjs';
import {doctor,readAssets,thumbnail} from './engine.mjs';
import {enqueue,recover,busy,liveMessages} from './jobs.mjs';
const port=Number(process.env.STUDIO_PORT||4310),token=randomBytes(24).toString('hex');
const send=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>12_000_000)throw new Error('Solicitud demasiado grande');}return JSON.parse(b||'{}');}
function safe(p){const {source,...data}=p;return {...data,jobs:data.jobs.map(j=>({...j,message:liveMessages.get(j.id)||j.message}))};}
async function file(req,res,target,download=false){const stat=await fsp.stat(target),ext=path.extname(target).toLowerCase(),types={'.mp4':'video/mp4','.mkv':'video/x-matroska','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.srt':'text/plain; charset=utf-8','.ass':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};let start=0,end=stat.size-1,status=200;const headers={'Content-Type':types[ext]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};if(download)headers['Content-Disposition']=`attachment; filename="${path.basename(target)}"`;if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2])){res.writeHead(416);res.end();return;}if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Number(m[2]);}end=Math.min(end,stat.size-1);if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}await pipeline(fs.createReadStream(target,{start,end}),res).catch(()=>{});}
await recover();
const server=http.createServer(async(req,res)=>{try{
  if(![`127.0.0.1:${port}`,`localhost:${port}`,'127.0.0.1:5173','localhost:5173'].includes(req.headers.host)){send(res,{error:'Host no permitido'},403);return;}
  const origin=req.headers.origin;if(origin&&![`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5181','http://localhost:5181'].includes(origin)){send(res,{error:'Origen no permitido'},403);return;}
  res.setHeader('X-Content-Type-Options','nosniff');const u=new URL(req.url,'http://127.0.0.1'),method=req.method;
  if(!['GET','HEAD'].includes(method)&&req.headers['x-studio-token']!==token){send(res,{error:'Sesión inválida; recarga la interfaz'},403);return;}
  if(u.pathname==='/api/session'){send(res,{token});return;}
  if(u.pathname==='/api/generative/settings'&&method==='GET'){send(res,await generationSettings());return;}
  if(u.pathname==='/api/generative/settings'&&method==='POST'){send(res,await generationSettings((await body(req)).key));return;}
  if(u.pathname==='/api/generative/jobs'&&method==='GET'){send(res,await listGenerations());return;}
  if(u.pathname==='/api/generative/jobs'&&method==='POST'){send(res,await submitGeneration(await body(req)),202);return;}
  if(u.pathname==='/api/generative/refresh'&&method==='POST'){send(res,await refreshGeneration((await body(req)).id));return;}
  if(u.pathname==='/api/pexels'&&method==='GET'){send(res,await pexelsStatus());return;}
  if(u.pathname==='/api/pexels/search'&&method==='POST'){const b=await body(req);send(res,await searchPexels(b.query,{kind:b.kind}));return;}
  if(u.pathname==='/api/doctor'){send(res,await doctor());return;}
  if(u.pathname==='/api/gallery'&&method==='GET'){send(res,await gallery());return;}
  if(u.pathname==='/api/gallery'&&method==='POST'){send(res,await changeGallery(await body(req)));return;}
  if(u.pathname==='/api/projects/new'&&method==='POST'){send(res,safe(await newProject(await body(req))),201);return;}
  if(u.pathname==='/api/projects'&&method==='GET'){send(res,(await list()).filter(p=>!p.trashedAt).map(safe));return;}
  if(u.pathname==='/api/assets'&&method==='GET'){send(res,(await readAssets()).filter(a=>!a.trashedAt).map(({file,...a})=>a));return;}
  if(u.pathname==='/api/resources/browser'&&['GET','HEAD'].includes(method)){await file(req,res,path.join(ROOT,'resources/index.html'));return;}
  if(u.pathname==='/api/asset'&&['GET','HEAD'].includes(method)){const asset=(await readAssets()).find(a=>a.id===u.searchParams.get('id'));if(!asset){send(res,{error:'Recurso no encontrado'},404);return;}await file(req,res,asset.file,u.searchParams.get('download')==='1');return;}
  if(u.pathname==='/api/upload'&&method==='POST'){
    const name=path.basename(u.searchParams.get('name')||'video.mp4'),ext=path.extname(name).toLowerCase(),kind=u.searchParams.get('kind')||'video';if(!(kind==='video'?['.mp4','.mkv','.mov','.webm']:['.mp3','.wav','.m4a','.ogg','.mp4','.png','.jpg','.jpeg','.webp']).includes(ext))throw new Error('Formato no admitido');const temp=path.join(ROOT,'cache',randomUUID()+ext),limit=(await config()).maxUploadGB*1024**3;let size=0;
    try{await pipeline(req,new Transform({transform(chunk,enc,cb){size+=chunk.length;cb(size>limit?new Error('Archivo demasiado grande'):null,chunk);}}),fs.createWriteStream(temp,{flags:'wx'}));if(kind==='video'){send(res,safe(await importVideo(temp,name)),201);}else{const license=(u.searchParams.get('license')||'').trim();if(!license)throw new Error('Indica la licencia o permiso de uso');let duration;const audioKind=['music','sound'].includes(kind);if(audioKind){if(!['.mp3','.wav','.m4a','.ogg'].includes(ext))throw new Error('Selecciona un archivo de audio');const info=JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',temp])).out);duration=Number(info.format?.duration);if(!info.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration<=0)throw new Error('Audio inválido');}const id=randomUUID(),dest=path.join(ROOT,'input/assets',id+ext);await fsp.copyFile(temp,dest);const assets=await readAssets();const entry={id,name,kind:audioKind?kind:'broll',duration,tags:(u.searchParams.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean),license,file:dest};assets.push(entry);await atomic(path.join(ROOT,'config/assets.json'),assets);send(res,{...entry,file:undefined},201);}}finally{await fsp.unlink(temp).catch(()=>{});}return;}
  const m=/^\/api\/projects\/([a-f0-9-]{36})(?:\/(\w+))?$/.exec(u.pathname);
  if(m){const [,id,action]=m,p=await load(id);
    if(!action&&method==='GET'){send(res,safe(p));return;}
    if(action==='opencut'&&method==='GET'){send(res,opencutManifest(p));return;}
    if(action==='media'&&['GET','HEAD'].includes(method)){await file(req,res,p.source);return;}
    if(action==='artifact'&&['GET','HEAD'].includes(method)){const a=p.artifacts[u.searchParams.get('type')||'export'];if(!a)throw new Error('Resultado aún no disponible');const format=u.searchParams.get('format');await file(req,res,format==='srt'?a.srt:format==='ass'?a.ass:a.file,u.searchParams.get('download')==='1');return;}
    if(action==='log'&&method==='GET'){const j=p.jobs.find(x=>x.id===u.searchParams.get('job'));if(!j)throw new Error('Registro no encontrado');const logFile=path.join(ROOT,'logs',j.id+'.log'),stat=await fsp.stat(logFile),handle=await fsp.open(logFile,'r');try{const b=Buffer.alloc(Math.min(stat.size,40000));await handle.read(b,0,b.length,stat.size-b.length);send(res,{log:b.toString('utf8')});}finally{await handle.close();}return;}
    if(method==='POST'&&busy(p))throw new Error('Espera a que termine el procesamiento antes de modificar el proyecto');
    if(action==='prompt'&&method==='POST'){const b=await body(req);send(res,safe(await editByPrompt(id,b.prompt,b.revision,b.planId)));return;}
    if(action==='plan'&&method==='POST'){const b=await body(req);send(res,await previewInstruction(id,b.prompt,b.revision));return;}
    if(action==='enhance'&&method==='POST'){const b=await body(req);send(res,await enhanceInstruction(id,b.prompt,b.revision));return;}
    if(action==='cut'&&method==='POST'){const b=await body(req);send(res,safe(await cutByTranscript(id,b.start,b.end,b.revision)));return;}
    if(action==='sync'&&method==='POST'){const b=await body(req);send(res,safe(await importDiffusion(id,b.revision)));return;}
    if(action==='manual'&&method==='POST'){send(res,safe(await saveManual(id,await body(req))));return;}
    if(action==='undo'&&method==='POST'){send(res,safe(await undoPrompt(id)));return;}
    if(action==='portrait'&&method==='POST'){const b=await body(req);if(b.revision!==p.revision)throw new Error('Recarga el proyecto antes de guardar');p.history=[...(p.history||[]),{settings:p.settings,clips:p.clips}].slice(-20);if(b.settings.cleanAudio!==undefined&&typeof b.settings.cleanAudio!=='boolean')throw Error('Audio setting invalid');p.settings={...p.settings,...faceSettings(b.settings),...(typeof b.settings.cleanAudio==='boolean'?{cleanAudio:b.settings.cleanAudio}:{})};p.revision++;p.artifacts={};await save(p);send(res,safe(p));return;}
    if(action==='timeline'&&method==='POST'){const b=await body(req);if(b.revision!==p.revision){send(res,{error:'El proyecto cambió. Recarga antes de guardar.'},409);return;}p.settings=validateSettings(b.settings);p.clips=validateTimeline(b.clips,p.media.duration);if(!p.clips.some(c=>c.enabled))throw new Error('Activa al menos un fragmento');if(b.transcript){if(!Array.isArray(b.transcript)||b.transcript.length!==p.transcript.length)throw new Error('Transcripción inválida');for(let i=0;i<p.transcript.length;i++){const text=b.transcript[i].text;if(typeof text!=='string'||text.length>5000)throw new Error('Texto inválido');if(text!==p.transcript[i].text){p.transcript[i].text=text;const tokens=text.trim().split(/\s+/),seg=p.transcript[i],step=(seg.end-seg.start)/Math.max(1,tokens.length);seg.words=tokens.filter(Boolean).map((word,k)=>({word,start:seg.start+k*step,end:seg.start+(k+1)*step,estimated:true}));}}}p.reviewed=b.reviewed===true;p.revision++;p.artifacts={};await save(p);send(res,safe(p));return;}
    if(action==='stickman'&&method==='POST'){send(res,safe(await updateStickmen(id,await body(req))));return;}
    if(action==='job'&&method==='POST'){const b=await body(req);send(res,await enqueue(id,b.type),202);return;}
    if(action==='thumbnail'&&method==='POST'){const b=await body(req);send(res,safe(await thumbnail(id,b.time,b.title)));return;}
  }
  if(!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method)){const base=path.join(ROOT,'dist'),target=path.resolve(base,'.'+decodeURIComponent(u.pathname));if(target!==base&&!target.startsWith(base+path.sep))throw new Error('Ruta inválida');try{await file(req,res,(await fsp.stat(target)).isFile()?target:path.join(base,'index.html'));}catch{await file(req,res,path.join(base,'index.html'));}return;}
  send(res,{error:'Ruta no encontrada'},404);
}catch(e){if(!res.headersSent)send(res,{error:e.message},400);else res.destroy();}});
server.requestTimeout=0;server.headersTimeout=60000;
server.listen(port,'127.0.0.1',()=>console.log(`NACHO WEB3 AI VIDEO STUDIO: http://127.0.0.1:${port}`));
