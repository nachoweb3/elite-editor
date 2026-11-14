import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import assert from 'node:assert/strict';
const mocks={
 '@/components/ui/button':`import React from 'react';export const Button=({variant,size,...p})=>React.createElement('button',p);`,
 '@/components/ui/input':`import React from 'react';export const Input=p=>React.createElement('input',p);`,
};
await build({entryPoints:['vendor/opencut-classic/apps/web/src/components/editor/panels/assets/views/nacho-assistant-parts.tsx'],outfile:'cache/assistant-parts-test.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],plugins:[{name:'adapter',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:mocks[a.path]??(()=>{throw Error(a.path)})(),loader:'js'}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:5181'});
for(const k of ['window','document','HTMLElement','Event','MouseEvent'])globalThis[k]=dom.window[k];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const calls=[];let project={id:'p1',revision:4};
const segments=[{index:0,start:0,end:2,text:'Hola eh bienvenidos',state:'kept'},{index:1,start:3,end:5,text:'esto se quitó',state:'removed'},{index:2,start:6,end:8,text:'final del vídeo',state:'partial'}];
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):undefined;calls.push({url,method:options.method||'GET',body,headers:options.headers});
 const json=data=>({ok:true,json:async()=>data});
 if(url.endsWith('/session'))return json({token:'tok'});
 if(url.endsWith('/capabilities'))return json({ffmpeg:true,transcription:{ready:false,modelName:'tiny'},faceTracking:false,nvenc:false,ollama:{running:false,installed:false,model:'qwen'},hints:['Transcripción: descarga el modelo']});
 if(url.endsWith('/transcript'))return json({revision:project.revision,manual:false,segments});
 if(url.endsWith('/fillers')&&!body)return json({revision:project.revision,items:[{start:.5,end:.8,word:'eh',kind:'filler'}],seconds:.3});
 if(url.endsWith('/cancel'))return json({status:'cancelling'});
 if(url.endsWith('/log?job=j1'))return json({log:'línea 1\nTraceback final'});
 if(['/fillers','/cut','/restore'].some(s=>url.endsWith(s)))return json({...project,revision:project.revision+1});
 throw Error('unexpected '+url);
};
const {EngineStatus,JobStatus,TranscriptEditor,clock}=await import('../cache/assistant-parts-test.mjs');
const {createRoot}=await import('react-dom/client');
const r=createRoot(document.getElementById('root'));
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const click=async el=>{assert(el,'button missing');assert(!el.disabled,'button disabled: '+el.textContent);await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
try{
 assert.equal(clock(65.25),'1:05.3');
 // Engine status: chips and actionable hints; offline AI reads as local rules.
 await act(async()=>r.render(React.createElement(EngineStatus)));
 assert.match(document.body.textContent,/Reglas locales/);assert.match(document.body.textContent,/descarga el modelo/);
 // Job status: Spanish labels, determinate progress, cancel posts the job id with the session token.
 let changed=0;
 await act(async()=>r.render(React.createElement(JobStatus,{projectId:'p1',job:{id:'j1',type:'render',status:'running',message:'Renderizando',startedAt:new Date().toISOString(),progress:{stage:'x',fraction:.42}},onChanged:()=>changed++})));
 assert.match(document.body.textContent,/Render final · En proceso/);assert.match(document.body.textContent,/42 %/);
 assert.equal(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'42');
 await click(button('Cancelar trabajo'));
 const cancel=calls.find(c=>c.url.endsWith('/cancel'));assert.deepEqual(cancel.body,{jobId:'j1'});assert.equal(cancel.headers['x-studio-token'],'tok');assert.equal(changed,1);
 // A failed job offers its log.
 await act(async()=>r.render(React.createElement(JobStatus,{projectId:'p1',job:{id:'j1',type:'analyze',status:'failed',message:'Error'},onChanged:()=>{}})));
 assert(!document.querySelector('[role=progressbar]'));await click(button('Ver registro'));assert.match(document.querySelector('pre').textContent,/Traceback final/);
 // Transcript: states, search, cut, restore and filler removal against the current revision.
 const updates=[];let messages=[];
 const editorProps=()=>({project,disabled:false,onUpdated:p=>{updates.push(p);project=p;},onError:()=>{},onMessage:m=>messages.push(m)});
 await act(async()=>r.render(React.createElement(TranscriptEditor,editorProps())));
 assert.match(document.body.textContent,/3 frases · 1 fuera del montaje/);
 assert(document.querySelector('a[href$="subtitles?format=srt"]'));assert(document.querySelector('a[href$="subtitles?format=vtt"]'));
 assert(button('Quitar la frase: Hola eh bienvenidos'));assert(!button('Recuperar la frase: Hola eh bienvenidos'),'kept phrases cannot be restored');
 assert(!button('Quitar la frase: esto se quitó'),'removed phrases cannot be cut again');
 await click(button('Quitar la frase: Hola eh bienvenidos'));
 assert.deepEqual(calls.at(-1).body,{start:0,end:2,revision:4});assert.equal(project.revision,5);
 await act(async()=>r.render(React.createElement(TranscriptEditor,editorProps())));
 await click(button('Recuperar la frase: final del vídeo'));
 assert(calls.at(-1).url.endsWith('/restore'));assert.deepEqual(calls.at(-1).body,{start:6,end:8,revision:5});
 await act(async()=>r.render(React.createElement(TranscriptEditor,editorProps())));
 await click(button('Buscar muletillas'));assert.match(document.body.textContent,/1 encontradas · 0.3 s/);
 await click(button('Quitar 1'));
 const removal=calls.at(-1);assert(removal.url.endsWith('/fillers'));assert.deepEqual(removal.body,{revision:6});assert.match(messages.at(-1),/1 muletillas quitadas/);
 const search=document.querySelector('input[aria-label="Buscar en la transcripción"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(search,'final');search.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(document.querySelectorAll('ol[aria-label="Transcripción"] li').length,1);
 console.log('PASS assistant parts: engine chips and hints, progress and cancel, failure log, transcript states, cut/restore/filler removal with revisions, subtitle downloads, search. Network mocked.');
}finally{await act(async()=>r.unmount());dom.window.close();}
