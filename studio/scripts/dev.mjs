import {spawn} from 'node:child_process';
import path from 'node:path';
import {ROOT} from '../server/core.mjs';
async function service(port){
  try{
    const r=await fetch(`http://127.0.0.1:${port}${port===4310?'/api/session':'/'}`,{signal:AbortSignal.timeout(2000)});
    if(!r.ok)return false;
    return port===4310?typeof (await r.json()).authenticated==='boolean':/\<title>(NACHO WEB3|Elite Editor)/.test(await r.text());
  }catch{return false;}
}
const ports=[4310,5173];
const studioUrl='http://127.0.0.1:5173/?workspace=automatic';
const existing=await Promise.all(ports.map(service));
let legacyServer=false;
try{const response=await fetch('http://127.0.0.1:4310/api/session',{signal:AbortSignal.timeout(2000)});const value=await response.json();legacyServer=typeof value.token==='string'&&!('authenticated' in value);}catch{}
if(existing.every(Boolean)){
  console.log('El estudio ya está abierto. Se reutiliza la instancia existente.');
  console.log(`Abre ${studioUrl}`);
  process.exit(0);
}
const {default:net}=await import('node:net');
for(let i=0;i<ports.length;i++){
  if(existing[i])continue;
  const occupied=await new Promise(resolve=>{
    const socket=net.connect({host:'127.0.0.1',port:ports[i]});
    const finish=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1500,()=>finish(true));
  });
  if(occupied){console.error(i===0&&legacyServer?'El puerto 4310 lo ocupa una versión anterior del estudio. Cierra esa ventana del servidor (la que muestra NACHO WEB3) y vuelve a abrir INICIAR_ESTUDIO.cmd. No se ha detenido ningún proceso.':`El puerto ${ports[i]} está ocupado por otro servicio. No se ha detenido ningún proceso.`);process.exit(1);}
}
const commands=[['server/index.mjs'],[path.join(ROOT,'node_modules/vite/bin/vite.js')]];
// Reuse healthy services; only own and stop children created by this invocation.
const children=commands.flatMap((args,i)=>existing[i]?[]:[spawn(process.execPath,args,{cwd:ROOT,stdio:'inherit',windowsHide:true})]);
console.log(`Dirección del estudio: ${studioUrl}`);
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',e=>{console.error(e);stop(1);});child.on('exit',code=>stop(code||0));}process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
