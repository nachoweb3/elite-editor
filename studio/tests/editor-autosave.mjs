import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {defaults} from '../server/core.mjs';

await build({
  entryPoints:['web/src/VideoEditor.tsx'],
  outfile:'cache/editor-autosave-bundle.mjs',
  bundle:true,
  platform:'node',
  format:'esm',
  jsx:'automatic',
  packages:'external',
  loader:{'.css':'empty'},
  plugins:[{name:'player-test-double',setup(b){
    b.onResolve({filter:/^@remotion\/player$/},()=>({path:'player',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({
      resolveDir:process.cwd(),
      loader:'jsx',
      contents:`import React,{forwardRef,useImperativeHandle,useState} from 'react';export const Player=forwardRef((props,ref)=>{const [frame,setFrame]=useState(0);useImperativeHandle(ref,()=>({seekTo:setFrame,toggle(){},pause(){},addEventListener(){},removeEventListener(){}}),[]);return <div data-player-frame={frame}/>;});`,
    }));
  }}],
});

const dom=new JSDOM('<!doctype html><div id="test-root"></div>',{url:'http://127.0.0.1:5173/?project=montaje-a'});
for(const key of ['window','document','HTMLElement','HTMLMediaElement','HTMLDialogElement','localStorage','sessionStorage','location','Event','MouseEvent','KeyboardEvent','innerWidth','innerHeight','Node'])globalThis[key]=dom.window[key];
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const playing=new WeakMap();
Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !playing.get(this);}});
Object.defineProperty(HTMLMediaElement.prototype,'duration',{get(){return 20;}});
HTMLMediaElement.prototype.play=function(){playing.set(this,true);return Promise.resolve();};
HTMLMediaElement.prototype.pause=function(){playing.set(this,false);};
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
dom.window.Element.prototype.scrollIntoView=function(){};
localStorage.setItem('nacho:guia-vista','1');

const base={settings:{...defaults,profile:'youtube'},media:{duration:20,width:1920,height:1080,audio:true},audioTracks:[],transcript:[],reviewed:true,analysis:{warnings:[]},automatic:null,artifacts:{},jobs:[]};
let projectA={...base,id:'montaje-a',name:'Montaje A',revision:1,clips:[{id:'a',start:0,end:5,enabled:true,reason:''},{id:'b',start:10,end:20,enabled:true,reason:''}]};
let projectB={...base,id:'montaje-b',name:'Montaje B',revision:4,clips:[{id:'c',start:0,end:3,enabled:true,reason:''}]};
const manualBodies=[],projectReads=[],preflightRevisions=[],renderRevisions=[],versionRevisions=[];
let approvesOnExport=false;
let failManual=false,failPreflight=true;
globalThis.fetch=async(url,options={})=>{
  const path=String(url);
  if(path.endsWith('/session'))return {ok:true,json:async()=>({token:'test-token'})};
  if(path.endsWith('/projects')&&(!options.method||options.method==='GET'))return {ok:true,json:async()=>[projectA,projectB]};
  if(path.endsWith('/assets')||path.endsWith('/catalogue'))return {ok:true,json:async()=>[]};
  if(path.endsWith('/montaje-a/manual')){
    const body=JSON.parse(options.body||'{}');manualBodies.push(body);
    if(failManual)return {ok:false,json:async()=>({error:'No se pudo guardar el montaje'})};
    projectA={...projectA,...body,revision:(projectA.revision||0)+1,reviewed:true,artifacts:{}};
    return {ok:true,json:async()=>projectA};
  }
  if(path.endsWith('/montaje-b/manual')){
    const body=JSON.parse(options.body||'{}');manualBodies.push(body);
    if(failManual)return {ok:false,json:async()=>({error:'No se pudo guardar el montaje'})};
    projectB={...projectB,...body,revision:(projectB.revision||0)+1,reviewed:true,artifacts:{}};
    return {ok:true,json:async()=>projectB};
  }
  if(path.endsWith('/montaje-b/preflight')){
    preflightRevisions.push(projectB.revision);
    if(failPreflight){failPreflight=false;return {ok:false,json:async()=>({error:'No se pudo comprobar el montaje'})};}
    return {ok:true,json:async()=>({
      ok:true,revision:projectB.revision,width:1080,height:1920,fps:30,duration:3,
      encoder:'CPU',sizeRangeMB:[.6,3.1],measuredSizeMB:null,freeGB:30,timeRangeSeconds:[4,10],
      checks:[],resumable:false,lastJob:null,name:'Montaje B-final.mp4',
    })};
  }
  if(path.endsWith('/montaje-b/job')){
    const {preflightRevision,approveAfterPreflight}=JSON.parse(options.body).options;
    renderRevisions.push(preflightRevision);
    approvesOnExport=approveAfterPreflight===true;
    return {ok:true,json:async()=>({status:'queued'})};
  }
  if(path.endsWith('/montaje-b/versions')){
    if(options.method==='POST'){
      const {revision}=JSON.parse(options.body);
      versionRevisions.push({sent:revision,current:projectB.revision});
    }
    return {ok:true,json:async()=>({current:{revision:projectB.revision,clips:1,audioTracks:0,duration:3},versions:[]})};
  }
  if(path.endsWith('/projects/montaje-a')){projectReads.push('montaje-a');return {ok:true,json:async()=>projectA};}
  if(path.endsWith('/projects/montaje-b')){projectReads.push('montaje-b');return {ok:true,json:async()=>projectB};}
  return {ok:true,json:async()=>projectA};
};

