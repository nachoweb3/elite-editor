import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import assert from 'node:assert/strict';
const base='vendor/opencut-classic/apps/web/src/';
const mocks={
 '@/editor/use-editor':`export const useEditor=()=>globalThis.beautyEditor;`,
 '@/timeline/hooks/use-element-preview':`export const useElementPreview=()=>({renderElement:globalThis.beautyElement,previewUpdates:u=>{globalThis.beautyElement={...globalThis.beautyElement,...u};globalThis.previewCalls++;},commit:()=>globalThis.commits++});`,
 '@/effects/definitions/beauty':await fs.readFile(base+'effects/definitions/beauty.ts','utf8'),
 '@/components/ui/button':`import React from 'react';export const Button=({variant,size,...p})=>React.createElement('button',p);`,
 '@/components/editor/panels/assets/assets-panel-store':`export const useAssetsPanelStore={getState:()=>({setActiveTab:()=>{}})};`,
};
await build({entryPoints:[base+'components/editor/panels/properties/components/beauty-tab.tsx'],outfile:'cache/beauty-inspector-test.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],plugins:[{name:'adapter',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:mocks[a.path]??(()=>{throw Error(a.path)})(),loader:'ts'}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
for(const k of ['window','document','HTMLElement','Event','MouseEvent'])globalThis[k]=dom.window[k];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.previewCalls=0;globalThis.commits=0;
const {createRoot}=await import('react-dom/client');
const {BeautyTab}=await import('../cache/beauty-inspector-test.mjs');
const other={id:'color',type:'elite-color',enabled:true,params:{contrast:1.2}};
globalThis.beautyElement={id:'clip',type:'video',effects:[other],params:{},startTime:0,duration:1000};
globalThis.beautyEditor={timeline:{addClipEffect:()=>{beautyElement={...beautyElement,effects:[...beautyElement.effects,{id:'beauty',type:'elite-beauty',enabled:true,params:{smooth:0,light:0,warmth:0,detail:0}}]};},toggleClipEffect:()=>{beautyElement={...beautyElement,effects:beautyElement.effects.map(e=>e.id==='beauty'?{...e,enabled:!e.enabled}:e)};},removeClipEffect:()=>{beautyElement={...beautyElement,effects:beautyElement.effects.filter(e=>e.id!=='beauty')};}}};
const root=createRoot(document.getElementById('root'));
const render=()=>act(async()=>root.render(React.createElement(BeautyTab,{element:beautyElement,trackId:'main'})));
async function click(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,text);await act(async()=>b.dispatchEvent(new MouseEvent('click',{bubbles:true})));await render();}
try{
 await render();await click('Activar acabado en directo');
 const range=document.querySelector('input[aria-label="Suavizado con detalle"]');assert(range);
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(range,'0.4');range.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(previewCalls,1);assert.equal(commits,0);assert.equal(beautyElement.effects[1].params.smooth,.4);assert.deepEqual(beautyElement.effects[0],other);
 await act(async()=>range.dispatchEvent(new Event('pointerup',{bubbles:true})));assert.equal(commits,1);
 await click('Ver sin este acabado');assert.equal(beautyElement.effects[1].enabled,false);assert(document.querySelector('input').disabled);
 await click('Volver al acabado');assert.equal(beautyElement.effects[1].enabled,true);
 await click('Quitar acabado del clip');assert.deepEqual(beautyElement.effects,[other]);
 console.log('PASS beauty inspector: preview updates during slider input, commit on release, compare toggle, unrelated effect preserved, remove. Editor core mocked; GPU is tested separately.');
}finally{await act(async()=>root.unmount());dom.window.close();}
