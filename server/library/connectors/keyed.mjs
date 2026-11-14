// Connectors that need the user's own API key (free to obtain). Keys never leave the
// local backend; they are read from the environment or config/library-keys.local.json.
import {getJson} from '../net.mjs';
import {result} from './open.mjs';

const MB=1024*1024;
const deps={getJson};
const need=(keys,name)=>{if(!keys[name])throw new Error('Falta la clave de API de este proveedor');return keys[name];};

/* ---------------------------------- Pexels ---------------------------------- */
export const pexels={
 id:'pexels',name:'Pexels',tier:'primary',mode:'api',homepage:'https://www.pexels.com',
 kinds:['image','video'],formats:['jpg','mp4'],auth:{type:'key',keyName:'pexels',signup:'https://www.pexels.com/api/',note:'Clave gratuita'},attribution:'recommended',
 license:{summary:'Licencia de Pexels: uso libre, también comercial.',ids:['Pexels']},
 restrictions:['No vender copias sin modificar ni redistribuir como banco de recursos.','No sugerir que las personas que aparecen respaldan tu producto.','La API pide enlazar al autor cuando sea razonable.'],
 limits:{perHour:200,perMonth:20000,note:'200 peticiones por hora y 20 000 al mes en la clave gratuita.'},
 async search({query,english,kind,page=1,perPage=18,keys},d=deps){
  const auth={Authorization:need(keys,'pexels')},q=english||query,out=[];
  if(kind!=='video'){
   const json=await d.getJson(`https://api.pexels.com/v1/search?${new URLSearchParams({query:q,page:String(page),per_page:String(kind==='image'?perPage:Math.ceil(perPage/2)),locale:'es-ES'})}`,{host:'api.pexels.com',headers:auth,minInterval:400});
   for(const p of json.photos||[])out.push(result(pexels,{sourceId:`photo:${p.id}`,kind:'image',title:p.alt||`Foto ${p.id}`,author:p.photographer,authorUrl:p.photographer_url,sourceUrl:p.url,previewUrl:p.src?.medium,width:p.width,height:p.height,format:'jpg',tags:(p.alt||'').split(/\W+/).filter(w=>w.length>3),licenseId:'Pexels',
    _download:{url:p.src?.large2x||p.src?.original,accept:/^image\//,maxBytes:40*MB,host:'images.pexels.com'}}));
  }
  if(kind!=='image'){
   const json=await d.getJson(`https://api.pexels.com/videos/search?${new URLSearchParams({query:q,page:String(page),per_page:String(kind==='video'?perPage:Math.ceil(perPage/2)),locale:'es-ES'})}`,{host:'api.pexels.com',headers:auth,minInterval:400});
   for(const v of json.videos||[]){
    const files=(v.video_files||[]).filter(f=>f.file_type==='video/mp4'&&f.width&&f.width<=1920).sort((a,b)=>b.width-a.width),best=files[0];
    if(!best)continue;
    out.push(result(pexels,{sourceId:`video:${v.id}`,kind:'video',title:`Vídeo ${v.id} · ${(v.url||'').split('/').filter(Boolean).at(-1)?.replace(/-\d+$/,'').replace(/-/g,' ')||''}`.trim(),author:v.user?.name,authorUrl:v.user?.url,sourceUrl:v.url,previewUrl:v.image,width:best.width,height:best.height,duration:v.duration,format:'mp4',licenseId:'Pexels',
     tags:(v.url||'').split('/').filter(Boolean).at(-1)?.split('-').filter(w=>w.length>3&&!/^\d+$/.test(w))||[],_download:{url:best.link,accept:/^video\//,maxBytes:300*MB,host:'videos.pexels.com'}}));
   }
  }
  return {items:out,total:out.length};
 },
};

/* ---------------------------------- Pixabay --------------------------------- */
export const pixabay={
 id:'pixabay',name:'Pixabay',tier:'primary',mode:'api',homepage:'https://pixabay.com',
 kinds:['image','video'],formats:['jpg','png','svg','mp4'],auth:{type:'key',keyName:'pixabay',signup:'https://pixabay.com/api/docs/',note:'Clave gratuita'},attribution:'none',
 license:{summary:'Licencia de contenido de Pixabay: uso libre, también comercial, sin atribución obligatoria.',ids:['Pixabay']},
 restrictions:['No vender copias sin modificar ni redistribuir como banco de recursos.','La API exige descargar los archivos en lugar de enlazarlos de forma permanente (Elite los guarda en tu biblioteca).','La API de Pixabay no incluye música ni sonidos.'],
 limits:{perMinute:100,note:'100 peticiones cada 60 s; los resultados deben guardarse 24 h (Elite usa caché de sesión).'},
 async search({query,kind,page=1,perPage=18,keys},d=deps){
  const key=need(keys,'pixabay'),out=[],base={key,q:query,lang:'es',safesearch:'true',page:String(page)};
  if(kind!=='video'){
   const json=await d.getJson(`https://pixabay.com/api/?${new URLSearchParams({...base,image_type:'all',per_page:String(Math.max(3,kind==='image'?perPage:Math.ceil(perPage/2)))})}`,{host:'pixabay.com',minInterval:700});
   for(const h of json.hits||[])out.push(result(pixabay,{sourceId:`image:${h.id}`,kind:'image',title:(h.tags||'').split(',')[0]?.trim()||`Imagen ${h.id}`,author:h.user,authorUrl:`https://pixabay.com/users/${h.user}-${h.user_id}/`,sourceUrl:h.pageURL,previewUrl:h.webformatURL,width:h.imageWidth,height:h.imageHeight,format:h.type==='vector/svg'?'svg':'jpg',
    tags:(h.tags||'').split(',').map(t=>t.trim()),licenseId:'Pixabay',_download:{url:h.largeImageURL||h.webformatURL,accept:/^image\//,maxBytes:40*MB,host:'pixabay.com'}}));
  }
  if(kind!=='image'){
   const json=await d.getJson(`https://pixabay.com/api/videos/?${new URLSearchParams({...base,per_page:String(Math.max(3,kind==='video'?perPage:Math.ceil(perPage/2)))})}`,{host:'pixabay.com',minInterval:700});
   for(const h of json.hits||[]){
    const file=h.videos?.large?.url?h.videos.large:h.videos?.medium;if(!file?.url)continue;
    out.push(result(pixabay,{sourceId:`video:${h.id}`,kind:'video',title:(h.tags||'').split(',')[0]?.trim()||`Vídeo ${h.id}`,author:h.user,authorUrl:`https://pixabay.com/users/${h.user}-${h.user_id}/`,sourceUrl:h.pageURL,
     previewUrl:h.picture_id?`https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`:'',width:file.width,height:file.height,duration:h.duration,format:'mp4',tags:(h.tags||'').split(',').map(t=>t.trim()),licenseId:'Pixabay',
     _download:{url:file.url,accept:/^video\//,maxBytes:300*MB,host:'cdn.pixabay.com'}}));
   }
  }
  return {items:out,total:out.length};
 },
};

/* --------------------------------- Freesound -------------------------------- */
export const freesound={
 id:'freesound',name:'Freesound',tier:'primary',mode:'api',homepage:'https://freesound.org',
 kinds:['audio'],formats:['mp3'],auth:{type:'key',keyName:'freesound',signup:'https://freesound.org/apiv2/apply/',note:'Token de API gratuito'},attribution:'per-item',
 license:{summary:'Cada sonido declara su licencia: CC0, CC BY o CC BY-NC.'},
 restrictions:['Respeta la licencia de cada sonido: CC BY exige atribución y CC BY-NC prohíbe el uso comercial.','Con un token solo se descarga la vista previa de alta calidad (MP3); el original requiere OAuth2.'],
 limits:{perMinute:60,perDay:2000,note:'60 peticiones por minuto y 2000 al día con un token.'},
 async search({query,english,page=1,perPage=18,keys},d=deps){
  const token=need(keys,'freesound'),json=await d.getJson(`https://freesound.org/apiv2/search/text/?${new URLSearchParams({query:english||query,page:String(page),page_size:String(perPage),fields:'id,name,tags,username,license,previews,duration,url,filesize',token})}`,{host:'freesound.org',minInterval:1000});
  const {normalizeLicense}=await import('../licenses.mjs');
  const items=(json.results||[]).map(s=>{
   const preview=s.previews?.['preview-hq-mp3']||s.previews?.['preview-lq-mp3'];
   return result(freesound,{sourceId:String(s.id),kind:'audio',title:s.name,author:s.username,authorUrl:`https://freesound.org/people/${encodeURIComponent(s.username)}/`,sourceUrl:s.url,audioUrl:preview,duration:s.duration,format:'mp3',tags:s.tags,
    licenseId:normalizeLicense('',{url:s.license}),canDownload:!!preview,_download:preview&&{url:preview,accept:/^(audio|application\/octet)/,maxBytes:30*MB,host:'cdn.freesound.org'}});
  });
  return {items,total:json.count||items.length};
 },
};

/* ---------------------------------- GIPHY ----------------------------------- */
export const giphy={
 id:'giphy',name:'GIPHY',tier:'primary',mode:'api',homepage:'https://giphy.com',
 kinds:['image','video'],formats:['gif','mp4'],auth:{type:'key',keyName:'giphy',signup:'https://developers.giphy.com/',note:'Clave de desarrollador gratuita'},attribution:'required',
 license:{summary:'Los GIF pertenecen a sus autores y se sirven bajo las condiciones de GIPHY.',ids:['GIPHY']},
 restrictions:['Muestra «Powered by GIPHY» y respeta los derechos de cada autor.','El uso comercial no está garantizado: revisa los derechos antes de publicar.','No redistribuyas los archivos fuera de tu proyecto.'],
 requiresAck:'Los GIF de GIPHY tienen derechos de terceros. Se guardarán solo en tu biblioteca local para tu edición. ¿Aceptas usarlos bajo tu responsabilidad?',
 credit:'Powered by GIPHY',
 limits:{perHour:100,perDay:1000,note:'Clave beta: 100 peticiones por hora y 1000 al día.'},
 async search({query,kind,page=1,perPage=18,keys},d=deps){
  const api=need(keys,'giphy'),per=Math.min(perPage,24),offset=(page-1)*per;
  const json=await d.getJson(`https://api.giphy.com/v1/gifs/search?${new URLSearchParams({api_key:api,q:query,limit:String(per),offset:String(offset),rating:'g',lang:'es'})}`,{host:'api.giphy.com',minInterval:500});
  const items=(json.data||[]).map(g=>{
   const images=g.images||{},mp4=images.original_mp4?.mp4,original=images.original||{},wantVideo=kind==='video'&&mp4;
   return result(giphy,{sourceId:g.id,kind:wantVideo?'video':'image',title:g.title||`GIF ${g.id}`,author:g.user?.display_name||g.username,authorUrl:g.user?.profile_url||'',sourceUrl:g.url,previewUrl:images.fixed_width_small?.url||images.fixed_width?.url,
   width:Number(original.width)||0,height:Number(original.height)||0,format:wantVideo?'mp4':'gif',tags:(g.title||'').split(/\W+/).filter(w=>w.length>3),licenseId:'GIPHY',
   _download:wantVideo?{url:mp4,accept:/^video\//,maxBytes:30*MB,host:'giphy.com'}:{url:original.url,accept:/^image\//,maxBytes:30*MB,host:'giphy.com'}});
  });
  return {items,total:json.pagination?.total_count||items.length};
 },
};

/* ------------------------------- Google Fonts ------------------------------- */
let fontCache=null;
export const googlefonts={
 id:'googlefonts',name:'Google Fonts',tier:'secondary',mode:'api',homepage:'https://fonts.google.com',
 kinds:['font'],formats:['ttf'],auth:{type:'key',keyName:'googlefonts',signup:'https://developers.google.com/fonts/docs/developer_api',note:'Clave gratuita de la API de Fonts'},attribution:'none',
 license:{summary:'Casi todas bajo SIL Open Font License; algunas Apache 2.0 o Ubuntu Font License.',ids:['OFL-1.1']},
 restrictions:['Las fuentes OFL no se pueden vender por sí solas; sí se pueden usar en vídeos comerciales.','Comprueba la licencia en la página de cada familia.'],
 limits:{note:'El catálogo completo se guarda 6 h en memoria.'},
 async search({query,english,page=1,perPage=18,keys},d=deps){
  if(!fontCache||Date.now()-fontCache.at>6*3600_000){
   const json=await d.getJson(`https://www.googleapis.com/webfonts/v1/webfonts?${new URLSearchParams({key:need(keys,'googlefonts'),sort:'popularity'})}`,{host:'www.googleapis.com',minInterval:500});
   fontCache={at:Date.now(),list:json.items||[]};
  }
  const terms=(english||query).toLowerCase().split(/\s+/).filter(Boolean).map(t=>({handwriting:'handwriting',script:'handwriting',monospace:'monospace',mono:'monospace',serif:'serif',display:'display'}[t]||t));
  const matches=fontCache.list.filter(f=>terms.every(t=>`${f.family} ${f.category}`.toLowerCase().includes(t)));
  const start=(page-1)*perPage;
  const items=matches.slice(start,start+perPage).map(f=>{
   const file=(f.files?.regular||Object.values(f.files||{})[0])?.replace(/^http:/,'https:');
   return result(googlefonts,{sourceId:f.family,kind:'font',title:f.family,author:'Google Fonts',authorUrl:'https://fonts.google.com',sourceUrl:`https://fonts.google.com/specimen/${encodeURIComponent(f.family)}`,fontUrl:file,format:'ttf',tags:[f.category,...(f.subsets||[]).slice(0,4)],licenseId:'OFL-1.1',canDownload:!!file,
    _download:file&&{url:file,accept:/^(font|application\/(octet-stream|x-font|font))/,maxBytes:8*MB,host:'fonts.gstatic.com'}});
  });
  return {items,total:matches.length};
 },
};

export const KEYED_CONNECTORS=[pexels,pixabay,freesound,giphy,googlefonts];
