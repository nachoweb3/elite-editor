// Connectors for open licences and documented public APIs (no key required).
import {getJson} from '../net.mjs';
import {licenseRecord,normalizeLicense,attributionLine} from '../licenses.mjs';

const MB=1024*1024;
const strip=html=>String(html||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const deps={getJson};
const kindOf=mime=>/^image\//.test(mime)?'image':/^audio\//.test(mime)||mime==='application/ogg'?'audio':/^video\//.test(mime)?'video':'other';

export function result(connector,o){
 const license=licenseRecord(o.licenseId||'Unknown');
 const item={key:`${connector.id}:${o.sourceId}`,connector:connector.id,sourceId:String(o.sourceId),kind:o.kind,title:o.title||'Sin título',author:o.author||'',authorUrl:o.authorUrl||'',sourceUrl:o.sourceUrl||'',
  previewUrl:o.previewUrl||'',audioUrl:o.audioUrl||'',fontUrl:o.fontUrl||'',width:o.width||0,height:o.height||0,duration:o.duration||0,format:o.format||'',size:o.size||0,
  tags:(o.tags||[]).map(String).filter(Boolean).slice(0,24),license,canDownload:o.canDownload!==false,note:o.note||'',_download:o._download};
 item.attribution=attributionLine({title:item.title,author:item.author,license,connectorName:connector.name,sourceUrl:item.sourceUrl});
 return item;
}

/* -------------------------------- Openverse -------------------------------- */
export const openverse={
 id:'openverse',name:'Openverse',tier:'primary',mode:'api',homepage:'https://openverse.org',
 kinds:['image','audio'],formats:['jpg','png','gif','svg','mp3','ogg','wav'],
 auth:{type:'none'},attribution:'per-item',
 license:{summary:'Creative Commons y dominio público; cada obra declara su licencia.'},
 restrictions:['Respeta CC BY (atribución), SA (misma licencia), NC (sin uso comercial) y ND (sin modificar).','Se excluye el contenido marcado como sensible.'],
 limits:{note:'Acceso anónimo con tasa limitada. Elite espacia las llamadas y guarda las búsquedas 10 min.'},
 async search({query,english,kind,page=1,perPage=18},d=deps){
  const q=english||query,kinds=kind==='image'?['image']:kind==='audio'?['audio']:['image','audio'];
  const per=Math.max(4,Math.ceil(perPage/kinds.length)),out=[];
  const lists=await Promise.all(kinds.map(k=>d.getJson(`https://api.openverse.org/v1/${k==='image'?'images':'audio'}/?${new URLSearchParams({q,page:String(page),page_size:String(per),mature:'false'})}`,{host:'api.openverse.org',minInterval:250}).then(json=>({k,json}))));
  for(const {k,json} of lists)for(const r of json.results||[]){
   if(!r.url)continue;
   const licenseId=normalizeLicense(`${r.license} ${r.license_version||''}`,{url:r.license_url});
   out.push(result(openverse,{sourceId:r.id,kind:k,title:r.title,author:r.creator,authorUrl:r.creator_url,sourceUrl:r.foreign_landing_url,previewUrl:k==='image'?(r.thumbnail||r.url):(r.thumbnail||''),audioUrl:k==='audio'?r.url:'',
    width:r.width,height:r.height,duration:r.duration?r.duration/1000:0,format:r.filetype||'',size:r.filesize||0,tags:(r.tags||[]).map(t=>t.name),licenseId,
    _download:{url:r.url,accept:k==='image'?/^image\//:/^(audio|application\/ogg)/,maxBytes:(k==='image'?40:60)*MB,host:new URL(r.url).hostname}}));
  }
  return {items:out,total:lists.reduce((n,l)=>n+(l.json.result_count||0),0)};
 },
};

/* ----------------------------- Wikimedia Commons ---------------------------- */
export const commons={
 id:'commons',name:'Wikimedia Commons',tier:'primary',mode:'api',homepage:'https://commons.wikimedia.org',
 kinds:['image','audio','video'],formats:['jpg','png','svg','gif','webp','ogg','webm','wav'],
 auth:{type:'none'},attribution:'per-item',
 license:{summary:'Obras libres (CC, dominio público). Solo se ofrecen las que declaran una licencia reconocida.'},
 restrictions:['La mayoría pide atribución del autor y la licencia (CC BY / CC BY-SA).','Las imágenes de personas o marcas pueden tener derechos de imagen o marca aparte.'],
 limits:{note:'Sigue la política de la API de Wikimedia: User-Agent propio y llamadas en serie.'},
 async search({query,english,kind,page=1,perPage=18},d=deps){
  const q=english||query,types=kind==='audio'?['audio']:kind==='video'?['video']:kind==='image'?['bitmap','drawing']:['bitmap','audio','video'];
  const per=Math.max(4,Math.ceil(perPage/types.length)),out=[];
  // One request per file type, in parallel (the shared throttle still spaces them 300 ms apart).
  const responses=await Promise.all(types.map(async type=>{
   const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:`filetype:${type} ${q}`,gsrnamespace:'6',gsrlimit:String(per),gsroffset:String((page-1)*per),prop:'imageinfo',
    iiprop:'url|size|mime|extmetadata',iiurlwidth:'360',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|ImageDescription'});
   return d.getJson(`https://commons.wikimedia.org/w/api.php?${params}`,{host:'commons.wikimedia.org',minInterval:300});
  }));
  for(const json of responses){
   const pages=Object.values(json.query?.pages||{}).sort((a,b)=>a.index-b.index);
   for(const p of pages){
    const info=p.imageinfo?.[0];if(!info)continue;
    const meta=info.extmetadata||{},licenseId=normalizeLicense(meta.LicenseShortName?.value,{url:meta.LicenseUrl?.value});
    if(licenseId==='Unknown')continue;
    const k=kindOf(info.mime);if(k==='other')continue;
    const name=p.title.replace(/^File:/,''),big=k==='image'&&info.mime!=='image/svg+xml'&&(info.size>20*MB||info.width>3840);
    out.push(result(commons,{sourceId:String(p.pageid),kind:k,title:name.replace(/\.[a-z0-9]+$/i,'').replace(/_/g,' '),author:strip(meta.Artist?.value),sourceUrl:info.descriptionurl,
     previewUrl:k==='image'?(info.thumburl||''):'',audioUrl:k==='audio'?info.url:'',width:info.width,height:info.height,format:(info.mime||'').split('/')[1]||'',size:info.size,
     tags:strip(meta.ImageDescription?.value).split(/\W+/).filter(w=>w.length>3).slice(0,8),licenseId,
     _download:{url:big?`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=2560`:info.url,accept:/^(image|audio|video|application\/ogg)/,maxBytes:(k==='video'?200:60)*MB,host:'upload.wikimedia.org'}}));
   }
  }
  return {items:out,total:out.length};
 },
};

/* --------------------------------- ambientCG -------------------------------- */
export const ambientcg={
 id:'ambientcg',name:'ambientCG',tier:'primary',mode:'api',homepage:'https://ambientcg.com',
 kinds:['texture'],formats:['jpg'],auth:{type:'none'},attribution:'none',
 license:{summary:'CC0 1.0: uso libre, también comercial, sin atribución.',ids:['CC0-1.0']},
 restrictions:['Se descarga el mapa de color a 1K; los mapas PBR completos están en la web de ambientCG.'],
 limits:{note:'API pública documentada; Elite espacia las llamadas.'},
 async search({query,english,page=1,perPage=18},d=deps){
  const params=new URLSearchParams({type:'Material',q:english||query,limit:String(perPage),offset:String((page-1)*perPage),sort:'Popular',include:'downloadData,imageData'});
  const json=await d.getJson(`https://ambientcg.com/api/v2/full_json?${params}`,{host:'ambientcg.com',minInterval:300});
  const items=(json.foundAssets||[]).map(a=>{
   const downloads=a.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads||[],zip=downloads.find(x=>x.attribute==='1K-JPG')||downloads.find(x=>/^1K/.test(x.attribute));
   const preview=a.previewImage||{};
   return result(ambientcg,{sourceId:a.assetId,kind:'texture',title:a.displayName||a.assetId,author:'ambientCG',authorUrl:'https://ambientcg.com',sourceUrl:a.shortLink||`https://ambientcg.com/view?id=${a.assetId}`,
    previewUrl:preview['256-PNG']||preview['512-JPG-242424']||'',tags:[...(a.tags||[]),a.category].filter(Boolean),licenseId:'CC0-1.0',format:'jpg',size:zip?.size||0,canDownload:!!zip,
    _download:zip&&{url:zip.downloadLink||zip.fullDownloadPath,accept:/^(application\/zip|application\/x-zip|application\/octet-stream)/,maxBytes:80*MB,host:'ambientcg.com',
     extract:entries=>entries.find(e=>/_Color\.(jpg|png)$/i.test(e.name))||entries.find(e=>/\.(jpg|png)$/i.test(e.name)&&!/normal|rough|displace|ambient|metal|opacity/i.test(e.name))}});
  });
  return {items,total:json.numberOfResults||items.length};
 },
};

/* --------------------------------- Poly Haven -------------------------------- */
let polyCache=null;
async function polyList(type,d){
 const cached=polyCache?.get(type);if(cached&&Date.now()-cached.at<3600_000)return cached.list;
 const json=await d.getJson(`https://api.polyhaven.com/assets?type=${type}`,{host:'api.polyhaven.com',minInterval:300});
 const list=Object.entries(json).map(([id,a])=>({id,...a}));
 (polyCache??=new Map()).set(type,{at:Date.now(),list});return list;
}
export const polyhaven={
 id:'polyhaven',name:'Poly Haven',tier:'primary',mode:'api',homepage:'https://polyhaven.com',
 kinds:['texture','image'],formats:['jpg'],auth:{type:'none'},attribution:'none',credit:'Powered by Poly Haven',
 license:{summary:'CC0 1.0: uso libre, también comercial, sin atribución para los archivos descargados.',ids:['CC0-1.0']},
 restrictions:['Condiciones de la API: User-Agent propio y mostrar visiblemente «Powered by Poly Haven» donde se muestre su contenido.','Texturas a 2K (mapa de color) y HDRI como fondo en JPG.'],
 limits:{note:'API pública sin clave. El catálogo se guarda 1 h en memoria.'},
 async search({query,english,kind,page=1,perPage=18},d=deps){
  const types=kind==='texture'?['textures']:kind==='image'?['hdris']:['textures','hdris'],terms=(english||query).toLowerCase().split(/\s+/).filter(Boolean),out=[];
  const lists=await Promise.all(types.map(type=>polyList(type,d).then(list=>[type,list])));
  for(const [type,list] of lists){
   for(const a of list){
    const hay=`${a.name} ${(a.tags||[]).join(' ')} ${(a.categories||[]).join(' ')}`.toLowerCase();
    if(terms.every(t=>hay.includes(t)))out.push(result(polyhaven,{sourceId:`${type}:${a.id}`,kind:type==='textures'?'texture':'image',title:a.name,author:Object.keys(a.authors||{}).join(', ')||'Poly Haven',authorUrl:'https://polyhaven.com',
     sourceUrl:`https://polyhaven.com/a/${a.id}`,previewUrl:`https://cdn.polyhaven.com/asset_img/thumbs/${a.id}.png?width=256&height=256`,tags:[...(a.tags||[]),...(a.categories||[]),type==='hdris'?'hdri fondo':''],licenseId:'CC0-1.0',format:'jpg',
     _download:{resolve:'polyhaven',assetId:a.id,type,maxBytes:40*MB,accept:/^image\//,host:'dl.polyhaven.org'}}));
   }
  }
  const start=(page-1)*perPage;return {items:out.slice(start,start+perPage),total:out.length};
 },
 async resolveDownload(item,d=deps){
  const files=await d.getJson(`https://api.polyhaven.com/files/${item._download.assetId}`,{host:'api.polyhaven.com',minInterval:300});
  const file=item._download.type==='hdris'?files.tonemapped:(files.Diffuse?.['2k']?.jpg||files.Diffuse?.['1k']?.jpg);
  if(!file?.url)throw new Error('Poly Haven no ofrece una versión JPG de este recurso');
  return {...item._download,url:file.url};
 },
};

export const OPEN_CONNECTORS=[openverse,commons,ambientcg,polyhaven];
