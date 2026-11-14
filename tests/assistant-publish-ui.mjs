import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import assert from 'node:assert/strict';
const mocks={
 '@/components/ui/button':`import React from 'react';export const Button=({variant,size,...p})=>React.createElement('button',p);`,
 '@/components/ui/input':`import React from 'react';export const Input=p=>React.createElement('input',p);`,
};
const plugin={name:'adapter',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:mocks[a.path]??(()=>{throw Error(a.path)})(),loader:'js'}));}};
const views='vendor/opencut-classic/apps/web/src/components/editor/panels/assets/views/';
await build({entryPoints:{publish:views+'nacho-publish.tsx',text:views+'nacho-text-editor.tsx'},outdir:'cache/publish-ui-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],plugins:[plugin]});
const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:5181'});
for(const k of ['window','document','HTMLElement','Event','MouseEvent','navigator'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let copied='';Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async t=>{copied=t;}},configurable:true});
const calls=[];
const words=(start,list)=>list.map((w,i)=>({start:start+i*.5,end:start+i*.5+.4,word:w,estimated:false,kept:true}));
const view={revision:7,manual:false,duration:20,clips:[{start:0,end:12}],stats:{original:20,montage:12,removedPercent:40,words:30,wordsPerMinute:150,speechPercent:80,longestPause:1.4,fillers:2},
 segments:[{index:0,start:0,end:2,text:'hola a todos amigos',state:'kept',words:words(0,['hola','a','todos','amigos'])}]};
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):undefined;calls.push({url,body});
 const json=data=>({ok:true,json:async()=>data});
 if(url.endsWith('/session'))return json({token:'tok'});
 if(url.endsWith('/transcript'))return json(view);
 if(url.includes('/pauses?'))return json({revision:7,items:[{start:3,end:4.2}],seconds:1.2});
 if(url.endsWith('/publish')||url.endsWith('/publish?fresh=1'))return json({engine:'rules',titles:['Título claro'],description:'Una descripción.',hashtags:['#edicion','#local'],chapterText:'0:00 Inicio\n0:40 Parte dos',note:'Borrador con reglas locales: Ollama no está disponible.',revision:7});
 if(body)return json({id:'p',revision:(body.revision??7)+1,reviewed:true,settings:{profile:body.profile||'reels'},clips:[{enabled:true}],artifacts:{},media:{duration:20}});
 throw Error('unexpected '+url);
};
const {ReviewGate,ExportPanel,PublishPanel}=await import('../cache/publish-ui-test/publish.mjs');
const {TranscriptEditor}=await import('../cache/publish-ui-test/text.mjs');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const find=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const click=async el=>{assert(el,'missing button');assert(!el.disabled,'disabled: '+el.textContent);await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
const project={id:'p',revision:7,reviewed:false,settings:{profile:'youtube'},clips:[{enabled:true}],artifacts:{export:{revision:7,width:1920,height:1080,duration:12,encoder:'CPU'}},media:{duration:20}};
let updated=null,messages=[],errors=[],jobs=[];
const props={project,disabled:false,onUpdated:p=>{updated=p;},onError:e=>{if(e)errors.push(e);},onMessage:m=>messages.push(m),onJob:async t=>{jobs.push(t);}};
try{
 // Approval is explicit and keeps the revision.
 await act(async()=>root.render(React.createElement(ReviewGate,props)));
 assert.match(document.body.textContent,/pendiente de aprobar/);
 await click(find('Aprobar propuesta'));assert.deepEqual(calls.at(-1).body,{revision:7});assert(calls.at(-1).url.endsWith('/approve'));
 await act(async()=>root.render(React.createElement(ReviewGate,{...props,project:{...project,reviewed:true}})));
 assert.equal(document.body.textContent,'','approved proposals show no gate');
 // Export: unapproved projects cannot render; the format selector posts the profile; downloads point at the artifact.
 await act(async()=>root.render(React.createElement(ExportPanel,props)));
 assert(find('Render final en calidad máxima').disabled,'render waits for approval');
 const select=document.querySelector('select[aria-label="Formato de salida"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(select,'tiktok');select.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.deepEqual(calls.at(-1).body,{revision:7,profile:'tiktok'});assert.equal(updated.settings.profile,'tiktok');
 assert(document.querySelector('a[href$="type=export&download=1"]'));assert.match(document.body.textContent,/1920×1080/);
 await act(async()=>root.render(React.createElement(ExportPanel,{...props,project:{...project,reviewed:true}})));
 await click(find('Render final en calidad máxima'));assert.deepEqual(jobs,['render']);
 // Publishing kit: engine badge, note and one-click copy.
 await act(async()=>root.render(React.createElement(PublishPanel,props)));
 await click(find('Preparar publicación'));
 assert.match(document.body.textContent,/Borrador con reglas locales/);assert.match(document.body.textContent,/0:40 Parte dos/);
 await click(find('Copiar capítulos'));assert.equal(copied,'0:00 Inicio\n0:40 Parte dos');
 await click(find('Regenerar'));assert(calls.at(-1).url.endsWith('/publish?fresh=1'));
 // Text editor: stats, map, pause preview/apply, word selection cut and inline correction.
 const editor={id:'p',revision:7};
 await act(async()=>root.render(React.createElement(TranscriptEditor,{project:editor,disabled:false,onUpdated:p=>{updated=p;},onError:e=>{if(e)errors.push(e);},onMessage:m=>messages.push(m)})));
 assert.match(document.querySelector('[aria-label="Estadísticas del montaje"]').textContent,/150 pal\/min/);
 assert.equal(document.querySelectorAll('svg[aria-label^="Mapa del original"] rect').length,1);
 await click(find('Buscar pausas largas'));assert(calls.at(-1).url.includes('/pauses?max=0.7&keep=0.25'));
 await click(find('Acortar 1'));assert.deepEqual(calls.at(-1).body,{max:.7,keep:.25,revision:7});assert(calls.at(-1).url.endsWith('/pauses'));
 await act(async()=>root.render(React.createElement(TranscriptEditor,{project:editor,disabled:false,onUpdated:()=>{},onError:()=>{},onMessage:()=>{}})));
 const phrase=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-expanded')!==null);await click(phrase);
 const wordButtons=[...document.querySelectorAll('[aria-label="Palabras de la frase"] button')];assert.equal(wordButtons.length,4);
 await click(wordButtons[1]);await click(wordButtons[2]);
 await click(find('Quitar 2 palabras'));assert.deepEqual(calls.at(-1).body,{start:.5,end:1.4,revision:7});assert(calls.at(-1).url.endsWith('/cut'));
 await click(find('Corregir el texto: hola a todos amigos'));
 const input=document.querySelector('input[aria-label="Texto corregido"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'hola a todas amigas');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click(find('Guardar texto'));assert.deepEqual(calls.at(-1).body,{index:0,text:'hola a todas amigas',revision:7});assert(calls.at(-1).url.endsWith('/text'));
 assert.deepEqual(errors,[]);
 console.log('PASS publish & text tools: explicit approval, render gate, format change, artifact downloads, publishing kit copy/regenerate, stats, map, pause tightening, word-range cut, inline correction. Network mocked.');
}finally{await act(async()=>root.unmount());dom.window.close();}
