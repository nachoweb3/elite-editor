import {spawn} from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {ROOT} from '../server/core.mjs';
const children=[];
async function occupied(port){return new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.setTimeout(2000,()=>{s.destroy();resolve(true);});});}
async function healthy(port,route){try{const r=await fetch(`http://127.0.0.1:${port}${route}`,{signal:AbortSignal.timeout(10000)});return r.ok&&(port===4310?typeof(await r.json()).token==='string':/OpenCut|NACHO Studio|Elite Editor/.test(await r.text()));}catch{return false;}}
function start(args,cwd){const child=spawn(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});children.push(child);child.on('error',e=>console.error(e.message));return child;}
if(!await healthy(4310,'/api/session')){if(await occupied(4310))throw Error('El puerto 4310 esta ocupado y el motor no responde.');start(['server/index.mjs'],ROOT);}
if(!await healthy(5181,'/projects')){if(await occupied(5181))throw Error('El puerto 5181 esta ocupado. El editor puede estar compilando; espera y vuelve a abrirlo.');const cwd=path.join(ROOT,'vendor/opencut-classic/apps/web');const require=createRequire(path.join(cwd,'package.json'));start([require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','5181'],cwd);}
console.log('Elite Editor: http://127.0.0.1:5181/projects');
console.log('Timeline, biblioteca, Asistente IA y Crear con IA en el mismo editor.');
function stop(){for(const child of children)child.kill();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
