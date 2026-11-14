// Network layer for the media library: polite, bounded and SSRF-safe.
// API calls name their own host; downloads may reach any PUBLIC https host (providers
// serve files from CDNs) but never localhost, private ranges or credentialed URLs.
import dns from 'node:dns/promises';
import net from 'node:net';

// Plain ASCII on purpose: providers' firewalls (Openverse) reject accents and odd characters in this header.
export const USER_AGENT='EliteEditor/0.1 (local video editor; https://github.com/nachoweb3/elite-editor)';

const last=new Map();
/** Spaces calls to the same key by at least `ms` milliseconds. */
export async function throttle(key,ms){
 if(!ms)return;
 const now=Date.now(),at=Math.max(now,(last.get(key)||0)+ms);
 last.set(key,at);
 if(at>now)await new Promise(resolve=>setTimeout(resolve,at-now));
}

export function isPrivateAddress(address){
 const ip=String(address).toLowerCase();
 if(net.isIPv4(ip)){
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||a>=224;
 }
 if(net.isIPv6(ip)){
  if(ip==='::'||ip==='::1')return true;
  const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if(mapped)return isPrivateAddress(mapped[1]);
  return /^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||ip.startsWith('ff');
 }
 return true;
}

export async function assertPublicHttps(raw){
 let url;try{url=new URL(raw);}catch{throw new Error('URL no válida');}
 if(url.protocol!=='https:')throw new Error('Solo se permiten URL https');
 if(url.username||url.password)throw new Error('URL con credenciales rechazada');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(net.isIP(host)){if(isPrivateAddress(host))throw new Error('Dirección privada rechazada');return url;}
 if(/^localhost$|\.localhost$|\.local$|\.internal$|\.lan$/i.test(host))throw new Error('Host local rechazado');
 const addresses=await dns.lookup(host,{all:true}).catch(()=>{throw new Error('No se pudo resolver '+host);});
 if(!addresses.length||addresses.some(a=>isPrivateAddress(a.address)))throw new Error('El host resuelve a una dirección privada');
 return url;
}

async function request(raw,{headers={},timeout=20000,signal,redirects=4,hosts}={}){
 let current=raw;
 for(let hop=0;hop<=redirects;hop++){
  const url=await assertPublicHttps(current);
  if(hosts&&!hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw new Error(`Host no permitido para esta llamada: ${url.hostname}`);
  const timer=AbortSignal.timeout(timeout),combined=signal?AbortSignal.any([timer,signal]):timer;
  const response=await fetch(url,{headers:{'User-Agent':USER_AGENT,...headers},redirect:'manual',signal:combined});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');if(!location)throw new Error('Redirección sin destino');
   current=new URL(location,url).href;continue;
  }
  return response;
 }
 throw new Error('Demasiadas redirecciones');
}

export async function getJson(url,{host,minInterval=0,headers={},timeout=20000,signal,hosts}={}){
 await throttle(host||new URL(url).hostname,minInterval);
 const response=await request(url,{headers:{Accept:'application/json',...headers},timeout,signal,hosts:hosts||(host?[host]:undefined)});
 if(response.status===401||response.status===403)throw new Error('El proveedor rechazó la clave o el acceso ('+response.status+')');
 if(response.status===429)throw new Error('Límite de peticiones del proveedor alcanzado; espera un poco');
 if(!response.ok)throw new Error('El proveedor respondió HTTP '+response.status);
 try{return await response.json();}catch{throw new Error('Respuesta del proveedor no válida');}
}

/** Downloads at most `maxBytes`, reading as a stream so a huge file never fills memory. */
export async function fetchBytes(url,{maxBytes=50*1024*1024,accept,timeout=120000,signal,headers={},minInterval=0,host}={}){
 await throttle(host||new URL(url).hostname,minInterval);
 const response=await request(url,{headers,timeout,signal});
 if(!response.ok)throw new Error('La descarga respondió HTTP '+response.status);
 const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(accept&&type&&!accept.test(type)&&type!=='application/octet-stream')throw new Error('Tipo de archivo inesperado: '+type);
 const declared=Number(response.headers.get('content-length'));
 if(declared&&declared>maxBytes)throw new Error(`El archivo (${Math.round(declared/1048576)} MB) supera el límite de ${Math.round(maxBytes/1048576)} MB`);
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw new Error(`La descarga supera el límite de ${Math.round(maxBytes/1048576)} MB`);chunks.push(chunk);}
 return {buffer:Buffer.concat(chunks),type,url:response.url||url};
}
