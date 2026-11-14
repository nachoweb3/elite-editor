import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import assert from 'node:assert/strict';
// DOM test for the resource library panel and the creator tools. Network, editor and media pipeline are simulated.
const mocks={
 '@/components/ui/button':`import React from 'react';export const Button=({variant,size,...p})=>React.createElement('button',p);`,
 '@/components/ui/input':`import React from 'react';export const Input=({size,variant,containerClassName,...p})=>React.createElement('input',p);`,
 '@/editor/use-editor':`export const useEditor=s=>s?s(globalThis.editor):globalThis.editor;`,
 '@/media/processing':`export const processMediaAssets=async({files})=>globalThis.__process(files);`,
 '@/timeline/element-utils':`export const buildElementFromMedia=p=>({...p,type:p.mediaType,params:{}});`,
 '@/wasm':`export const mediaTimeFromSeconds=({seconds})=>Math.round(seconds*1000000);`,
};
const plugin={name:'adapter',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:mocks[a.path]??(()=>{throw Error('unmocked '+a.path)})(),loader:'js'}));}};
const views='vendor/opencut-classic/apps/web/src/components/editor/panels/assets/views/';
await build({entryPoints:{library:views+'library-panel.tsx',creator:views+'nacho-creator.tsx'},outdir:'cache/library-ui-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],plugins:[plugin]});
const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:5181'});
for(const k of ['window','document','HTMLElement','Event','MouseEvent','navigator'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let copied='';Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async t=>{copied=t;}},configurable:true});
// Fonts: the card loads each typeface through FontFace.
const faces=[],added=[];
globalThis.FontFace=class{constructor(name,source){this.name=name;this.source=source;faces.push(this);}async load(){return this;}};
dom.window.document.fonts={add:f=>added.push(f)};

/* ------------------------------ Fixture data ------------------------------ */
const lic=(id,extra={})=>({id,name:id,url:'',attribution:false,commercial:true,derivatives:true,shareAlike:false,redistribution:true,notes:'',...extra});
const CC0=lic('CC0-1.0',{name:'CC0 1.0 (dominio público)'}),CCBY=lic('CC-BY',{name:'CC BY',attribution:true}),NC=lic('CC-BY-NC',{name:'CC BY-NC',attribution:true,commercial:false,notes:'Solo uso no comercial.'});
const GIPHY=lic('GIPHY',{name:'Condiciones de GIPHY',attribution:true,commercial:false,redistribution:false});
const local=o=>({id:'loc',hash:'h',kind:'image',category:'Foto',title:'T',tags:[],size:2048,width:640,height:360,duration:0,hasAlpha:false,ext:'png',license:CC0,attribution:'',sources:[],generated:false,external:false,addedAt:1,url:'/api/library/file/loc',...o});
const L1=local({id:'loc-1',title:'Gota de lluvia',generated:true,sources:[{connector:'forge',sourceUrl:'',author:'Elite Editor',fetchedAt:''}]});
const L2=local({id:'loc-2',kind:'audio',category:'Ambiente',title:'Lluvia suave',ext:'wav',duration:4,width:0,height:0,license:CCBY,attribution:'«Lluvia suave» de Ana, CC BY'});
const L3=local({id:'loc-3',title:'Meme prueba',category:'Meme',license:NC});
const L4=local({id:'loc-4',title:'Foto enlazada',ext:'jpg',external:true,license:lic('Personal')});
const remote=o=>({key:'k',connector:'polyhaven',connectorName:'Poly Haven',sourceId:'1',kind:'image',title:'R',author:'Autor',authorUrl:'https://x.example/a',sourceUrl:'https://polyhaven.com/a/rain',previewUrl:'https://cdn.polyhaven.com/a.jpg',audioUrl:'',fontUrl:'',width:1024,height:512,duration:0,format:'jpg',size:0,tags:[],license:CC0,attribution:'',canDownload:true,note:'',owned:null,...o});
const R1=remote({key:'polyhaven:rain',title:'Rain forest HDRI',attribution:'«Rain forest HDRI» de Poly Haven, CC0 (https://polyhaven.com/a/rain)'});
const R2=remote({key:'giphy:1',connector:'giphy',connectorName:'GIPHY',title:'Gato bajo la lluvia',previewUrl:'https://media.giphy.com/1.gif',sourceUrl:'https://giphy.com/gifs/1',license:GIPHY,format:'gif'});
const R3=remote({key:'freesound:9',connector:'freesound',connectorName:'Freesound',kind:'audio',title:'Lluvia sobre tejado',previewUrl:'',audioUrl:'https://cdn.freesound.example/9.mp3',license:CCBY,duration:12,format:'mp3'});
const R4=remote({key:'fonts:rainy',connector:'fonts',connectorName:'Fuentes',kind:'font',title:'Rainy Sans',previewUrl:'',fontUrl:'https://fonts.example/rain.woff2',format:'woff2'});
const R5=remote({key:'pixabay:5',connector:'pixabay',connectorName:'Pixabay',title:'Charco',owned:'own-pix'});
const R6=remote({key:'lottie:6',connector:'lottie',connectorName:'LottieFiles',kind:'lottie',title:'Lluvia animada',previewUrl:'',canDownload:false,note:'Solo se puede descargar desde la web de LottieFiles.',sourceUrl:'javascript:alert(1)'});
const connectors=[
 {id:'pexels',name:'Pexels',tier:'primary',mode:'api',homepage:'https://www.pexels.com',kinds:['image','video'],formats:['jpg','mp4'],auth:{type:'key',keyName:'PEXELS_API_KEY',signup:'https://www.pexels.com/api/',note:'Gratis, 200 peticiones por hora.'},configured:false,attribution:'recommended',license:{summary:'Licencia de Pexels'},restrictions:['No vender copias sin modificar'],limits:{perHour:200}},
 {id:'polyhaven',name:'Poly Haven',tier:'primary',mode:'api',homepage:'https://polyhaven.com',kinds:['texture','image'],formats:['jpg','hdr'],auth:{type:'none'},configured:true,attribution:'none',license:{summary:'CC0'},restrictions:[],limits:{},credit:'Powered by Poly Haven'},
 {id:'giphy',name:'GIPHY',tier:'secondary',mode:'api',homepage:'https://giphy.com',kinds:['image'],formats:['gif'],auth:{type:'key',keyName:'GIPHY_API_KEY',signup:'https://developers.giphy.com/',note:''},configured:true,attribution:'required',license:{summary:'Condiciones de GIPHY'},restrictions:['Uso comercial no garantizado'],limits:{perDay:100},credit:'Powered by GIPHY',requiresAck:'Los GIF pertenecen a sus autores y su uso comercial no está garantizado. ¿Aceptas usarlo bajo tu responsabilidad?'},
 {id:'mixkit',name:'Mixkit',tier:'secondary',mode:'manual',homepage:'https://mixkit.co',kinds:['audio','video'],formats:['mp3','mp4'],auth:{type:'none'},configured:true,attribution:'none',license:{summary:'Licencia de Mixkit',ids:['Mixkit']},restrictions:['Revisa si es Restricted License'],limits:{},manual:{importHint:'Descarga el archivo en Mixkit y súbelo aquí.',licenseHint:'Confirma que el recurso usa la licencia Mixkit.',url:'https://mixkit.co/free-stock-music/'}},
];
const db={items:4,forge:[{id:'luts',title:'Looks de color (LUTs)',description:'Looks cinematográficos en formato .cube.',count:4,generated:false},{id:'icons',title:'Iconos y flechas',description:'Iconos vectoriales para tus vídeos.',count:20,generated:true}]};
const status=()=>({connectors,stats:{items:db.items,bytes:3.5*1024*1024,generated:5,byKind:{image:3,audio:1},byConnector:{}},forge:{packs:db.forge}});
const fileTypes={'loc-1':'image/png','loc-2':'audio/wav','loc-4':'image/jpeg'};
const project={id:'p1',revision:7,settings:{profile:'reels'}};
const candidates=[{start:12.5,end:48,duration:35.5,score:.82,reasons:['Pregunta al inicio','Ritmo alto'],text:'¿Sabías que el encuadre lo cambia todo?',title:'El truco del encuadre'},{start:70,end:100,duration:30,score:.4,reasons:[],text:'Segundo momento',title:'Otro momento'}];
const loudness={source:'export',fresh:true,integrated:-17.5,truePeak:-1.2,lra:6.1,platforms:[{id:'youtube',name:'YouTube',target:-14,delta:3.5,status:'warn',advice:'Sube 3.5 dB'},{id:'podcast',name:'Podcast',target:-16,delta:1.5,status:'ok',advice:''},{id:'tv',name:'TV',target:-23,delta:-5.5,status:'error',advice:'Demasiado alto para TV'}]};
const checklists={reels:{platform:'reels',items:[{id:'format',level:'ok',title:'Formato vertical',detail:'1080×1920'},{id:'dur',level:'warn',title:'Duración larga',detail:'Dura 95 s'},{id:'subs',level:'error',title:'Sin subtítulos',detail:'Añade subtítulos'}],summary:{ok:1,warn:1,error:1}},tiktok:{platform:'tiktok',items:[{id:'format',level:'ok',title:'Formato vertical',detail:'1080×1920'}],summary:{ok:1,warn:0,error:0}}};
const luts=[{stem:'cine-calido',title:'Cine cálido',description:'Naranjas suaves',preview:'/api/library/lut-preview/cine-calido'},{stem:'frio-azul',title:'Frío azulado',description:'',preview:'/api/library/lut-preview/frio-azul'}];

/* -------------------------------- Fake engine ----------------------------- */
const calls=[];let forgeGate=null,loudnessCalls=0,failKeys=false;
const searchFor=q=>q?{query:{original:q,english:'rain',translated:true},local:{items:[L1,L2],total:2},remote:{items:[R1,R2,R3,R4,R5,R6],total:6,errors:[{connector:'pexels',name:'Pexels',error:'falta la clave'}],skipped:[{connector:'mixkit',name:'Mixkit',reason:'solo importación manual'}]},tookMs:42}
 :{query:{original:'',english:'',translated:false},local:{items:[L1,L2,L3,L4],total:4},remote:{items:[],total:0,errors:[],skipped:[]},tookMs:3};
globalThis.fetch=async(url,options={})=>{
 const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
 calls.push({url,method:options.method||'GET',body,headers:options.headers});
 const reply=(data,status=200)=>({ok:status<400,status,json:async()=>data,blob:async()=>({type:'application/octet-stream'})});
 const path=url.replace('/nacho-api','');
 if(path==='/session')return reply({token:'tok'});
 if(path==='/library/status')return reply(status());
 if(path.startsWith('/library/search?')){const p=new URL('http://x'+path).searchParams;return reply(searchFor(p.get('q')));}
 if(path.startsWith('/library/file/')){const id=decodeURIComponent(path.split('/').pop());return {ok:true,status:200,blob:async()=>({type:fileTypes[id]||'application/octet-stream'})};}
 if(path==='/library/download'){
  if(body.key==='freesound:9'&&!body.ack)return reply({error:'Freesound exige indicar al autor. ¿Aceptas incluir la atribución?'},428);
  if(body.key==='giphy:1'&&!body.ack)return reply({error:'falta ack'},428);
  db.items++;return reply({item:local({id:'dl-'+body.key.replace(/\W/g,''),title:{'polyhaven:rain':'Rain forest HDRI'}[body.key]||body.key,license:body.key==='giphy:1'?GIPHY:CC0}),duplicate:false});
 }
 if(path==='/library/remove'){db.items--;return reply({ok:true});}
 if(path==='/library/keys'){if(failKeys)return reply({error:'Clave rechazada'},400);connectors[0].configured=true;return reply({configured:true});}
 if(path.startsWith('/library/import?')){db.items++;const p=new URL('http://x'+path).searchParams;return reply({item:local({id:'imp-1',title:p.get('title')||p.get('name'),license:lic(p.get('license'))}),duplicate:false});}
 if(path==='/library/forge'&&options.method==='POST'){if(forgeGate)await forgeGate;const pack=db.forge.find(x=>x.id===body.pack);pack.generated=true;return reply({made:3,total:4,failed:[{id:'sepia',error:'boom'}]});}
 if(path==='/library/luts')return reply({luts});
 if(path.startsWith('/projects/p1/shorts?'))return reply({revision:7,candidates});
 if(path==='/projects/p1/shorts')return reply({...project,revision:8,settings:{profile:'shorts'}});
 if(path==='/projects/p1/loudness')return++loudnessCalls===1?reply({error:'No hay render del proyecto'},400):reply(loudness);
 if(path.startsWith('/projects/p1/checklist?')){const platform=new URL('http://x'+path).searchParams.get('platform');return reply(checklists[platform]);}
 throw Error('unexpected '+url);
};
// Editor and media pipeline.
let activeId='proj-1',switchNow=false;const stored=[],processed=[],inserted=[];
globalThis.__process=async files=>{processed.push(files.map(f=>f.name));if(switchNow)activeId='proj-2';return files.map(f=>({name:f.name,type:f.type.startsWith('audio')?'audio':f.type.startsWith('video')?'video':'image',duration:f.type.startsWith('audio')?4:undefined}));};
globalThis.editor={
 project:{getActive:()=>({metadata:{id:activeId}})},scenes:{getActiveScene:()=>({id:'scene-1'})},
 media:{getAssets:()=>stored,addMediaAsset:async({projectId,asset})=>{const a={...asset,id:'asset-'+(stored.length+1),projectId};stored.push(a);return a;}},
 playback:{getCurrentTime:()=>1000000},timeline:{insertElement:p=>inserted.push(p)},
};

/* --------------------------------- Helpers -------------------------------- */
const {LibraryPanel}=await import('../cache/library-ui-test/library.mjs');
const {CreatorTools,LutPicker}=await import('../cache/library-ui-test/creator.mjs');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
const card=(title,origin)=>[...document.querySelectorAll('article')].find(a=>a.getAttribute('aria-label')===title&&(!origin||a.dataset.origin===origin));
const btn=(text,scope=document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const click=async el=>{assert(el,'missing element');assert(!el.disabled,'disabled: '+el.textContent);await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));await settle();};
const setField=async(el,value)=>{assert(el,'missing field');const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});await settle();};
const lastCall=pattern=>calls.findLast(c=>c.url.includes(pattern));
const params=url=>Object.fromEntries(new URL('http://x'+url.replace('/nacho-api','')).searchParams);
const text=()=>document.body.textContent;
try{
 /* ---------------- Library: first load shows the local library ---------------- */
 await act(async()=>root.render(React.createElement(LibraryPanel)));await settle();
 assert.match(document.querySelector('[aria-label="Estadísticas de la biblioteca"]').textContent,/4 recursos · 3\.5 MB · 5 generados/);
 const first=calls.find(c=>c.url.includes('/library/search?'));
 assert.deepEqual(params(first.url),{q:'',kind:'all',scope:'local',page:'1',commercial:'0'},'an empty text only browses the local library');
 const credits=document.querySelector('a[href="/nacho-api/library/credits?all=0"]');assert(credits&&credits.textContent==='Créditos');assert(document.querySelector('a[href="/nacho-api/library/credits?all=1"]'));
 assert.equal(document.querySelectorAll('article[data-origin="local"]').length,4);
 // Licence badges: green without attribution, amber when it is required, red when commercial use is not allowed.
 const tone=title=>card(title).querySelector('[data-tone]');
 assert.equal(tone('Gota de lluvia').dataset.tone,'ok');assert.equal(tone('Lluvia suave').dataset.tone,'warn');assert.equal(tone('Meme prueba').dataset.tone,'bad');
 assert.match(tone('Meme prueba').textContent,/CC-BY-NC · no comercial/);assert.match(tone('Meme prueba').getAttribute('title'),/No permite uso comercial\./);
 assert.match(tone('Lluvia suave').textContent,/atribución/);
 // Local media: image through the file endpoint, audio with controls, linked files cannot be deleted.
 assert.equal(card('Gota de lluvia').querySelector('img').getAttribute('src'),'/nacho-api/library/file/loc-1');
 assert(card('Lluvia suave').querySelector('audio[controls]'));assert(card('Gota de lluvia').textContent.includes('Generado'));
 assert(btn('Eliminar: Gota de lluvia')&&!btn('Eliminar: Foto enlazada'),'external items are only linked, never deleted');assert(card('Foto enlazada').textContent.includes('Enlazado'));
 // Attribution is copied as the stored text, or built from the licence when none is stored.
 await click(btn('Copiar atribución: Lluvia suave'));assert.equal(copied,'«Lluvia suave» de Ana, CC BY');
 await click(btn('Copiar atribución: Gota de lluvia'));assert.equal(copied,'«Gota de lluvia», de Elite Editor, CC0 1.0 (dominio público)');

 /* ------------------------------ Add to timeline ----------------------------- */
 await click(btn('Añadir a la timeline: Gota de lluvia'));
 assert.equal(inserted.length,1);assert.equal(inserted[0].element.mediaId,'asset-1');assert.equal(inserted[0].element.mediaType,'image');assert.equal(inserted[0].element.name,'Gota de lluvia');
 assert.equal(inserted[0].element.startTime,1000000);assert.equal(inserted[0].element.duration,5000000);assert.deepEqual(inserted[0].placement,{mode:'auto'});
 assert(processed[0][0].startsWith('Gota de lluvia [loc-1]'),'a stable file name lets the stored copy be reused');
 assert(calls.some(c=>c.url==='/nacho-api/library/file/loc-1'));assert.match(text(),/«Gota de lluvia» añadido a la timeline/);
 await click(btn('Añadir a la timeline: Gota de lluvia'));
 assert.equal(inserted.length,2);assert.equal(processed.length,1,'the second add reuses the project copy');assert.equal(inserted[1].element.mediaId,'asset-1');
 await click(btn('Añadir a la timeline: Lluvia suave'));
 assert.deepEqual(inserted[2].placement,{mode:'auto',trackType:'audio'});assert.equal(inserted[2].element.mediaType,'audio');assert.equal(inserted[2].element.duration,4000000);assert.equal(inserted[2].element.params.volume,-18,'ambience goes in quieter');
 // Switching project while the file is prepared must not drop the asset into another project.
 switchNow=true;await click(btn('Añadir a la timeline: Foto enlazada'));
 assert.match(document.querySelector('[role=alert]').textContent,/cambiado de proyecto/);assert.equal(inserted.length,3);switchNow=false;activeId='proj-1';

 /* -------------------------------- Delete local ------------------------------ */
 const before=calls.length;await click(btn('Eliminar: Meme prueba'));
 assert(card('Meme prueba').querySelector('[aria-label="Confirmación de borrado"]'),'deleting asks first');assert.equal(calls.length,before,'nothing is sent before confirming');
 await click(btn('Sí, eliminar',card('Meme prueba')));
 assert.deepEqual(lastCall('/library/remove').body,{id:'loc-3'});assert.equal(lastCall('/library/remove').headers['x-studio-token'],'tok');
 assert(!card('Meme prueba'));assert.match(document.querySelector('[aria-label="Estadísticas de la biblioteca"]').textContent,/3 recursos/);

 /* ---------------------------------- Filters --------------------------------- */
 await click(btn('Audio'));assert.equal(params(lastCall('/library/search?').url).kind,'audio');
 await click(document.querySelector('input[type=checkbox]'));assert.equal(params(lastCall('/library/search?').url).commercial,'1');
 await setField(document.querySelector('select[aria-label="Categoría de mi biblioteca"]'),'Música');assert.equal(params(lastCall('/library/search?').url).category,'Música');
 await click(btn('Todo'));await click(document.querySelector('input[type=checkbox]'));await setField(document.querySelector('select[aria-label="Categoría de mi biblioteca"]'),'');
 assert.deepEqual(params(lastCall('/library/search?').url),{q:'',kind:'all',scope:'local',page:'1',commercial:'0'});

 /* ------------------------ Search with translation + remote ------------------ */
 const input=document.querySelector('input[aria-label="Buscar recursos"]');
 await setField(input,'lluvia');await click(btn('Buscar'));
 assert.deepEqual(params(lastCall('/library/search?').url),{q:'lluvia',kind:'all',scope:'all',page:'1',commercial:'0'});
 assert.match(text(),/Buscando también: rain/);
 assert.equal(document.querySelectorAll('article[data-origin="local"]').length,2);assert.equal(document.querySelectorAll('article[data-origin="remote"]').length,6);
 // Thumbnails only through the local proxy; remote links are plain http(s).
 assert.equal(card('Rain forest HDRI').querySelector('img').getAttribute('src'),'/nacho-api/library/thumb?url='+encodeURIComponent('https://cdn.polyhaven.com/a.jpg'));
 assert([...document.querySelectorAll('img')].every(i=>!/^https?:/i.test(i.getAttribute('src'))),'no image is hotlinked');
 assert.equal(card('Lluvia sobre tejado').querySelector('audio').getAttribute('src'),'https://cdn.freesound.example/9.mp3');
 assert(faces.some(f=>f.source.includes('https://fonts.example/rain.woff2')),'the font card loads its FontFace');assert(added.length>=1);assert(card('Rainy Sans').textContent.includes('Aa'));
 const open=btn('Abrir fuente: Rain forest HDRI')||card('Rain forest HDRI').querySelector('a[aria-label^="Abrir fuente"]');
 assert.equal(open.getAttribute('href'),'https://polyhaven.com/a/rain');assert.equal(open.getAttribute('target'),'_blank');assert.match(open.getAttribute('rel'),/noopener/);assert.match(open.getAttribute('rel'),/noreferrer/);
 assert(!card('Lluvia animada').querySelector('a[href]'),'a javascript: source never becomes a link');
 assert.match(card('Lluvia animada').textContent,/Solo se puede descargar desde la web de LottieFiles/);assert(!btn('Descargar: Lluvia animada'));
 assert.equal(tone('Rain forest HDRI').dataset.tone,'ok');assert.equal(tone('Lluvia sobre tejado').dataset.tone,'warn');assert.equal(tone('Gato bajo la lluvia').dataset.tone,'bad');
 assert(card('Charco').textContent.includes('Ya en tu biblioteca')&&!btn('Descargar: Charco'),'owned items are not downloaded twice');
 // Connector credits and per-connector errors do not break the rest of the results.
 const creditBar=document.querySelector('[aria-label="Créditos de las fuentes"]').textContent;assert.match(creditBar,/Powered by Poly Haven/);assert.match(creditBar,/Powered by GIPHY/);
 assert.match(document.querySelector('[aria-label="Fuentes con problemas"]').textContent,/Pexels: falta la clave/);assert.match(document.querySelector('[aria-label="Fuentes omitidas"]').textContent,/Mixkit/);
 await click(btn('Copiar atribución: Rain forest HDRI'));assert.equal(copied,R1.attribution);

 /* ---------------------------------- Downloads ------------------------------- */
 await click(btn('Descargar: Rain forest HDRI'));
 let download=lastCall('/library/download');assert.deepEqual(download.body,{key:'polyhaven:rain'});assert.equal(download.headers['x-studio-token'],'tok');
 assert.match(text(),/«Rain forest HDRI» guardado en tu biblioteca/);assert(card('Rain forest HDRI','remote').textContent.includes('Ya en tu biblioteca')&&!btn('Descargar: Rain forest HDRI'));
 assert.equal(document.querySelectorAll('article[data-origin="local"]').length,3,'the new item appears in the local library');
 assert.match(document.querySelector('[aria-label="Estadísticas de la biblioteca"]').textContent,/4 recursos/,'the statistics are refreshed');
 // A connector with an acknowledgement asks before anything is sent.
 const downloads=()=>calls.filter(c=>c.url.endsWith('/library/download')).length;let n=downloads();
 await click(btn('Descargar: Gato bajo la lluvia'));
 const ask=card('Gato bajo la lluvia').querySelector('[aria-label="Confirmación de descarga"]');assert(ask);assert.match(ask.textContent,/uso comercial no está garantizado/);assert.equal(downloads(),n,'no request before confirming');
 await click(btn('Confirmar y descargar',card('Gato bajo la lluvia')));
 assert.deepEqual(lastCall('/library/download').body,{key:'giphy:1',ack:true});assert(card('Gato bajo la lluvia').textContent.includes('Ya en tu biblioteca'));
 // The engine can also demand it (HTTP 428): its message is shown with a confirm button.
 n=downloads();await click(btn('Descargar: Lluvia sobre tejado'));
 assert.equal(downloads(),n+1);assert.deepEqual(lastCall('/library/download').body,{key:'freesound:9'});
 const demand=card('Lluvia sobre tejado').querySelector('[aria-label="Confirmación de descarga"]');assert.match(demand.textContent,/Freesound exige indicar al autor/);
 await click(btn('Confirmar y descargar',card('Lluvia sobre tejado')));assert.deepEqual(lastCall('/library/download').body,{key:'freesound:9',ack:true});
 assert(!card('Lluvia sobre tejado').querySelector('[aria-label="Confirmación de descarga"]'));

 /* ----------------------------- Sources: keys + import ------------------------ */
 const pexels=document.querySelector('details[data-connector="pexels"]');
 assert.match(pexels.textContent,/Principal/);assert.match(pexels.textContent,/Falta la clave/);assert.match(pexels.textContent,/No vender copias sin modificar/);assert.match(pexels.textContent,/200\/h/);assert.match(pexels.textContent,/Recomendada/);
 const keyField=pexels.querySelector('input[type=password]');assert(keyField,'the key field is masked');
 assert.equal(pexels.querySelector('a[href="https://www.pexels.com/api/"]').textContent,'Conseguir clave');
 await setField(keyField,'secret-pexels-key');await click(btn('Guardar clave de Pexels',pexels));
 const keyCall=lastCall('/library/keys');assert.deepEqual(keyCall.body,{connector:'pexels',key:'secret-pexels-key'});assert.equal(keyCall.headers['x-studio-token'],'tok');
 assert.equal(keyField.value,'','the key is cleared after saving');assert(!text().includes('secret-pexels-key'),'the key is never shown again');
 assert.match(text(),/Clave guardada en este equipo/);assert.match(document.querySelector('details[data-connector="pexels"]').textContent,/Clave guardada/);
 const mixkit=document.querySelector('details[data-connector="mixkit"]');
 assert.match(mixkit.textContent,/Descarga el archivo en Mixkit/);assert.match(mixkit.textContent,/Confirma que el recurso usa la licencia Mixkit/);
 assert.equal(mixkit.querySelector('a[aria-label="Abrir sitio de Mixkit"]').getAttribute('href'),'https://mixkit.co/free-stock-music/');
 const form=mixkit.querySelector('form[aria-label="Importar archivo de Mixkit"]');
 assert(btn('Importar a la biblioteca desde Mixkit',form).disabled,'needs a file first');
 const licenseSelect=form.querySelector('select');assert.equal(licenseSelect.value,'Mixkit','the connector licence is preselected');
 assert.deepEqual([...licenseSelect.options].map(o=>o.value),['CC0-1.0','CC-BY','CC-BY-SA','CC-BY-NC','OFL-1.1','Pexels','Pixabay','Mixkit','Lottie-Simple','OGA-BY','Third-party','Personal','Unknown']);
 const file=new dom.window.File(['RIFFdata'],'lluvia-mixkit.wav',{type:'audio/wav'});
 const fileInput=form.querySelector('input[type=file]');Object.defineProperty(fileInput,'files',{value:[file],configurable:true});
 await act(async()=>fileInput.dispatchEvent(new Event('change',{bubbles:true})));
 const fields=[...form.querySelectorAll('input:not([type=file])')];
 await setField(fields[0],'Mixkit Studio');await setField(fields[1],'https://mixkit.co/free-sound-effects/rain/');await setField(fields[2],'Lluvia fuerte');await setField(fields[3],'lluvia, tormenta');
 await click(btn('Importar a la biblioteca desde Mixkit',form));
 const imported=lastCall('/library/import?');
 assert.deepEqual(params(imported.url),{name:'lluvia-mixkit.wav',connector:'mixkit',license:'Mixkit',author:'Mixkit Studio',source:'https://mixkit.co/free-sound-effects/rain/',title:'Lluvia fuerte',tags:'lluvia, tormenta'});
 assert.equal(imported.method,'POST');assert.equal(imported.headers['x-studio-token'],'tok');assert.equal(imported.body,file,'the raw file is the request body');
 assert.match(text(),/Importado a tu biblioteca: Lluvia fuerte/);assert(card('Lluvia fuerte'),'the imported item shows in the library');

 /* ----------------------------------- Forge --------------------------------- */
 const forge=document.querySelector('details[data-section="forge"]');
 assert.match(forge.textContent,/Looks cinematográficos/);assert.match(forge.querySelector('[data-pack="luts"]').textContent,/Pendiente · 4 recursos/);assert.match(forge.querySelector('[data-pack="icons"]').textContent,/Generado · 20 recursos/);
 assert(btn('Generar: Looks de color (LUTs)')&&btn('Regenerar: Iconos y flechas'));
 let release;forgeGate=new Promise(r=>{release=r;});
 await act(async()=>btn('Generar: Looks de color (LUTs)').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 assert.equal(btn('Generar: Looks de color (LUTs)').textContent,'Generando…');assert(btn('Regenerar: Iconos y flechas').disabled,'one pack at a time');assert(forge.querySelector('[role=progressbar]'));
 release();forgeGate=null;await settle();
 assert.deepEqual(lastCall('/library/forge').body,{pack:'luts'});assert.equal(lastCall('/library/forge').headers['x-studio-token'],'tok');
 assert.match(forge.querySelector('[data-pack="luts"]').textContent,/3 generados de 4 · 1 con fallos/);assert.match(forge.querySelector('[data-pack="luts"]').textContent,/sepia: boom/);
 assert(btn('Regenerar: Looks de color (LUTs)'),'the pack is now regenerable (status refreshed)');
 await click(btn('Regenerar: Iconos y flechas'));assert.deepEqual(lastCall('/library/forge').body,{pack:'icons',force:true});

 /* --------------------------- Creator tools (shorts…) ------------------------ */
 let updated=null;const messages=[],settings=[];let saved=0;
 const props=(over={})=>({project,disabled:false,settings:{},onUpdated:p=>{updated=p;},onMessage:m=>messages.push(m),onSetting:p=>settings.push(p),onSave:()=>{saved++;},...over});
 await act(async()=>root.render(React.createElement(CreatorTools,props())));
 // Shorts: candidates with time, score and reasons; applying sends the current revision.
 await click(btn('Buscar clips para Shorts'));
 assert(lastCall('/projects/p1/shorts?').url.endsWith('/projects/p1/shorts?min=30&max=60'));
 const clips=[...document.querySelectorAll('ol[aria-label="Clips candidatos"] > li')];assert.equal(clips.length,2);
 assert.match(clips[0].textContent,/0:12\.5 – 0:48\.0 · 36 s/);assert.match(clips[0].textContent,/Puntuación 82/);assert.match(clips[0].textContent,/Pregunta al inicio/);assert.match(clips[0].textContent,/Sabías que el encuadre/);
 assert.equal(clips[0].querySelector('[role=meter]').getAttribute('aria-valuenow'),'82');
 await click(btn('Usar este clip: El truco del encuadre'));
 const useClip=lastCall('/projects/p1/shorts');assert.deepEqual(useClip.body,{start:12.5,end:48,revision:7});assert.equal(useClip.headers['x-studio-token'],'tok');
 assert.equal(updated.revision,8);assert.match(messages.at(-1),/Clip de 0:12\.5 a 0:48\.0 aplicado/);assert(!document.querySelector('ol[aria-label="Clips candidatos"]'),'the list is cleared after applying');
 // A project that changed after the search makes the candidates stale.
 await click(btn('Buscar clips para Shorts'));
 await act(async()=>root.render(React.createElement(CreatorTools,props({project:{...project,revision:9}}))));
 assert(btn('Usar este clip: El truco del encuadre').disabled);assert.match(text(),/vuelve a buscar clips/);
 await act(async()=>root.render(React.createElement(CreatorTools,props())));
 // Loudness: a missing render is explained; then LUFS, peak, range and a light per platform.
 await click(btn('Medir volumen'));assert.match(document.querySelector('[role=alert]').textContent,/No hay render del proyecto/);
 await click(btn('Medir volumen'));
 assert.match(text(),/-17\.5 LUFS/);assert.match(text(),/-1\.2 dBTP/);assert.match(text(),/6\.1 LU/);assert.match(text(),/Medido sobre el render final/);
 const platforms=[...document.querySelectorAll('ul[aria-label="Volumen por plataforma"] > li')];assert.deepEqual(platforms.map(li=>li.dataset.level),['warn','ok','error']);
 assert.match(platforms[0].textContent,/YouTube/);assert.match(platforms[0].textContent,/Objetivo -14 LUFS · diferencia \+3\.5 dB/);assert.match(platforms[0].textContent,/Sube 3\.5 dB/);assert.match(platforms[2].textContent,/Fuera de rango/);assert.match(platforms[2].textContent,/Demasiado alto para TV/);
 // The loudness target is a finishing setting: staged in the assistant and saved with «Guardar retoque».
 const target=document.querySelector('select[aria-label="Objetivo de volumen"]');assert.equal(target.value,'-16');
 assert.deepEqual([...target.options].map(o=>o.value),['-14','-16','-23']);assert.match(target.options[0].textContent,/YouTube/);assert.match(target.options[1].textContent,/Podcast/);assert.match(target.options[2].textContent,/TV/);
 await setField(target,'-14');assert.deepEqual(settings.at(-1),{audioTargetLufs:-14});
 await act(async()=>root.render(React.createElement(CreatorTools,props({settings:{audioTargetLufs:-14}}))));
 assert.match(text(),/Objetivo sin guardar/);await click(btn('Guardar objetivo'));assert.equal(saved,1);
 await act(async()=>root.render(React.createElement(CreatorTools,props({settings:{audioTargetLufs:-12}}))));
 assert([...document.querySelector('select[aria-label="Objetivo de volumen"]').options].some(o=>/Personalizado · -12 LUFS/.test(o.textContent)),'a custom stored target is kept');
 await act(async()=>root.render(React.createElement(CreatorTools,props())));
 // Checklist: the platform defaults to the project format and switching reloads the review.
 const platformSelect=document.querySelector('select[aria-label="Plataforma de publicación"]');assert.equal(platformSelect.value,'reels');
 await click(btn('Revisar proyecto'));assert(lastCall('/checklist?').url.endsWith('/projects/p1/checklist?platform=reels'));
 const points=[...document.querySelectorAll('ul[aria-label="Puntos de la revisión"] > li')];assert.deepEqual(points.map(li=>li.dataset.level),['ok','warn','error']);
 assert.match(points[2].textContent,/Error: Sin subtítulos/);assert.match(points[2].textContent,/Añade subtítulos/);
 assert.match(document.querySelector('[aria-label="Resumen de la revisión"]').textContent,/1 correcto/);assert.match(document.querySelector('[aria-label="Resumen de la revisión"]').textContent,/1 aviso/);assert.match(document.querySelector('[aria-label="Resumen de la revisión"]').textContent,/1 error/);
 assert.match(text(),/Corrige los errores antes de publicar/);
 await setField(platformSelect,'tiktok');assert(lastCall('/checklist?').url.endsWith('platform=tiktok'));assert.match(text(),/Todo listo para publicar en TikTok/);
 assert.deepEqual(messages.length,1,'only the applied clip raises a message');

 /* ------------------------------- LUT selector ------------------------------ */
 const picks=[];
 await act(async()=>root.render(React.createElement(LutPicker,{value:'',onChange:s=>picks.push(s)})));await settle();
 assert(lastCall('/library/luts'));
 const radios=[...document.querySelectorAll('[role=radiogroup][aria-label="Look de color (LUT)"] input[type=radio]')];assert.equal(radios.length,3);
 assert.equal(radios[0].checked,true,'no look by default');assert(document.querySelector('[role=radiogroup]').textContent.includes('Sin look'));
 assert.deepEqual([...document.querySelectorAll('[role=radiogroup] img')].map(i=>i.getAttribute('src')),['/nacho-api/library/lut-preview/cine-calido','/nacho-api/library/lut-preview/frio-azul']);
 assert(document.querySelector('[role=radiogroup]').textContent.includes('Cine cálido'));
 await click(radios[1]);assert.deepEqual(picks,['cine-calido']);
 await act(async()=>root.render(React.createElement(LutPicker,{value:'frio-azul',onChange:s=>picks.push(s)})));await settle();
 assert.equal([...document.querySelectorAll('[role=radiogroup] input[type=radio]')][2].checked,true);
 await click([...document.querySelectorAll('[role=radiogroup] input[type=radio]')][0]);assert.deepEqual(picks,['cine-calido',''],'«Sin look» clears the look');
 await act(async()=>root.render(React.createElement(LutPicker,{value:'borrado',onChange:()=>{}})));await settle();
 assert.match(text(),/El look guardado \(«borrado»\) ya no está en la biblioteca/);
 console.log('PASS library UI: local/remote cards, licence badges, translation hint, thumbnails via proxy, credits and connector errors, download (+ack), add to timeline, delete confirm, keys, manual import, forge, shorts, loudness, checklist, LUT picker. Network and editor mocked.');
}finally{await act(async()=>root.unmount());dom.window.close();}
