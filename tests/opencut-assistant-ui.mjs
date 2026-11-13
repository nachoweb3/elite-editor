import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import assert from 'node:assert/strict';
const mocks={
 '@/components/ui/button':`import React from 'react';export const Button=({variant,...p})=>React.createElement('button',p);`,
 '@/components/ui/input':`import React from 'react';export const Input=p=>React.createElement('input',p);`,
 '@/editor/use-editor':`export const useEditor=s=>s?s(globalThis.editor):globalThis.editor;`,
 '@/media/processing':`export const processMediaAssets=async()=>{throw Error('Unexpected media processing');};`,
 '@/timeline/element-utils':`export const buildElementFromMedia=p=>({...p,type:'video',sourceDuration:p.duration});export const buildTextElement=({raw,startTime})=>({...raw,startTime,type:'text'});`,
 '@/commands/timeline/tracks-snapshot':`export class TracksSnapshotCommand{constructor(p){Object.assign(this,p)}}`,
 '@/wasm':`export const mediaTimeFromSeconds=({seconds})=>Math.round(seconds*1000000);export const mediaTimeToSeconds=({time})=>time/1000000;`,
};
await build({entryPoints:['vendor/opencut-classic/apps/web/src/components/editor/panels/assets/views/nacho-assistant.tsx'],outfile:'cache/opencut-assistant-test.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],plugins:[{name:'editor-adapter',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:mocks[a.path]??(()=>{throw Error(a.path)})(),loader:'js'}));}}]});
const dom=new JSDOM('<div id="test"></div>',{url:'http://127.0.0.1:5181'});
for(const key of ['window','document','HTMLElement','Event','MouseEvent','localStorage'])globalThis[key]=dom.window[key];
const {createRoot}=await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const p={id:'source',name:'Original',revision:2,settings:{subtitles:true,faceRetouch:true},clips:[{start:2,end:5,enabled:true}],jobs:[],artifacts:{enhancedSource:{key:"test",revision:2}}};
let tracks={main:{id:'main',type:'video',elements:[]},overlay:[],audio:[]},command,posted;
globalThis.editor={project:{getActive:()=>({metadata:{id:'editor'},settings:{canvasSize:{height:1080}}})},media:{getAssets:()=>[{id:'asset',name:'nacho-source.mp4'},{id:'enhanced',name:'nacho-source-enhanced-test.mp4'}]},timeline:{updateElements:({updates})=>{for(const u of updates){const track=[tracks.main,...tracks.overlay,...tracks.audio].find(t=>t.id===u.trackId);track.elements=track.elements.map(e=>e.id===u.elementId?{...e,...u.patch}:e);}}},scenes:{getActiveScene:()=>({id:'scene',tracks})},command:{execute:({command:c})=>{command=c;tracks=c.after;}}};
globalThis.fetch=async(url,options)=>{
 if(options?.method==='POST'){
  posted={url,body:JSON.parse(options.body),headers:options.headers};
  if(url.endsWith('/plan'))return {ok:true,json:async()=>({planId:'reviewed-plan',explanation:'Contraste mejorado',changes:[{key:'contrast',label:'Contraste',before:1,after:1.15,extra:false}],cuts:{seconds:0,pieces:0,extra:false}})};
  return {ok:true,json:async()=>({...p,revision:3})};
 }
 const body=url.endsWith('/session')?{token:'session-token'}:url.endsWith('/opencut')?{sourceDuration:20,clips:[{name:'Cut',start:2,end:5,at:0}],captions:[{text:'Hola',start:0,end:1}],limitations:[]}:url.endsWith('/projects')?[p]:p;
 return {ok:true,json:async()=>body};
};
const {NachoAssistant}=await import('../cache/opencut-assistant-test.mjs');
const root=createRoot(document.getElementById('test'));
const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(button,text);assert(!button.disabled,text);await act(async()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
try{
 await act(async()=>root.render(React.createElement(NachoAssistant)));
 await act(async()=>{const s=document.querySelector('select');s.value='source';s.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Añadir cortes y subtítulos a la timeline');
 assert.equal(tracks.main.elements.length,1);assert.equal(tracks.main.elements[0].trimStart,2000000);assert.equal(tracks.main.elements[0].duration,3000000);assert.equal(tracks.main.elements[0].trimEnd,15000000);assert.equal(tracks.overlay[0].elements[0].params.content,'Hola');assert.equal(command.before.main.elements.length,0);
 const unchanged=structuredClone(tracks);
 await click('Aplicar mejora a mi timeline');assert.equal(tracks.main.elements[0].mediaId,'enhanced');assert.deepEqual({...tracks.main.elements[0],mediaId:'asset'},unchanged.main.elements[0]);assert.deepEqual(tracks.overlay,unchanged.overlay);
 await click('Volver al original en la timeline');assert.deepEqual(tracks,unchanged);
 await click('Enviar mis cortes al motor');assert(posted.url.endsWith('/manual'));assert.equal(posted.headers['x-studio-token'],'session-token');assert.equal(posted.body.clips[0].sourceId,'source');assert.equal(posted.body.clips[0].end,5);
 // An additional import appends, never overwrites user edits; one snapshot can undo it.
 await click('Añadir cortes y subtítulos a la timeline');assert.equal(tracks.main.elements.length,2);assert.equal(tracks.main.elements[1].startTime,3000000);assert.equal(command.before.main.elements.length,1);
 tracks.main.elements[0].startTime=1000000;posted=null;
 await click('Enviar mis cortes al motor');assert.equal(posted,null);assert(document.querySelector('[role=alert]').textContent.includes('huecos'));
 const prompt=document.querySelector('input[aria-label="Instrucción de edición"]');
 const type=async value=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(prompt,value);prompt.dispatchEvent(new Event('input',{bubbles:true}));});
 const applyButton=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar a la propuesta IA');
 assert(applyButton().disabled);
 await type('Sube el contraste');await click('Ver qué cambiaría');
 assert(posted.url.endsWith('/plan'));assert.equal(posted.headers['x-studio-token'],'session-token');assert(!applyButton().disabled);
 assert(document.body.textContent.includes('Contraste: 1 → 1.15'));
 await type('Baja el contraste');assert(applyButton().disabled);
 await type('Sube el contraste');await click('Aplicar a la propuesta IA');
 assert.equal(posted.body.planId,'reviewed-plan');assert.equal(posted.body.revision,3);assert(applyButton().disabled);
 console.log('PASS assistant UI: reviewed prompt, changed-text guard, exact plan token, editable cuts, captions, append preservation, undo snapshot, authenticated roundtrip, gap rejection. Core/media are mocked; not a playback/export test.');
}finally{await act(async()=>root.unmount());dom.window.close();}
