import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {ROOT,atomic} from './core.mjs';

const scrypt=promisify(scryptCallback);
const DATA_FILE=process.env.STUDIO_ACCOUNTS_FILE?path.resolve(ROOT,process.env.STUDIO_ACCOUNTS_FILE):path.join(ROOT,'data','accounts.json');
const cookieName=process.env.STUDIO_SESSION_COOKIE;
const COOKIE=/^[A-Za-z0-9_]{8,48}$/.test(cookieName||'')?cookieName:'nw_session';
const SESSION_SECONDS=30*24*60*60;
const MAX_SESSIONS=8;
const ATTEMPT_LIMIT=10;
const ATTEMPT_WINDOW_MS=15*60*1000;
// A fixed salt lets an unknown email spend the same scrypt time as a real one,
// so response time does not reveal whether the account exists.
const DUMMY_SALT='6f1e2d3c4b5a69788796a5b4c3d2e1f0';
let queue=Promise.resolve();

const clean=value=>String(value||'').trim();
const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
const hashToken=token=>createHash('sha256').update(String(token)).digest('hex');
const safeEqualHex=(left,right)=>{try{const a=Buffer.from(String(left),'hex'),b=Buffer.from(String(right),'hex');return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);}catch{return false;}};
const publicUser=user=>({id:user.id,name:user.name,email:user.email,role:user.role,plan:user.plan,createdAt:user.createdAt});

function deviceName(userAgent){
  const source=String(userAgent||'');
  if(!source)return 'Cliente de API';
  const os=/Windows NT/.test(source)?'Windows':/iPhone|iPad|iPod/.test(source)?'iOS':/Macintosh|Mac OS X/.test(source)?'macOS':/Android/.test(source)?'Android':/Linux/.test(source)?'Linux':'Dispositivo';
  const browser=/Edg\//.test(source)?'Edge':/OPR\//.test(source)?'Opera':/Firefox\//.test(source)?'Firefox':/Chrome\//.test(source)?'Chrome':/Safari\//.test(source)?'Safari':'Navegador';
  return `${browser} · ${os}`;
}

async function read(){
  try{
    const value=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));
    const sessions=(Array.isArray(value.sessions)?value.sessions:[]).map(session=>({...session,id:session.id||String(session.tokenHash||'').slice(0,16)}));
    return {users:Array.isArray(value.users)?value.users:[],sessions,attempts:value.attempts&&typeof value.attempts==='object'?value.attempts:{}};
  }catch(error){
    if(error.code==='ENOENT')return {users:[],sessions:[],attempts:{}};
    throw error;
  }
}

async function write(data){
  await fs.mkdir(path.dirname(DATA_FILE),{recursive:true});
  await atomic(DATA_FILE,data);
}

function mutate(change){
  const task=queue.then(async()=>{
    const data=await read();
    const result=await change(data);
    await write(data);
    return result;
  });
  queue=task.catch(()=>{});
  return task;
}

// Old or abandoned records would otherwise grow forever; only active locks
// matter, and the table is capped so a flood of emails cannot bloat the file.
function pruneAttempts(data,now){
  if(!data.attempts)return;
  for(const [key,value] of Object.entries(data.attempts))if(!value||Number(value.until)<=now)delete data.attempts[key];
  const keys=Object.keys(data.attempts);
  if(keys.length>500)for(const key of keys.slice(0,keys.length-500))delete data.attempts[key];
}

function createSession(data,userId,meta={}){
  const token=randomBytes(32).toString('base64url');
  const now=Date.now(),createdAt=new Date(now).toISOString();
  data.sessions=data.sessions.filter(session=>session.expiresAt>now);
  data.sessions.push({
    id:randomUUID(),
    tokenHash:hashToken(token),
    userId,
    createdAt,
    lastSeenAt:createdAt,
    userAgent:String(meta.userAgent||'').slice(0,300),
    ip:String(meta.ip||'').slice(0,80),
    expiresAt:now+SESSION_SECONDS*1000,
  });
  const owned=data.sessions.filter(session=>session.userId===userId);
  if(owned.length>MAX_SESSIONS){
    const drop=new Set(owned.slice(0,owned.length-MAX_SESSIONS).map(session=>session.tokenHash));
    data.sessions=data.sessions.filter(session=>!drop.has(session.tokenHash));
  }
  return {token,expiresAt:now+SESSION_SECONDS*1000};
}

function cookieToken(req){
  const cookies=String(req.headers.cookie||'').split(';');
  for(const cookie of cookies){
    const index=cookie.indexOf('=');
    if(index>0&&cookie.slice(0,index).trim()===COOKIE)return decodeURIComponent(cookie.slice(index+1));
  }
  return '';
}

