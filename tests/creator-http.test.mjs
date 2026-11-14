import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('creator HTTP routes: discovery, checklist, auth, revision and reversible Short',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'elite-creator-http-'));
 let child;
 try{
  await fs.cp(new URL('../server',import.meta.url),path.join(tmp,'server'),{recursive:true});
  await fs.cp(new URL('../vendor/open-generative-ai',import.meta.url),path.join(tmp,'vendor/open-generative-ai'),{recursive:true});
  await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
  await fs.cp(new URL('../node_modules/typescript',import.meta.url),path.join(tmp,'node_modules/typescript'),{recursive:true});
  const id='00000000-0000-0000-0000-000000000001',folder=path.join(tmp,'projects',id);
  await fs.mkdir(folder,{recursive:true});
  const p={id,name:'HTTP fixture',revision:1,settings:{profile:'youtube'},jobs:[],artifacts:{},history:[],reviewed:true,media:{duration:80,width:1920,height:1080},clips:[{id:'clip',start:0,end:80,enabled:true}],transcript:Array.from({length:40},(_,i)=>({start:i*2,end:i*2+1.8,text:'Una frase de prueba.',words:[{word:'Una',start:i*2,end:i*2+.4},{word:'frase',start:i*2+.4,end:i*2+.8},{word:'de',start:i*2+.8,end:i*2+1.2},{word:'prueba.',start:i*2+1.2,end:i*2+1.8}]}))};
  await fs.writeFile(path.join(folder,'project.json'),JSON.stringify(p));
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  child=spawn(process.execPath,[path.join(tmp,'server/index.mjs')],{cwd:tmp,env:{...process.env,STUDIO_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',data=>process.stderr.write(data));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server start timed out')),15000);child.stdout.on('data',()=>{clearTimeout(timer);resolve();});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});child.once('error',reject);});
  const base=`http://127.0.0.1:${port}/api`,call=(route,options)=>fetch(base+route,options);
  const {token}=await (await call('/session')).json();
  const route=`/projects/${id}`;
  const found=await call(route+'/shorts?min=10&max=25');assert.equal(found.status,200);assert(Array.isArray((await found.json()).candidates));
  const checklist=await call(route+'/checklist?platform=youtube');assert.equal(checklist.status,200);assert((await checklist.json()).items.length>0);
  const loud=await call(route+'/loudness');assert.equal(loud.status,400);assert.match((await loud.json()).error,/previsualización|render/);
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:1,start:10,end:30})};
  assert.equal((await call(route+'/shorts',options)).status,403);
  options.headers['x-studio-token']=token;
  const applied=await call(route+'/shorts',options);assert.equal(applied.status,200);const updated=await applied.json();assert.equal(updated.revision,2);assert.equal(updated.history.length,1);
  assert.equal((await call(route+'/shorts',options)).status,400);
  const undone=await call(route+'/undo',{method:'POST',headers:options.headers,body:'{}'});assert.equal(undone.status,200);assert.equal((await undone.json()).clips[0].start,0);
 }finally{
  if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}
  assert(path.basename(tmp).startsWith('elite-creator-http-')&&path.dirname(tmp)===path.resolve(os.tmpdir()));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});
