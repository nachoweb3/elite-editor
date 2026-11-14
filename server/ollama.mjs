// Single place for the local language model: address, model name and health.
// ELITE_OLLAMA_URL / ELITE_OLLAMA_MODEL override the defaults without touching code.
export const DEFAULT_MODEL='qwen3:4b-instruct-2507-q4_K_M';

export function ollamaUrl(){
 const raw=String(process.env.ELITE_OLLAMA_URL||'http://127.0.0.1:11434').trim().replace(/\/+$/,'');
 let u;try{u=new URL(/^https?:\/\//i.test(raw)?raw:'http://'+raw);}catch{return 'http://127.0.0.1:11434';}
 // 0.0.0.0 is a server bind address, not something a client can reach.
 if(u.hostname==='0.0.0.0')u.hostname='127.0.0.1';
 return u.origin;
}
export function ollamaModel(){return String(process.env.ELITE_OLLAMA_MODEL||'').trim()||DEFAULT_MODEL;}

let cached=null;
export async function ollamaStatus({fresh=false}={}){
 if(!fresh&&cached&&Date.now()-cached.at<15000)return cached.value;
 const model=ollamaModel();let value;
 try{
  const response=await fetch(ollamaUrl()+'/api/tags',{signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const models=((await response.json()).models||[]).map(m=>String(m.name));
  value={running:true,model,installed:models.includes(model),models:models.slice(0,30)};
 }catch(e){value={running:false,model,installed:false,models:[],error:String(e?.message||e).slice(0,200)};}
 cached={at:Date.now(),value};return value;
}

// Network failures are reported as `unreachable` so callers can fall back to local rules.
export class OllamaUnavailable extends Error{constructor(message){super(message);this.name='OllamaUnavailable';}}
export async function chat({model=ollamaModel(),format,options,messages,timeout=180000,signal}){
 let response;
 const timer=AbortSignal.timeout(timeout),combined=signal?AbortSignal.any([timer,signal]):timer;
 try{
  response=await fetch(ollamaUrl()+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,format,options,keep_alive:'5m',messages}),signal:combined});
 }catch(e){if(signal?.aborted)throw e;throw new OllamaUnavailable('El modelo local (Ollama) no responde en '+ollamaUrl());}
 if(response.status===404)throw new OllamaUnavailable(`El modelo ${model} no está instalado en Ollama. Ejecuta: ollama pull ${model}`);
 if(!response.ok)throw Error('El editor local no responde: '+response.status);
 const result=await response.json();
 return String(result.message?.content??'');
}