function requestToken(req){
  const header=clean(req.headers['x-studio-token']);
  if(header)return header;
  const authorization=clean(req.headers.authorization);
  if(authorization.toLowerCase().startsWith('bearer '))return authorization.slice(7).trim();
  return cookieToken(req);
}

export function sessionCookie(token,secure=false){
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure?'; Secure':''}`;
}

export function clearSessionCookie(secure=false){
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;
}

export function isSecureRequest(req){
  return req.socket?.encrypted===true || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
}

export async function resolveSession(req){
  const token=requestToken(req);
  if(!token)return null;
  const data=await read();
  const session=data.sessions.find(item=>item.tokenHash===hashToken(token) && item.expiresAt>Date.now());
  if(!session)return null;
  const user=data.users.find(item=>item.id===session.userId);
  if(!user)return null;
  // Writing "last seen" on every request would turn a read into a disk write;
  // once every five minutes is enough to show real activity in the panel.
  const now=Date.now(),last=Date.parse(session.lastSeenAt||session.createdAt||0);
  if(now-last>5*60*1000){
    const id=session.id;
    void mutate(current=>{const item=current.sessions.find(s=>s.id===id);if(item)item.lastSeenAt=new Date(now).toISOString();}).catch(()=>{});
  }
  return {user:publicUser(user),token,sessionId:session.id};
}

export async function registrationOpen(){
  return process.env.STUDIO_REGISTRATION!=='closed';
}

export async function userCount(){
  return (await read()).users.length;
}

export async function register({name,email,password}={},meta={}){
  const displayName=clean(name).slice(0,80);
  const address=clean(email).toLowerCase().slice(0,180);
  if(!(await registrationOpen()))fail('El registro está cerrado en esta instalación',403);
  if(displayName.length<2)fail('Escribe tu nombre (2 caracteres o más)');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))fail('Escribe un correo válido');
  if(typeof password!=='string'||password.length<8||password.length>200)fail('La contraseña debe tener entre 8 y 200 caracteres');
  return mutate(async data=>{
    if(data.users.some(user=>user.email===address))fail('Ya existe una cuenta con ese correo',409);
    const salt=randomBytes(16).toString('hex');
    const passwordHash=(await scrypt(password,salt,64)).toString('hex');
    const user={id:randomUUID(),name:displayName,email:address,passwordHash,salt,role:data.users.length?'member':'owner',plan:'free',createdAt:new Date().toISOString()};
    data.users.push(user);
    const session=createSession(data,user.id,meta);
    return {user:publicUser(user),token:session.token,first:data.users.length===1};
  });
}

export async function login({email,password}={},meta={}){
  const address=clean(email).toLowerCase().slice(0,180);
  if(!address||typeof password!=='string')fail('Correo o contraseña incorrectos',401);
  const now=Date.now();
  const data=await read();
  const record=data.attempts[address];
  if(record&&Number(record.until)>now&&Number(record.count)>=ATTEMPT_LIMIT){
    const wait=Math.max(1,Math.ceil((Number(record.until)-now)/1000));
    const error=new Error(`Demasiados intentos con este correo. Vuelve a intentarlo en ${Math.ceil(wait/60)} minutos.`);
    error.status=429;
    error.retryAfter=wait;
    throw error;
  }
  const user=data.users.find(item=>item.email===address);
  const salt=user?.salt||DUMMY_SALT;
  const computed=(await scrypt(password,salt,64)).toString('hex');
  const valid=user?safeEqualHex(user.passwordHash,computed):false;
  if(!valid){
    await mutate(current=>{
      current.attempts=current.attempts||{};
      const previous=current.attempts[address];
      const count=(previous&&Number(previous.until)>now?Number(previous.count):0)+1;
      current.attempts[address]={count,until:now+ATTEMPT_WINDOW_MS};
      pruneAttempts(current,now);
    });
    fail('Correo o contraseña incorrectos',401);
  }
  return mutate(async current=>{
    delete current.attempts[address];
    pruneAttempts(current,now);
    const fresh=current.users.find(item=>item.id===user.id);
    if(!fresh)fail('Cuenta no encontrada',401);
    const session=createSession(current,fresh.id,meta);
    return {user:publicUser(fresh),token:session.token};
  });
}

export async function logout(req){
  const token=requestToken(req);
  if(!token)return;
  await mutate(data=>{data.sessions=data.sessions.filter(session=>session.tokenHash!==hashToken(token));});
}

// Used by the account panel before sensitive operations. It does not create a
// session: the caller already has one.
export async function verifyCredentials(userId,password){
  if(typeof password!=='string'||!password)return false;
  const user=(await read()).users.find(item=>item.id===userId);
  if(!user)return false;
  return safeEqualHex(user.passwordHash,(await scrypt(password,user.salt,64)).toString('hex'));
}

// Changing the password revokes every other session but keeps the one making
// the request, so the editor does not lose the token it is already using.
export async function changePassword(userId,{currentPassword,password}={},keepToken=''){
  if(typeof password!=='string'||password.length<8||password.length>200)fail('La contraseña nueva debe tener entre 8 y 200 caracteres');
  if(!(await verifyCredentials(userId,currentPassword)))fail('La contraseña actual no es correcta',403);
  return mutate(async data=>{
    const user=data.users.find(item=>item.id===userId);
    if(!user)fail('Cuenta no encontrada',404);
    const salt=randomBytes(16).toString('hex');
    user.passwordHash=(await scrypt(password,salt,64)).toString('hex');
    user.salt=salt;
    const keep=hashToken(keepToken);
    const before=data.sessions.length;
    data.sessions=data.sessions.filter(session=>session.userId!==userId||session.tokenHash===keep);
    return {ok:true,revoked:before-data.sessions.length};
  });
}

export async function listSessions(userId,currentId=''){
  const data=await read(),now=Date.now();
  return data.sessions
    .filter(session=>session.userId===userId&&session.expiresAt>now)
    .sort((a,b)=>String(b.lastSeenAt||b.createdAt).localeCompare(String(a.lastSeenAt||a.createdAt)))
    .map(session=>({
      id:session.id,
      current:session.id===currentId,
      device:deviceName(session.userAgent),
      createdAt:session.createdAt,
      lastSeenAt:session.lastSeenAt||session.createdAt,
      ip:session.ip||'',
      expiresAt:new Date(session.expiresAt).toISOString(),
    }));
}

export async function revokeSession(userId,sessionId){
  return mutate(data=>{
    const before=data.sessions.length;
    data.sessions=data.sessions.filter(session=>!(session.userId===userId&&session.id===sessionId));
    return {revoked:before-data.sessions.length};
  });
}

export async function revokeOtherSessions(userId,keepId=''){
  return mutate(data=>{
    const before=data.sessions.length;
    data.sessions=data.sessions.filter(session=>session.userId!==userId||session.id===keepId);
    return {revoked:before-data.sessions.length};
  });
}

export async function revokeUserSessions(userId){
  return mutate(data=>{
    const before=data.sessions.length;
    data.sessions=data.sessions.filter(session=>session.userId!==userId);
    return {revoked:before-data.sessions.length};
  });
}

// Owner view: enough to administer plans and sessions, never the hashes.
export async function listAccounts(){
  const data=await read(),now=Date.now();
  return data.users
    .slice()
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(user=>({...publicUser(user),sessions:data.sessions.filter(session=>session.userId===user.id&&session.expiresAt>now).length}));
}

export async function setPlan(userId,plan){
  if(!['free','pro'].includes(plan))fail('Plan no válido: usa Gratis o Pro');
  return mutate(data=>{
    const user=data.users.find(item=>item.id===userId);
    if(!user)fail('Cuenta no encontrada',404);
    if(user.role==='owner')fail('El dueño de la instalación no tiene plan limitado',400);
    user.plan=plan;
    return publicUser(user);
  });
}

// The owner can unblock a member without email: a one-time temporary password
// is returned once, and every session of that account is closed.
export async function resetPassword(userId){
  return mutate(async data=>{
    const user=data.users.find(item=>item.id===userId);
    if(!user)fail('Cuenta no encontrada',404);
    const password=randomBytes(9).toString('base64url');
    const salt=randomBytes(16).toString('hex');
    user.passwordHash=(await scrypt(password,salt,64)).toString('hex');
    user.salt=salt;
    data.sessions=data.sessions.filter(session=>session.userId!==userId);
    return {user:publicUser(user),password};
  });
}

// Removes the account and its sessions. If the owner leaves and other accounts
// remain, the oldest one becomes the new owner so the studio keeps an
// unlimited administrator instead of staying headless.
export async function removeAccount(userId){
  return mutate(data=>{
    const index=data.users.findIndex(item=>item.id===userId);
    if(index<0)return {ok:true,promoted:null};
    const [removed]=data.users.splice(index,1);
    data.sessions=data.sessions.filter(session=>session.userId!==userId);
    let promoted=null;
    if(removed.role==='owner'&&data.users.length){
      const next=data.users.slice().sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      next.role='owner';
      promoted=publicUser(next);
    }
    return {ok:true,promoted};
  });
}
