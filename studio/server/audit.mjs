// Account activity. It answers "why was I logged out?" and "who changed my
// plan?" without storing tokens, passwords or file contents. Each account keeps
// the latest events; the file is written atomically like the rest of the state.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,atomic} from './core.mjs';

const FILE=process.env.STUDIO_AUDIT_FILE?path.resolve(ROOT,process.env.STUDIO_AUDIT_FILE):path.join(ROOT,'data','audit.json');
const MAX_EVENTS=200;
let queue=Promise.resolve();

async function read(){
  try{
    const value=JSON.parse(await fs.readFile(FILE,'utf8'));
    return {users:value.users&&typeof value.users==='object'?value.users:{}};
  }catch(error){
    if(error.code==='ENOENT')return {users:{}};
    throw error;
  }
}

function mutate(change){
  const task=queue.then(async()=>{
    const data=await read();
    const result=await change(data);
    await fs.mkdir(path.dirname(FILE),{recursive:true});
    await atomic(FILE,data);
    return result;
  });
  queue=task.catch(()=>{});
  return task;
}

export async function recordActivity(userId,action,detail='',meta={}){
  if(!userId)return;
  return mutate(data=>{
    const events=Array.isArray(data.users[userId])?data.users[userId]:[];
    events.unshift({
      at:new Date().toISOString(),
      action:String(action||'event').slice(0,40),
      detail:String(detail||'').slice(0,300),
      ip:String(meta.ip||'').slice(0,80),
    });
    data.users[userId]=events.slice(0,MAX_EVENTS);
  });
}

// Deleting an account must not leave its history behind.
export async function clearActivity(userId){
  if(!userId)return;
  return mutate(data=>{delete data.users[userId];});
}

export async function listActivity(userId,limit=20){
  if(!userId)return [];
  const events=(await read()).users[userId];
  return Array.isArray(events)?events.slice(0,Math.max(1,Math.min(Number(limit)||20,100))):[];
}
