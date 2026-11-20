import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import './auth.css';

type User={id:string;name:string;email:string;plan?:string;role?:string};
type AuthState={loading:boolean;authenticated:boolean;user?:User;token?:string;registrationOpen?:boolean;firstRun?:boolean;error?:string};

async function request<T>(url:string,data?:unknown):Promise<T>{
  const response=await fetch(url,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await response.json().catch(()=>({error:'Respuesta del servidor no válida'}));
  if(!response.ok)throw new Error(value.error||'No se pudo completar la operación');
  return value as T;
}

export function AuthGate({children}:{children:ReactNode}){
  const [auth,setAuth]=useState<AuthState>({loading:true,authenticated:false});
  const load=()=>{
    setAuth(current=>({...current,loading:true,error:''}));
    request<Omit<AuthState,'loading'>>('/api/session')
      .then(value=>setAuth({...value,loading:false}))
      .catch(error=>setAuth({loading:false,authenticated:false,error:error.message}));
  };
  useEffect(load,[]);
  if(auth.loading)return <div className="auth-loading"><span className="auth-mark" aria-hidden="true">E</span><p>Cargando tu estudio…</p></div>;
  if(!auth.authenticated)return <AuthScreen registrationOpen={auth.registrationOpen!==false} firstRun={!!auth.firstRun} error={auth.error} onAuthenticated={value=>setAuth({...value,loading:false,authenticated:true})} onRetry={load}/>;
  return <>{children}<AccountBar user={auth.user!} token={auth.token||''}/></>;
}

function AuthScreen({registrationOpen,firstRun,error,onAuthenticated,onRetry}:{registrationOpen:boolean;firstRun:boolean;error?:string;onAuthenticated:(value:{user:User;token:string})=>void;onRetry:()=>void}){
  const [mode,setMode]=useState<'login'|'register'>(firstRun?'register':'login');
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(error||'');
  useEffect(()=>{if(error)setMessage(error);},[error]);
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage('');
    try{
      const value=await request<{user:User;token:string}>(`/api/auth/${mode}`,mode==='register'?{name,email,password}:{email,password});
      onAuthenticated(value);
    }catch(reason){setMessage((reason as Error).message);}
    finally{setBusy(false);}
  }
  return <main className="auth-screen"><section className="auth-card">
    <header><span className="auth-mark" aria-hidden="true">E</span><div><p className="auth-kicker">ELITE EDITOR · ESTUDIO LOCAL</p><h1>{mode==='register'?(firstRun?'Crea tu estudio':'Crea otra cuenta'):'Vuelve a tu estudio'}</h1><p>{mode==='register'?'Una cuenta mantiene tus proyectos separados del resto.':'Tus proyectos y descargas siguen en este equipo.'}</p></div></header>
    {firstRun?<p className="auth-note">Esta es la primera cuenta: los proyectos que ya existen en este equipo se asignarán a ella. Después podrás crear cuentas separadas.</p>:null}
    <form onSubmit={submit}>
      {mode==='register'?<label>Nombre<input value={name} onChange={event=>setName(event.target.value)} autoComplete="name" maxLength={80} required placeholder="Cómo quieres que te llamemos"/></label>:null}
      <label>Correo<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" maxLength={180} required placeholder="tu@correo.com"/></label>
      <label>Contraseña<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete={mode==='register'?'new-password':'current-password'} minLength={8} maxLength={200} required placeholder="Mínimo 8 caracteres"/></label>
      {message?<div className="auth-error" role="alert">{message}{error?<button type="button" onClick={onRetry}>Reintentar</button>:null}</div>:null}
      <button className="auth-submit" type="submit" disabled={busy}>{busy?'Comprobando…':mode==='register'?'Crear cuenta y entrar':'Entrar'}</button>
    </form>
    {registrationOpen?<p className="auth-switch">{mode==='register'?'¿Ya tienes cuenta?':'¿Necesitas otra cuenta?'} <button type="button" onClick={()=>{setMode(mode==='register'?'login':'register');setMessage('');}}>{mode==='register'?'Entrar':'Crear una cuenta'}</button></p>:null}
    <footer>Los archivos se procesan en este equipo. No se envían a un servicio externo.</footer>
  </section></main>;
}

function AccountBar({user,token}:{user:User;token:string}){
  const [busy,setBusy]=useState(false),[open,setOpen]=useState(false);
  const dock=useRef<HTMLDivElement>(null);
  const initials=user.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'N';
  const plan=user.role==='owner'?'Dueño':user.plan==='pro'?'Pro':'Gratis';
  useEffect(()=>{
    if(!open)return;
    const close=(event:MouseEvent)=>{if(!dock.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('mousedown',close);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};
  },[open]);
  async function leave(){setBusy(true);try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Studio-Token':token}});location.reload();}catch{setBusy(false);}}
  return <div className="account-dock" ref={dock}>
    <button type="button" className="account-chip" aria-haspopup="menu" aria-expanded={open} title={`${user.name} · ${user.email}`} onClick={()=>setOpen(value=>!value)}>
      <span className="account-avatar" aria-hidden="true">{initials}</span>
      <span className="account-copy"><strong>{user.name}</strong><small>{plan}</small></span>
      <span className="account-chevron" aria-hidden="true">⌃</span>
    </button>
    {open?<div className="account-menu" role="menu" aria-label="Cuenta">
      <p>{user.email}</p>
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);const planEvent=new CustomEvent('nacho:plan',{cancelable:true});if(window.dispatchEvent(planEvent))location.href='/?plan=1';}}>Plan y cuenta</button>
      <button type="button" role="menuitem" disabled={busy} onClick={()=>void leave()}>{busy?'Saliendo…':'Cerrar sesión'}</button>
    </div>:null}
  </div>;
}
