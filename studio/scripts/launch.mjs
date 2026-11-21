import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {ROOT,run} from '../server/core.mjs';
import packageInfo from '../package.json' with {type:'json'};

const ports=[5173,5174,5175];
const host='127.0.0.1';
const installationId=createHash('sha256').update(ROOT).digest('hex');
const logFile=path.join(ROOT,'logs','inicio.log');
let child;
let stopping=false;

function print(message,error=false){
  console[error?'error':'log'](message);
  fs.appendFileSync(logFile,`[${new Date().toISOString()}] ${message}\n`);
}

async function runningPort(){
  const matches=await Promise.all(ports.map(async port=>{
    try{
      const response=await fetch(`http://${host}:${port}/api/health`,{signal:AbortSignal.timeout(1500)});
      if(!response.ok)return false;
      const data=await response.json();
      return data.edition==='studio'&&data.launcher==='standalone'&&data.version===packageInfo.version&&data.installationId===installationId;
    }catch{return false;}
  }));
  return ports.find((_,index)=>matches[index]);
}

function portIsFree(port){
  return new Promise(resolve=>{
    const check=net.createServer();
    check.once('error',()=>resolve(false));
    check.listen(port,host,()=>check.close(()=>resolve(true)));
  });
}

function showStudio(port){
  const url=`http://${host}:${port}/?workspace=automatic`;
  print(`Elite Editor Studio: ${url}`);
  if(process.argv.includes('--no-browser'))return;
  const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});
  browser.once('error',()=>print('Abre la dirección anterior en tu navegador.'));
  browser.once('exit',code=>{if(code!==0)print('Abre la dirección anterior en tu navegador.');});
  browser.unref();
}

function launch(port){
  child=spawn(process.execPath,['server/index.mjs'],{
    cwd:ROOT,
    env:{...process.env,STUDIO_PORT:String(port),STUDIO_INSTALLATION_ID:installationId,STUDIO_SESSION_COOKIE:`elite_studio_${installationId.slice(0,12)}`},
    windowsHide:true,
    stdio:['ignore','pipe','pipe','ipc'],
  });
  for(const stream of [child.stdout,child.stderr]){
    stream.on('data',data=>{
      fs.appendFileSync(logFile,data);
      process.stdout.write(data);
    });
  }
  const finished=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{child.kill();reject(new Error('El motor no respondió a tiempo.'));},15000);
    const complete=(fn,value)=>{clearTimeout(timeout);fn(value);};
    child.once('error',error=>complete(reject,error));
    child.on('message',message=>{
      if(message.type==='studio-ready')complete(resolve);
      if(message.type==='studio-error')complete(reject,Object.assign(new Error('El motor no pudo abrir el puerto.'),{code:message.code}));
    });
    void finished.then(()=>complete(reject,new Error('El motor se cerró antes de abrir el estudio.')));
  });
  return {ready,finished};
}

function stop(){
  stopping=true;
  child?.kill();
}
process.once('SIGINT',stop);
process.once('SIGTERM',stop);

async function start(){
  try{await fsp.access(path.join(ROOT,'dist','index.html'));}
  catch{throw new Error('Falta la interfaz compilada. Extrae el ZIP completo o ejecuta npm ci y npm run build si estás en el código fuente.');}
  const existing=await runningPort();
  if(existing){showStudio(existing);return;}

  await import('./init-public.mjs');
  const mediaTools=await Promise.all(['ffmpeg','ffprobe'].map(command=>run(command,['-version'],{timeout:4000}).then(()=>true,()=>false)));
  if(!mediaTools.every(Boolean))print('Instala FFmpeg y FFprobe y añádelos a PATH para importar y exportar vídeos.');
  for(const port of ports){
    if(stopping)return;
    if(!await portIsFree(port))continue;
    const {ready,finished}=launch(port);
    try{await ready;}
    catch(error){
      if(stopping)return;
      if(error.code!=='EADDRINUSE')throw error;
      const reuse=await runningPort();
      if(reuse){showStudio(reuse);return;}
      continue;
    }
    showStudio(port);
    print('Deja esta ventana abierta mientras editas. Pulsa Ctrl+C para cerrar el motor.');
    const {code,signal}=await finished;
    if(!stopping)throw new Error(`El motor se cerró (${signal||code}).`);
    return;
  }
  throw new Error('Los puertos 5173, 5174 y 5175 están ocupados. Libera uno para iniciar el estudio.');
}

try{
  await fsp.mkdir(path.dirname(logFile),{recursive:true});
  await start();
}catch(error){
  try{print(error.message,true);}
  catch{console.error(error.message);}
  process.exitCode=1;
}
