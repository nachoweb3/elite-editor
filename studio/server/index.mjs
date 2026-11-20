import {opencutManifest} from './opencut-bridge.mjs';
import {projectProxy,uploadedProxy} from './proxy.mjs';
import {generationSettings,listGenerations,submitGeneration,refreshGeneration,generationFileUrl} from './generative.mjs';
import {localStatus,installLocal,cancelLocalInstall,generateLocal,cancelLocalGeneration,localFile} from './local-ai.mjs';
import {gallery,changeGallery,newProject,duplicateProject} from './gallery.mjs';
import {shortCandidates,applyShortWindow,measureLoudness} from './creator.mjs';
import {usageSnapshot,planFor,assertProjectQuota,projectCount,remainingFor,limitMessage,recordUsage} from './usage.mjs';
import {saveManual} from './manual-editor.mjs';
import {listVersions,createVersion,restoreVersion} from './versions.mjs';
import {exportPreflight} from './preflight.mjs';
import {artifactDownloadName,attachmentHeader} from './export-filename.mjs';
import {importRecordingParts} from './join-parts.mjs';
import {packageProject,importPackage} from './portable.mjs';
import {packageShorts,shortMetadata} from './shorts-package.mjs';
import {updateIntervention,setMusic,interventionCatalogue} from './ai-layer.mjs';
import {updateStickmen} from './stickman.mjs';
import {importDiffusion} from './diffusion-sync.mjs';
import {editByPrompt,undoPrompt,cutByTranscript,previewInstruction,enhanceInstruction} from './prompt-editor.mjs';
import {faceSettings} from './retouch-settings.mjs';
import {sourceSettings} from './source-settings.mjs';
import {buildComposition} from '../shared/composition.mjs';
import http from 'node:http';
import {pexelsStatus,searchPexels} from './pexels.mjs';
import {giphyStatus,saveGiphyKey,searchGiphy} from './giphy.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform,Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {ROOT,CACHE_ROOT,INPUT_ROOT,config,load,save,list,importVideo,validateSettings,validateTimeline,changeAssets,run,projectDir} from './core.mjs';
import {doctor,readAssets,thumbnail} from './engine.mjs';
import {enqueue,recover,busy,liveMessages,cancelJob,queuePositions,queueStats,queueSnapshot} from './jobs.mjs';
import {register,login,logout,resolveSession,sessionCookie,clearSessionCookie,isSecureRequest,registrationOpen,userCount,verifyCredentials,changePassword,removeAccount,listSessions,revokeSession,revokeOtherSessions,revokeUserSessions,listAccounts,setPlan,resetPassword} from './accounts.mjs';
import {recordActivity,listActivity,clearActivity} from './audit.mjs';
import {hit} from './ratelimit.mjs';
import {trashSummary,emptyTrash,purgeExpired} from './trash.mjs';
import packageInfo from '../package.json' with {type:'json'};
const port=Number(process.env.STUDIO_PORT||4310);
const landingOrigins=new Set(['https://nachoweb3.github.io','http://127.0.0.1:4173','http://localhost:4173']);
const send=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const ipOf=req=>String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');
let healthCache={at:0,value:null};
const HEALTH_CACHE_SECONDS=Number(process.env.STUDIO_HEALTH_CACHE_SECONDS??30);
async function healthState(){
  if(healthCache.value&&Date.now()-healthCache.at<HEALTH_CACHE_SECONDS*1000)return healthCache.value;
  let ffmpeg=true;try{await run('ffmpeg',['-version'],{timeout:5000});}catch{ffmpeg=false;}
  let diskFreeGB=null;try{const stat=await fsp.statfs(ROOT);diskFreeGB=Number((stat.bavail*stat.bsize/1024**3).toFixed(2));}catch{}
  const value={status:ffmpeg?'ok':'degraded',version:packageInfo.version,uptimeSeconds:Math.round(process.uptime()),ffmpeg,accounts:await userCount(),queue:queueStats(),diskFreeGB,time:new Date().toISOString()};
  healthCache={at:Date.now(),value};
  return value;
}
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>12_000_000)throw new Error('Solicitud demasiado grande');}return JSON.parse(b||'{}');}
function safe(p){const {source,...data}=p,positions=queuePositions();return {...data,jobs:data.jobs.map(j=>({...j,message:j.status==='queued'&&positions.has(j.id)?`En cola · posición ${positions.get(j.id)}`:liveMessages.get(j.id)||j.message}))};}
function sendJsonFile(res,data,name){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':attachmentHeader(name),'Cache-Control':'no-store'});res.end(JSON.stringify(data,null,2));}
async function exportAccount(user){const projects=(await list()).filter(p=>p.ownerId===user.id);const assets=(await readAssets()).filter(a=>a.ownerId===user.id);return {exportedAt:new Date().toISOString(),account:user,usage:await usageSnapshot(user),projects:projects.map(safe),assets:assets.map(({file,...a})=>a),generations:await listGenerations(user)};}
// Removes everything that belongs to the account: project folders, original
// videos that no other project uses, owned assets, generation records and their
// files. Shared legacy assets used by another account are kept and unowned.
async function deleteAccountData(user){
  const all=await list(),owned=all.filter(p=>p.ownerId===user.id);
  if(owned.some(p=>(p.jobs||[]).some(j=>['queued','running'].includes(j.status)))){const error=new Error('Cancela tus trabajos activos antes de eliminar la cuenta');error.status=409;throw error;}
  const remaining=all.filter(p=>p.ownerId!==user.id),keptSources=new Set(remaining.map(p=>p.source).filter(Boolean));
  for(const project of owned){if(project.source&&!keptSources.has(project.source))await fsp.unlink(project.source).catch(()=>{});await fsp.rm(projectDir(project.id),{recursive:true,force:true});}
  let assetCount=0;
  await changeAssets(async assets=>{
    const mine=assets.filter(a=>a.ownerId===user.id);
    assetCount=mine.length;
    if(!assetCount)return;
    for(const asset of mine){
      const usedByKept=remaining.some(p=>p.settings?.musicId===asset.id||(p.audioTracks||[]).some(t=>t.assetId===asset.id));
      if(usedByKept){asset.ownerId=null;continue;}
      if(asset.file)await fsp.unlink(asset.file).catch(()=>{});
      assets.splice(assets.indexOf(asset),1);
    }
    return assets;
  });
  const genDir=path.join(ROOT,'projects/generations'),files=await fsp.readdir(genDir).catch(()=>[]);
  for(const name of files){
    if(!name.endsWith('.json'))continue;
    const jobId=name.startsWith('local-')?name.slice(6,-5):name.slice(0,-5);
    if(!/^[a-f0-9-]{36}$/.test(jobId))continue;
    const target=path.join(genDir,name),job=JSON.parse(await fsp.readFile(target,'utf8').catch(()=>'null'));
    if(!job||job.ownerId!==user.id)continue;
    if(job.fileName)await fsp.unlink(path.join(genDir,path.basename(job.fileName))).catch(()=>{});
    for(const file of files)if(file.startsWith(`local-${jobId}.`))await fsp.unlink(path.join(genDir,file)).catch(()=>{});
    await fsp.unlink(target).catch(()=>{});
  }
  return {projects:owned.length,assets:assetCount};
}
async function file(req,res,target,download=false,downloadAs){const stat=await fsp.stat(target),ext=path.extname(target).toLowerCase(),types={'.mp4':'video/mp4','.mkv':'video/x-matroska','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.srt':'text/plain; charset=utf-8','.ass':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};let start=0,end=stat.size-1,status=200;const headers={'Content-Type':types[ext]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};if(download)headers['Content-Disposition']=attachmentHeader(downloadAs||path.basename(target));if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2])){res.writeHead(416);res.end();return;}if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Number(m[2]);}end=Math.min(end,stat.size-1);if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}await pipeline(fs.createReadStream(target,{start,end}),res).catch(()=>{});}
await recover();
const TRASH_DAYS=Number(process.env.STUDIO_TRASH_DAYS||30);
purgeExpired(TRASH_DAYS).then(result=>{if(result.projects||result.assets)console.log(`Papelera: ${result.projects} proyectos y ${result.assets} recursos fuera de retención eliminados`);}).catch(error=>console.error('No se pudo purgar la papelera:',error.message));
setInterval(()=>{purgeExpired(TRASH_DAYS).catch(()=>{});},6*3600*1000).unref();
const server=http.createServer(async(req,res)=>{try{
  if(![`127.0.0.1:${port}`,`localhost:${port}`,'127.0.0.1:5173','localhost:5173'].includes(req.headers.host)){send(res,{error:'Host no permitido'},403);return;}
  const origin=req.headers.origin,healthPath=(req.url||'').split('?')[0]==='/api/health';
  const landingProbe=healthPath&&landingOrigins.has(origin)&&['GET','HEAD','OPTIONS'].includes(req.method);
  if(origin&&!(landingProbe||[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5181','http://localhost:5181'].includes(origin))){send(res,{error:'Origen no permitido'},403);return;}
  // The public landing only asks whether the local studio is running. Nothing
  // else is readable cross-origin, and the response carries no project data.
  if(landingProbe){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Private-Network','true');if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Max-Age':'600'});res.end();return;}}
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  const u=new URL(req.url,'http://127.0.0.1'),method=req.method,ip=ipOf(req),meta={ip,userAgent:String(req.headers['user-agent']||'')};
  const secure=isSecureRequest(req),owns=(project,user)=>!!project&&!!user&&project.ownerId===user.id;
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(u.pathname==='/api/health'&&['GET','HEAD'].includes(method)){
    const health=await healthState();
    const {status,version,ffmpeg}=health;
    send(res,landingProbe?{status,version,ffmpeg}:health);
    return;
  }
  if(u.pathname.startsWith('/api/auth/')){
    const gate=hit(`auth:${ip}`,30,60_000);
    if(!gate.ok){res.setHeader('Retry-After',String(gate.retryAfter));send(res,{error:'Demasiados intentos desde este equipo. Espera un minuto.'},429);return;}
  }
  if(u.pathname==='/api/auth/register'&&method==='POST'){
    const result=await register(await body(req),meta);
    if(result.first&&process.env.STUDIO_CLAIM_UNOWNED!=='0'){for(const project of await list()){if(!project.ownerId){project.ownerId=result.user.id;await save(project);}}}
    res.setHeader('Set-Cookie',sessionCookie(result.token,secure));
    send(res,{authenticated:true,user:result.user,token:result.token},201);return;
  }
  if(u.pathname==='/api/auth/login'&&method==='POST'){
    const result=await login(await body(req),meta);
    res.setHeader('Set-Cookie',sessionCookie(result.token,secure));
    await recordActivity(result.user.id,'login','Inicio de sesión',meta);
    send(res,{authenticated:true,user:result.user,token:result.token});return;
  }
  if(u.pathname==='/api/auth/logout'&&method==='POST'){await logout(req);res.setHeader('Set-Cookie',clearSessionCookie(secure));send(res,{ok:true});return;}
  const session=u.pathname.startsWith('/api/')&&u.pathname!=='/api/session'?await resolveSession(req):null;
  if(u.pathname.startsWith('/api/')){
    const gate=hit(`api:${session?.user.id||ip}`,1200,60_000);
    if(!gate.ok){res.setHeader('Retry-After',String(gate.retryAfter));send(res,{error:'Demasiadas peticiones. Espera unos segundos.'},429);return;}
  }
  if(u.pathname==='/api/session'&&['GET','HEAD'].includes(method)){const current=await resolveSession(req);if(current)send(res,{authenticated:true,...current});else send(res,{authenticated:false,registrationOpen:await registrationOpen(),firstRun:(await userCount())===0});return;}
  if(u.pathname.startsWith('/api/')&&!session){send(res,{error:'Inicia sesión para usar el estudio'},401);return;}
  if(!['GET','HEAD'].includes(method)&&!req.headers['x-studio-token']){send(res,{error:'Sesión inválida; recarga la interfaz'},403);return;}
  const user=session?.user;
  if(u.pathname==='/api/generative/settings'&&method==='GET'){send(res,await generationSettings());return;}
  if(u.pathname==='/api/generative/settings'&&method==='POST'){send(res,await generationSettings((await body(req)).key));return;}
  if(u.pathname==='/api/generative/local/status'&&method==='GET'){send(res,await localStatus(user));return;}
  if(u.pathname==='/api/generative/local/install'&&method==='POST'){send(res,await installLocal(await body(req)),202);return;}
  if(u.pathname==='/api/generative/local/install/cancel'&&method==='POST'){send(res,await cancelLocalInstall());return;}
  if(u.pathname==='/api/generative/local/generate'&&method==='POST'){send(res,await generateLocal(await body(req),user),202);return;}
  if(u.pathname==='/api/generative/local/cancel'&&method==='POST'){send(res,await cancelLocalGeneration(user));return;}
  if(u.pathname==='/api/generative/local/file'&&['GET','HEAD'].includes(method)){await file(req,res,await localFile(u.searchParams.get('id')||'',user),u.searchParams.get('download')==='1');return;}
  if(u.pathname==='/api/generative/file'&&['GET','HEAD'].includes(method)){const target=await generationFileUrl(u.searchParams.get('id')||'',user);const response=await fetch(target,{signal:AbortSignal.timeout(60000),redirect:'follow'});if(!response.ok)throw Error(`El archivo generado respondió HTTP ${response.status}`);res.writeHead(200,{'Content-Type':response.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-cache'});if(method==='HEAD'){res.end();return;}if(!response.body)throw Error('El archivo generado está vacío');await pipeline(Readable.fromWeb(response.body),res);return;}
  if(u.pathname==='/api/generative/jobs'&&method==='GET'){send(res,await listGenerations(user));return;}
  if(u.pathname==='/api/generative/jobs'&&method==='POST'){send(res,await submitGeneration(await body(req),user),202);return;}
  if(u.pathname==='/api/generative/refresh'&&method==='POST'){send(res,await refreshGeneration((await body(req)).id,user));return;}
  if(u.pathname==='/api/pexels'&&method==='GET'){send(res,await pexelsStatus());return;}
  if(u.pathname==='/api/pexels/search'&&method==='POST'){const b=await body(req);send(res,await searchPexels(b.query,{kind:b.kind}));return;}
  if(u.pathname==='/api/giphy/status'&&method==='GET'){send(res,await giphyStatus());return;}
  if(u.pathname==='/api/giphy/key'&&method==='POST'){send(res,await saveGiphyKey((await body(req)).key));return;}
  if(u.pathname==='/api/giphy/search'&&method==='POST'){send(res,await searchGiphy((await body(req)).query));return;}
  if(u.pathname==='/api/doctor'){send(res,await doctor());return;}
  if(u.pathname==='/api/usage'&&method==='GET'){send(res,await usageSnapshot(user));return;}
  if(u.pathname==='/api/account/export'&&['GET','HEAD'].includes(method)){await recordActivity(user.id,'export','Datos de la cuenta descargados',meta);sendJsonFile(res,await exportAccount(user),`datos-${user.name}.json`);return;}
  if(u.pathname==='/api/account/password'&&method==='POST'){const result=await changePassword(user.id,await body(req),session.token);await recordActivity(user.id,'password',`Contraseña actualizada; ${result.revoked} sesiones cerradas`,meta);send(res,result);return;}
  if(u.pathname==='/api/account/sessions'&&method==='GET'){send(res,await listSessions(user.id,session.sessionId));return;}
  if(u.pathname==='/api/account/sessions/revoke'&&method==='POST'){const data=await body(req);const result=data.all?await revokeOtherSessions(user.id,session.sessionId):await revokeSession(user.id,String(data.id||''));await recordActivity(user.id,'sessions',`${result.revoked} sesiones cerradas`,meta);send(res,{...result,sessions:await listSessions(user.id,session.sessionId)});return;}
  if(u.pathname==='/api/account/activity'&&method==='GET'){send(res,await listActivity(user.id,20));return;}
  if(u.pathname==='/api/trash'&&method==='GET'){send(res,await trashSummary(user));return;}
  if(u.pathname==='/api/trash/empty'&&method==='POST'){const result=await emptyTrash(user,{days:0});await recordActivity(user.id,'trash',`Papelera vaciada: ${result.projects} proyectos y ${result.assets} recursos`,meta);send(res,{...result,summary:await trashSummary(user)});return;}
  if(u.pathname==='/api/queue'&&method==='GET'){send(res,{...queueStats(),jobs:queueSnapshot(user)});return;}
  if(u.pathname.startsWith('/api/admin/')){
    if(user.role!=='owner'){send(res,{error:'Solo el dueño de la instalación puede administrar cuentas'},403);return;}
    if(u.pathname==='/api/admin/accounts'&&method==='GET'){const rows=await listAccounts();send(res,await Promise.all(rows.map(async account=>({...account,projects:await projectCount(account.id),usage:await usageSnapshot(account)}))));return;}
    if(u.pathname==='/api/admin/plan'&&method==='POST'){const data=await body(req);if(data.id===user.id){const error=new Error('Tu propia cuenta no tiene plan limitado');error.status=400;throw error;}const updated=await setPlan(String(data.id||''),data.plan);await recordActivity(updated.id,'plan',`Plan cambiado a ${updated.plan} por ${user.name}`,meta);send(res,updated);return;}
    if(u.pathname==='/api/admin/reset-password'&&method==='POST'){const data=await body(req);if(data.id===user.id){const error=new Error('Usa «Cambiar contraseña» para tu propia cuenta');error.status=400;throw error;}const result=await resetPassword(String(data.id||''));await recordActivity(result.user.id,'reset',`Contraseña restablecida por ${user.name}`,meta);send(res,{user:result.user,password:result.password});return;}
    if(u.pathname==='/api/admin/sessions/revoke'&&method==='POST'){const data=await body(req);if(data.id===user.id){const error=new Error('Tus sesiones se cierran desde «Sesiones»');error.status=400;throw error;}const result=await revokeUserSessions(String(data.id||''));await recordActivity(String(data.id||''),'sessions',`Sesiones cerradas por ${user.name}`,meta);send(res,result);return;}
  }
  if(u.pathname==='/api/account/delete'&&method==='POST'){const data=await body(req);if(!(await verifyCredentials(user.id,data.password))){const error=new Error('La contraseña no es correcta');error.status=403;throw error;}const accountId=user.id,removed=await deleteAccountData(user);const result=await removeAccount(accountId);await clearActivity(accountId).catch(()=>{});res.setHeader('Set-Cookie',clearSessionCookie(secure));send(res,{ok:true,...result,...removed});return;}
  if(u.pathname==='/api/gallery'&&method==='GET'){send(res,await gallery(user.id));return;}
  if(u.pathname==='/api/gallery'&&method==='POST'){send(res,await changeGallery(await body(req),user.id));return;}
  if(u.pathname==='/api/projects/new'&&method==='POST'){await assertProjectQuota(user);send(res,safe(await newProject(await body(req),user.id)),201);return;}
  if(u.pathname==='/api/projects/join-parts'&&method==='POST'){
    const controller=new AbortController();
    const abort=()=>controller.abort(new Error('Se canceló la importación de las partes.'));
    res.once('close',abort);
    try{send(res,safe(await importRecordingParts(req,user,{signal:controller.signal})),201);}
    catch(error){req.resume();throw error;}
    finally{res.off('close',abort);}
    return;
  }
  if(u.pathname==='/api/projects'&&method==='GET'){send(res,(await list()).filter(p=>!p.trashedAt&&owns(p,user)).map(safe));return;}
  if(u.pathname==='/api/projects/import-package'&&method==='POST'){
    await fsp.mkdir(CACHE_ROOT,{recursive:true});
    const temp=path.join(CACHE_ROOT,randomUUID()+'.zip');let size=0;
    try{
      await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>1.6*1024**3?new Error('El paquete supera 1,6 GB'):null,chunk);}}),fs.createWriteStream(temp,{flags:'wx'}));
      if(!size)throw new Error('El archivo está vacío');
      await assertProjectQuota(user);
      const result=await importPackage(temp,user);
      await recordActivity(user.id,'import','Paquete de proyecto importado',meta);
      send(res,safe(result.project),201);
    }finally{await fsp.unlink(temp).catch(()=>{});}
    return;
  }
  const shortsPackageMatch=/^\/api\/projects\/([a-f0-9-]{36})\/shorts-package$/.exec(u.pathname);
  if(shortsPackageMatch&&['GET','HEAD'].includes(method)){const p=await load(shortsPackageMatch[1]);if(!owns(p,user)){send(res,{error:'Proyecto no encontrado'},404);return;}const ids=String(u.searchParams.get('ids')||'').split(',').filter(Boolean);const pack=await packageShorts(p,ids);try{await file(req,res,pack.path,true,pack.name);}finally{await fsp.unlink(pack.path).catch(()=>{});}return;}
  const shortMetaMatch=/^\/api\/projects\/([a-f0-9-]{36})\/shorts\/([a-z0-9-]{4,40})\/metadata$/.exec(u.pathname);
  if(shortMetaMatch&&method==='GET'){const p=await load(shortMetaMatch[1]);if(!owns(p,user)){send(res,{error:'Proyecto no encontrado'},404);return;}const item=p.shorts?.items?.find(x=>x.id===shortMetaMatch[2]);if(!item){send(res,{error:'Short no encontrado'},404);return;}send(res,shortMetadata(p,item));return;}
  if(u.pathname==='/api/assets'&&method==='GET'){send(res,(await readAssets()).filter(a=>!a.trashedAt&&(!a.ownerId||a.ownerId===user.id)).map(({file,...a})=>a));return;}
  if(u.pathname==='/api/catalogue'&&method==='GET'){send(res,await interventionCatalogue());return;}
  if(u.pathname==='/api/asset'&&['GET','HEAD'].includes(method)){
    const assetId=u.searchParams.get('id');
    const [stored,catalog]=await Promise.all([readAssets(),(async()=>{try{const {catalogue}=await import('./director.mjs');return await catalogue();}catch{return[];}})()]);
    const asset=[...stored,...catalog].find(a=>a.id===assetId);
    if(!asset||!asset.file||(asset.ownerId&&asset.ownerId!==user.id)){send(res,{error:'Recurso no encontrado'},404);return;}
    await file(req,res,asset.file,u.searchParams.get('download')==='1');
    return;
  }
  if(u.pathname==='/api/sound-effects/soft-whoosh.wav'&&['GET','HEAD'].includes(method)){await file(req,res,path.join(ROOT,'sound_effects/soft-whoosh.wav'));return;}
  if(u.pathname==='/api/upload'&&method==='POST'){
    const name=path.basename(u.searchParams.get('name')||'video.mp4'),ext=path.extname(name).toLowerCase(),kind=u.searchParams.get('kind')||'video';if(!(kind==='video'?['.mp4','.mkv','.mov','.webm']:['.mp3','.wav','.m4a','.ogg','.mp4','.png','.jpg','.jpeg','.webp']).includes(ext))throw new Error('Formato no admitido');const temp=path.join(ROOT,'cache',randomUUID()+ext),accountPlan=planFor(user),remaining=await remainingFor(user,'uploadGB'),storage=await remainingFor(user,'storageGB'),maxUpload=(await config()).maxUploadGB;let size=0;
    if(kind==='video')await assertProjectQuota(user);
    if(storage<=0){const error=new Error(`Has alcanzado el almacenamiento del plan ${accountPlan.label}. Elimina proyectos o vacía la papelera para liberar espacio.`);error.status=429;throw error;}
    if(remaining<=0){const error=new Error(await limitMessage(user,'uploadGB'));error.status=429;throw error;}
    const limit=Math.min(maxUpload,remaining,storage)*1024**3,declared=Number(req.headers['content-length']||0);
    if(declared>limit){const free=limit/1024**3;const space=free===Infinity?'sin límite':free>=0.01?`${free.toFixed(2)} GB`:`${Math.max(1,Math.round(free*1024))} MB`;const error=new Error(`El archivo supera el espacio disponible de tu plan ${accountPlan.label} (${space}).`);error.status=429;throw error;}
    try{await pipeline(req,new Transform({transform(chunk,enc,cb){size+=chunk.length;cb(size>limit?new Error('Archivo demasiado grande'):null,chunk);}}),fs.createWriteStream(temp,{flags:'wx'}));await recordUsage(user,'uploadGB',size/1024**3);if(kind==='video'){send(res,safe(await importVideo(temp,name,user.id)),201);}else{const license=(u.searchParams.get('license')||'').trim();if(!license)throw new Error('Indica la licencia o permiso de uso');let duration;const audioKind=['music','sound'].includes(kind);if(audioKind){if(!['.mp3','.wav','.m4a','.ogg'].includes(ext))throw new Error('Selecciona un archivo de audio');const info=JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',temp])).out);duration=Number(info.format?.duration);if(!info.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration<=0)throw new Error('Audio inválido');}const id=randomUUID(),dest=path.join(INPUT_ROOT,'assets',id+ext);await fsp.mkdir(path.dirname(dest),{recursive:true});await fsp.copyFile(temp,dest);const entry={id,name,kind:audioKind?kind:'broll',duration,tags:(u.searchParams.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean),license,file:dest,ownerId:user.id};try{await changeAssets(assets=>[...assets,entry]);}catch(error){await fsp.unlink(dest).catch(()=>{});throw error;}send(res,{...entry,file:undefined},201);}}finally{await fsp.unlink(temp).catch(()=>{});}return;}
  if(u.pathname==='/api/media/proxy'&&method==='POST'){
    const target=await uploadedProxy({req,name:u.searchParams.get('name')||'video.mp4'});
    try{await file(req,res,target);}finally{await fsp.unlink(target).catch(()=>{});}
    return;
  }
  const cancelMatch=/^\/api\/projects\/([a-f0-9-]{36})\/job\/cancel$/.exec(u.pathname);
  if(cancelMatch&&method==='POST'){const b=await body(req),project=await load(cancelMatch[1]);if(!owns(project,user)){send(res,{error:'Proyecto no encontrado'},404);return;}send(res,safe(await cancelJob(cancelMatch[1],b.jobId)));return;}
  const shortMatch=/^\/api\/projects\/([a-f0-9-]{36})\/shorts\/([a-z0-9-]{4,40})\/artifact$/.exec(u.pathname);
  if(shortMatch&&['GET','HEAD'].includes(method)){const [,id,shortId]=shortMatch,p=await load(id);if(!owns(p,user)){send(res,{error:'Proyecto no encontrado'},404);return;}const item=p.shorts?.items?.find(x=>x.id===shortId);if(!item?.file||item.status!=='ready'){send(res,{error:'Short aún no disponible'},404);return;}const format=u.searchParams.get('format'),target=format==='srt'?(item.srt||item.file):format==='ass'?(item.ass||item.file):item.file;await file(req,res,target,u.searchParams.get('download')==='1');return;}
  const m=/^\/api\/projects\/([a-f0-9-]{36})(?:\/(\w+))?$/.exec(u.pathname);
  if(m){const [,id,action]=m,p=await load(id);if(!owns(p,user)){send(res,{error:'Proyecto no encontrado'},404);return;}
    if(!action&&method==='GET'){send(res,safe(p));return;}
    if(action==='composition'&&method==='GET'){send(res,buildComposition(p));return;}
    if(action==='preflight'&&['GET','HEAD'].includes(method)){send(res,await exportPreflight(p));return;}
    if(action==='package'&&['GET','HEAD'].includes(method)){const pack=await packageProject(id);try{await file(req,res,pack.path,true,pack.name);}finally{await fsp.unlink(pack.path).catch(()=>{});}return;}
    if(action==='opencut'&&method==='GET'){send(res,opencutManifest(p));return;}
    if(action==='proxy'&&['GET','HEAD'].includes(method)){await file(req,res,await projectProxy(p));return;}
    if(action==='media'&&['GET','HEAD'].includes(method)){await file(req,res,p.source);return;}
    if(action==='live'&&['GET','HEAD'].includes(method)){
      const raw=u.searchParams.get('i');const index=Number(raw);const media=Array.isArray(p.automatic?.direction?.media)?p.automatic.direction.media:[];const item=Number.isInteger(index)&&index>=0?media[index]:null;
      if(raw===null||!item?.file){send(res,{error:'Recurso de vista previa no encontrado'},404);return;}
      try{const inputRoot=path.join(ROOT,'input');const target=await fsp.realpath(item.file);const relative=path.relative(inputRoot,target);if(relative.startsWith('..')||path.isAbsolute(relative)){send(res,{error:'Recurso fuera del catálogo'},403);return;}await file(req,res,target);}catch{send(res,{error:'Recurso de vista previa no disponible'},404);}
      return;
    }
    if(action==='artifact'&&['GET','HEAD'].includes(method)){const type=u.searchParams.get('type')||'export',a=p.artifacts[type];if(!a)throw new Error('Resultado aún no disponible');const format=u.searchParams.get('format'),target=format==='srt'?a.srt:format==='ass'?a.ass:a.file;if(!target)throw new Error('Formato aún no disponible');const extension=path.extname(target)||(format?'.'+format:'');await file(req,res,target,u.searchParams.get('download')==='1',artifactDownloadName(p,type,extension));return;}
    if(action==='log'&&method==='GET'){const j=p.jobs.find(x=>x.id===u.searchParams.get('job'));if(!j)throw new Error('Registro no encontrado');const logFile=path.join(ROOT,'logs',j.id+'.log'),stat=await fsp.stat(logFile),handle=await fsp.open(logFile,'r');try{const b=Buffer.alloc(Math.min(stat.size,40000));await handle.read(b,0,b.length,stat.size-b.length);send(res,{log:b.toString('utf8')});}finally{await handle.close();}return;}
    if(method==='POST'&&busy(p))throw new Error('Espera a que termine el procesamiento antes de modificar el proyecto');
    if(action==='versions'&&method==='GET'){send(res,await listVersions(id));return;}
    if(action==='versions'&&method==='POST'){const b=await body(req);if(b.versionId){const restored=await restoreVersion(id,b);await recordActivity(user.id,'versions','Versión restaurada',meta);send(res,{restored:safe(restored),versions:await listVersions(id)});return;}send(res,await createVersion(id,b),201);return;}
    if(action==='duplicate'&&method==='POST'){await assertProjectQuota(user);send(res,safe(await duplicateProject(id,user.id)),201);return;}
    if(action==='prompt'&&method==='POST'){const b=await body(req);send(res,safe(await editByPrompt(id,b.prompt,b.revision,b.planId)));return;}
    if(action==='plan'&&method==='POST'){const b=await body(req);send(res,await previewInstruction(id,b.prompt,b.revision));return;}
    if(action==='enhance'&&method==='POST'){const b=await body(req);send(res,await enhanceInstruction(id,b.prompt,b.revision));return;}
    if(action==='cut'&&method==='POST'){const b=await body(req);send(res,safe(await cutByTranscript(id,b.start,b.end,b.revision)));return;}
    if(action==='sync'&&method==='POST'){const b=await body(req);send(res,safe(await importDiffusion(id,b.revision)));return;}
    if(action==='manual'&&method==='POST'){send(res,safe(await saveManual(id,await body(req))));return;}
    if(action==='undo'&&method==='POST'){send(res,safe(await undoPrompt(id)));return;}
    if(action==='portrait'&&method==='POST'){const b=await body(req);if(b.revision!==p.revision)throw new Error('Recarga el proyecto antes de guardar');p.history=[...(p.history||[]),{settings:p.settings,clips:p.clips}].slice(-20);if(b.settings.cleanAudio!==undefined&&typeof b.settings.cleanAudio!=='boolean')throw Error('Audio setting invalid');p.settings={...p.settings,...faceSettings(b.settings),...sourceSettings({...p.settings,...b.settings}),...(typeof b.settings.cleanAudio==='boolean'?{cleanAudio:b.settings.cleanAudio}:{})};p.revision++;p.artifacts={};await save(p);send(res,safe(p));return;}
    if(action==='timeline'&&method==='POST'){const b=await body(req);if(b.revision!==p.revision){send(res,{error:'El proyecto cambió. Recarga antes de guardar.'},409);return;}p.settings=validateSettings(b.settings);p.clips=validateTimeline(b.clips,p.media.duration);if(!p.clips.some(c=>c.enabled))throw new Error('Activa al menos un fragmento');if(b.transcript){if(!Array.isArray(b.transcript)||b.transcript.length!==p.transcript.length)throw new Error('Transcripción inválida');for(let i=0;i<p.transcript.length;i++){const text=b.transcript[i].text;if(typeof text!=='string'||text.length>5000)throw new Error('Texto inválido');if(text!==p.transcript[i].text){p.transcript[i].text=text;const tokens=text.trim().split(/\s+/),seg=p.transcript[i],step=(seg.end-seg.start)/Math.max(1,tokens.length);seg.words=tokens.filter(Boolean).map((word,k)=>({word,start:seg.start+k*step,end:seg.start+(k+1)*step,estimated:true}));}}}p.reviewed=b.reviewed===true;p.revision++;p.artifacts={};await save(p);send(res,safe(p));return;}
    if(action==='settings'&&method==='POST'){const b=await body(req);if(b.revision!==undefined&&b.revision!==p.revision){send(res,{error:'El montaje cambió. Vuelve a abrir la comprobación.'},409);return;}p.settings=validateSettings({...p.settings,...b.settings});p.revision++;p.artifacts={};await save(p);send(res,safe(p));return;}
    if(action==='stickman'&&method==='POST'){send(res,safe(await updateStickmen(id,await body(req))));return;}
    if(action==='ai'&&method==='POST'){send(res,safe(await updateIntervention(id,await body(req))));return;}
    if(action==='music'&&method==='POST'){send(res,safe(await setMusic(id,await body(req))));return;}
    if(action==='shorts'&&method==='GET'){const min=Number(u.searchParams.get('min'))||15,max=Number(u.searchParams.get('max'))||30;send(res,await shortCandidates(id,{min,max}));return;}
    if(action==='shorts'&&method==='POST'){send(res,safe(await applyShortWindow(id,await body(req))));return;}
    if(action==='loudness'&&method==='GET'){send(res,await measureLoudness(id));return;}
    if(action==='job'&&method==='POST'){const b=await body(req);send(res,await enqueue(id,b.type,b.options,user),202);return;}
    if(action==='thumbnail'&&method==='POST'){const b=await body(req);send(res,safe(await thumbnail(id,b.time,b.title)));return;}
  }
  if(!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method)){const base=path.join(ROOT,'dist'),target=path.resolve(base,'.'+decodeURIComponent(u.pathname));if(target!==base&&!target.startsWith(base+path.sep))throw new Error('Ruta inválida');try{await file(req,res,(await fsp.stat(target)).isFile()?target:path.join(base,'index.html'));}catch{await file(req,res,path.join(base,'index.html'));}return;}
  send(res,{error:'Ruta no encontrada'},404);
}catch(e){if(!res.headersSent){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));send(res,{error:e.message},e.status||400);}else res.destroy();}});
server.requestTimeout=0;server.headersTimeout=60000;
server.listen(port,'127.0.0.1',()=>console.log(`NACHO WEB3 AI VIDEO STUDIO: http://127.0.0.1:${port}`));