const {Editor}=await import('../cache/editor-autosave-bundle.mjs');
const root=createRoot(document.getElementById('test-root'));
const click=async el=>{assert(el,'Falta el control');await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
const wait=ms=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const title=()=>document.querySelector('.nle-title')?.textContent||'';
const status=()=>document.querySelector('.nle-title small')?.textContent||'';
const projectArticle=name=>[...document.querySelectorAll('.nle-media-list article')].find(a=>a.textContent?.includes(name));

try{
  await act(async()=>{root.render(React.createElement(Editor));await new Promise(r=>setTimeout(r,30));});
  assert(title().includes('Montaje A'),'Debe abrir el proyecto indicado en la URL');

  const profile=document.querySelector('.nle-viewer-head select');
  await act(async()=>{profile.value='reels';profile.dispatchEvent(new Event('change',{bubbles:true}));});
  assert(status().includes('Cambios sin guardar'),'El cambio debe marcar el montaje como sucio');
  await wait(1450);
  assert.equal(manualBodies.length,1,'El autoguardado debe guardar tras el debounce');
  assert.equal(manualBodies[0].settings.profile,'reels','El autoguardado debe enviar el cambio');
  assert(status().includes('Guardado'),'El estado debe confirmar el guardado automático');

  await act(async()=>{profile.value='youtube';profile.dispatchEvent(new Event('change',{bubbles:true}));});
  assert(status().includes('Cambios sin guardar'),'El segundo cambio debe quedar sucio');
  const article=projectArticle('Montaje B');assert(article,'La biblioteca debe mostrar el otro proyecto');
  const open=[...article.querySelectorAll('button')].find(b=>b.textContent==='Abrir proyecto');assert(open,'Falta Abrir proyecto');
  await act(async()=>{open.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,80));});
  assert.equal(manualBodies.length,2,'Cambiar de proyecto debe guardar antes de abrir otro');
  assert.equal(manualBodies[1].settings.profile,'youtube','Debe guardar el último cambio, no el anterior');
  assert(title().includes('Montaje B'),'Debe abrir el proyecto elegido');
  assert(!status().includes('Cambios sin guardar'),'El montaje nuevo no debe heredar el estado sucio');

  await act(async()=>{profile.value='reels';profile.dispatchEvent(new Event('change',{bubbles:true}));});
  failManual=true;
  projectReads.length=0;
  const first=projectArticle('Montaje A');assert(first,'La biblioteca debe seguir mostrando el proyecto A');
  const openFirst=[...first.querySelectorAll('button')].find(b=>b.textContent==='Abrir proyecto');assert(openFirst,'Falta Abrir proyecto A');
  await act(async()=>{openFirst.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,80));});
  assert(title().includes('Montaje B'),'Si falla el guardado no debe cambiar de proyecto');
  assert.equal(projectReads.length,0,'No debe leer el otro proyecto si el guardado falla');
  assert(status().includes('Cambios sin guardar'),'El montaje debe seguir sucio para no perder el cambio');

  failManual=false;
  await click(document.querySelector('[data-guide="exportar"]'));
  const modal=()=>document.querySelector('[aria-labelledby="export-title"]');
  assert.equal(projectB.settings.profile,'reels','El preflight debe guardar el perfil recién cambiado');
  assert.deepEqual(preflightRevisions,[projectB.revision]);
  assert(modal().querySelector('[role="alert"]').textContent.includes('No se pudo comprobar'));
  assert.equal(modal().querySelector('.export-go'),null,'Una comprobación fallida no puede encolar el render');
  assert.equal(renderRevisions.length,0);
  await click([...modal().querySelectorAll('button')].find(button=>button.textContent==='Volver a comprobar'));
  assert(modal().textContent.includes('Montaje B-final.mp4'));
  await click(modal().querySelector('.export-go'));
  assert.deepEqual(renderRevisions,[projectB.revision],'El render debe tener la revisión comprobada');
  assert.equal(modal(),null);

  await act(async()=>{profile.value='youtube';profile.dispatchEvent(new Event('change',{bubbles:true}));});
  await click([...document.querySelectorAll('.nle-header button')].find(button=>button.textContent.trim()==='Versiones'));
  await click(document.querySelector('[aria-labelledby="versions-title"] button[type="submit"]'));
  assert.equal(projectB.settings.profile,'youtube','Guardar una versión debe guardar también la edición pendiente');
  assert.deepEqual(versionRevisions,[{sent:projectB.revision,current:projectB.revision}],'La versión debe apuntar a la revisión recién guardada');

  await click(document.querySelector('[aria-labelledby="versions-title"] button[aria-label="Cerrar"]'));
  projectB={...projectB,reviewed:false,artifacts:{preview:{revision:projectB.revision}}};
  await wait(1900);
  const savesBeforeChecking=manualBodies.length;
  await click(document.querySelector('[data-guide="exportar"]'));
  assert.equal(manualBodies.length,savesBeforeChecking,'Comprobar un montaje listo para revisión debe conservar la vista previa');
  await click(modal().querySelector('.export-go'));
  assert(approvesOnExport,'Confirmar el render debe aprobar la revisión comprobada');
  assert.equal(manualBodies.length,savesBeforeChecking);

  console.log('PASS autoguardado, cambio de proyecto y uso de la revisión guardada en preflight y versiones.');
}finally{
  await act(async()=>root.unmount());
  dom.window.close();
}
