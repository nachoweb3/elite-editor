import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {defaults} from '../server/core.mjs';

await build({entryPoints:['web/src/VideoEditor.tsx'],outfile:'cache/editor-interaction-bundle.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},plugins:[{name:'player-test-double',setup(b){b.onResolve({filter:/^@remotion\/player$/},()=>({path:'player',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({resolveDir:process.cwd(),loader:'jsx',contents:`import React,{forwardRef,useImperativeHandle,useState} from 'react';export const Player=forwardRef((props,ref)=>{const [frame,setFrame]=useState(0);useImperativeHandle(ref,()=>({seekTo:setFrame,toggle(){},pause(){},addEventListener(){},removeEventListener(){}}),[]);return <div data-player-frame={frame}/>;});`}));}}]});
const dom=new JSDOM('<!doctype html><div id="test-root"></div>',{url:'http://127.0.0.1:5173/?project=test'});
for(const key of ['window','document','HTMLElement','HTMLMediaElement','HTMLDialogElement','localStorage','sessionStorage','location','Event','MouseEvent','KeyboardEvent','innerWidth','innerHeight','Node'])globalThis[key]=dom.window[key];
localStorage.setItem('nacho:guia-vista','1');
localStorage.setItem('nacho:workspace-view','focus');
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const playing=new WeakMap();Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !playing.get(this);}});Object.defineProperty(HTMLMediaElement.prototype,'duration',{get(){return 20;}});
HTMLMediaElement.prototype.play=function(){playing.set(this,true);return Promise.resolve();};HTMLMediaElement.prototype.pause=function(){playing.set(this,false);};
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
// jsdom no calcula layout: la guía y los diálogos necesitan estos stubs.
dom.window.Element.prototype.scrollIntoView=function(){};
// jsdom no calcula layout; el trap de foco descarta elementos sin rectángulos.
dom.window.HTMLElement.prototype.getClientRects=function(){return [{width:1,height:1,top:0,left:0,right:1,bottom:1,x:0,y:0,toJSON(){return {}}}]};
const project={id:'test',name:'Grabación',revision:1,settings:defaults,media:{duration:20,width:1920,height:1080,audio:true},clips:[{id:'a',start:0,end:5,enabled:true,reason:''},{id:'b',start:10,end:20,enabled:true,reason:''}],audioTracks:[],transcript:[],reviewed:true,analysis:{warnings:[]},automatic:{status:'review',decisions:[]},artifacts:{preview:{}},jobs:[{id:'job',type:'auto-review',status:'done',message:'Listo'}],shorts:{status:'ready',count:1,generatedAt:'2026-11-20T00:00:00.000Z',renderedAt:'2026-11-20T00:00:00.000Z',items:[{id:'s1',index:1,start:1,end:11,duration:10,hook:'Prueba de short',status:'ready',file:'/tmp/s1.mp4'}]}};
const usage={plan:{key:'free',label:'Gratis',unlimited:false},period:'2026-11',resetsAt:'2026-12-01T00:00:00.000Z',metrics:[{key:'projects',label:'Proyectos',used:1,limit:10,remaining:9,percent:10}]};
project.sourceParts=[{name:'01.mp4',start:0,end:8},{name:'02.mp4',start:8,end:20}];
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('/session')?{token:'test'}:String(url).endsWith('/usage')?usage:String(url).endsWith('/account/sessions')?[]:String(url).endsWith('/account/activity')?[]:String(url).endsWith('/trash')?{projects:0,assets:0,bytes:0,oldest:null}:String(url).endsWith('/admin/accounts')?[]:String(url).endsWith('/projects/new')?{...project,id:'blank',blank:true,name:'Proyecto sin título',clips:[],jobs:[],automatic:null,artifacts:{},media:{duration:0,width:1920,height:1080,audio:false}}:String(url).endsWith('/projects')?[project]:String(url).endsWith('/assets')?[]:project});
const {Editor}=await import('../cache/editor-interaction-bundle.mjs');
const root=createRoot(document.getElementById('test-root'));
const click=async el=>{assert(el,'Missing control');await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const key=async(key,code=key)=>act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key,code,bubbles:true})));
try{
 await act(async()=>{root.render(React.createElement(Editor));await new Promise(r=>setTimeout(r,20));});
 const studio=document.querySelector('.nle');
 const workspacePicker=document.querySelector('[aria-label="Vista del espacio de trabajo"]');
 assert(studio&&workspacePicker,'El selector de vista debe estar en la cabecera');
 const themePicker=document.querySelector('.studio-theme-picker select');
 assert(themePicker,'Proyecto debe ofrecer el selector del tema visual');
 assert.equal(themePicker.value,'cobalt','El tema predeterminado es Azul cobalto');
 assert.equal(document.documentElement.dataset.studioTheme,'cobalt');
 await act(async()=>{themePicker.value='lime';themePicker.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(document.documentElement.dataset.studioTheme,'lime');
 assert.equal(localStorage.getItem('nacho:studio-theme'),'lime');
 assert.equal(document.querySelector('.nle'),studio,'Cambiar el tema conserva la misma sesión de edición');
 await act(async()=>{themePicker.value='cobalt';themePicker.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(localStorage.getItem('nacho:studio-theme'),'cobalt');
 assert.equal(studio.dataset.workspace,'focus','La vista guardada se restaura al abrir el editor');
 assert.equal(workspacePicker.value,'focus');
 await key('f');
 assert.equal(studio.dataset.workspace,'cinema','F amplía el monitor');
 assert.equal(localStorage.getItem('nacho:workspace-view'),'cinema');
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'F',shiftKey:true,bubbles:true})));
 assert.equal(studio.dataset.workspace,'focus','Mayús+F conserva la línea de tiempo');
 await key('Escape');
 assert.equal(studio.dataset.workspace,'editor','Escape vuelve a la vista completa');
 await act(async()=>{workspacePicker.value='focus';workspacePicker.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(localStorage.getItem('nacho:workspace-view'),'focus','La selección en cabecera se guarda');
 await key('Escape');
 let v=document.querySelector('.nle-canvas video');assert(v,'Finished preview must be visible');
 await click(document.querySelectorAll('.workflow-steps button')[1]);
 const recipe=[...document.querySelectorAll('.workflow-recipe-grid button')].find(item=>item.textContent.includes('Pódcast limpio'));
 await click(recipe);
 assert.equal(recipe.getAttribute('aria-pressed'),'true');
 const autoFormat=document.querySelector('.workflow-format select');
 assert.equal(autoFormat.value,'auto');
 const support=[...document.querySelectorAll('.workflow-opt-label')].find(item=>item.textContent.includes('Pexels'));
 assert.equal(support.querySelector('input').checked,false,'El pódcast puede prescindir de vídeo de apoyo');
 const short=[...document.querySelectorAll('.workflow-recipe-grid button')].find(item=>item.textContent.includes('Short dinámico'));
 await click(short);
 assert.equal(autoFormat.value,'vertical');
 assert.equal(support.querySelector('input').checked,true);
 await act(async()=>{autoFormat.value='horizontal';autoFormat.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(short.getAttribute('aria-pressed'),'false','Editar el formato ajusta la receta sin bloquear sus opciones');
 await click(document.querySelector('[aria-labelledby="auto-options-title"] button[aria-label="Cerrar"]'));
 // Regresión: los shorts automáticos y su paquete .zip viven en la pestaña Creador del editor.
 const tabButton=label=>[...document.querySelectorAll('.lib-tab-btn')].find(b=>b.textContent.includes(label));
 assert(tabButton('Creador'),'Falta la pestaña Creador');
 await click(tabButton('Creador'));await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 const packLink=document.querySelector('.lib-panel .shortspack-zip');
 assert(packLink,'La pestaña Creador debe ofrecer el paquete de publicación');
 assert.equal(packLink.getAttribute('href'),'/api/projects/test/shorts-package?download=1&ids=s1','El .zip debe pedir los shorts listos del proyecto');
 assert(packLink.textContent.includes('1 en .zip'),'El paquete debe contar el short listo');
 assert(document.querySelector('.lib-panel .shortcard'),'El short listo debe listarse en el editor');
 await click(document.querySelector('.shortspack-all input'));
 assert.equal(document.querySelector('.lib-panel .shortspack-zip'),null,'Deseleccionar todo no debe descargar el ZIP completo');
 await click(document.querySelector('.shortpick input'));
 assert(document.querySelector('.lib-panel .shortspack-zip'),'Volver a seleccionar el short habilita el ZIP');
 await click(tabButton('Medios'));await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 await key(' ','Space');assert.equal(v.paused,false,'Space must play the visible processed video');
 await key(' ','Space');assert.equal(v.paused,true);
 await act(async()=>{v.currentTime=3;v.dispatchEvent(new Event('timeupdate',{bubbles:true}));});
 await key('ArrowRight');assert(Math.abs(v.currentTime-3-1/30)<1e-8);
 await click(document.querySelector('button[aria-label="Ir a la parte 2: 02.mp4"]'));
 assert.equal(document.querySelector('[data-player-frame]')?.getAttribute('data-player-frame'),'150','La marca salta al primer fotograma conservado de la parte recortada');
 await act(async()=>document.querySelector('.nle-ruler').dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:180})));
 assert.equal(document.querySelector('[data-player-frame]')?.getAttribute('data-player-frame'),'180','Timeline click must mount editing player and seek');
 await click(button('Original'));v=document.querySelector('.nle-canvas video');await act(async()=>v.dispatchEvent(new Event('loadedmetadata')));assert.equal(v.currentTime,11,'Original should open at the matching source moment');
 await click(button('Ver y escuchar'));const dialog=document.querySelector('dialog');assert(dialog.open);const excerpt=dialog.querySelector('video');await act(async()=>excerpt.dispatchEvent(new Event('loadedmetadata')));assert.equal(excerpt.currentTime,4);
 await key(' ','Space');assert(v.paused,'Shortcuts inside the review must not start the main monitor');
 await act(async()=>{excerpt.currentTime=11;excerpt.dispatchEvent(new Event('timeupdate'));});assert(excerpt.paused,'Cut review must stop after context');
 await click(button('Conservar este tramo'));assert(!dialog.open);assert.equal(document.querySelectorAll('.nle-clip').length,3,'Restore must add exactly the missing interval');assert(document.querySelector('.cut-review').textContent.includes('0 tramos'));
 await key('z','KeyZ'); // No modifier: must not undo.
 assert.equal(document.querySelectorAll('.nle-clip').length,3);
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true})));assert.equal(document.querySelectorAll('.nle-clip').length,2,'Ctrl+Z must restore the cut');
 globalThis.XMLHttpRequest=class{upload={};status=201;responseText=JSON.stringify({...project,id:'second',name:'Segundo vídeo',jobs:[],automatic:null,artifacts:{}});open(){}setRequestHeader(){}send(){queueMicrotask(()=>this.onload());}};
 await click(document.querySelector('.nle-import'));
 const input=document.querySelector('.nle-library input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[new dom.window.File(['video'],'second.mp4',{type:'video/mp4'})]});
 await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,10));});
 assert(document.querySelector('.nle-title').textContent.startsWith('Grabación'),'Library import must not replace the current montage');
 assert(document.querySelector('.nle-media-list').textContent.includes('Segundo vídeo'));
 await click(button('Nuevo proyecto vacío'));assert.equal(document.querySelectorAll('.nle-clip').length,0);assert(document.querySelector('.nle-empty').textContent.includes('Tu lienzo está vacío'));assert(button('Original').disabled,'Blank project has no original video');

 // El selector común acepta varias partes y exige confirmar su orden.
 await click([...document.querySelectorAll('.workflow-steps button')].find(b=>b.textContent.includes('Importar vídeo')));
 Object.defineProperty(input,'files',{configurable:true,value:['11-cierre.mp4','2-entrevista.mp4','01-intro.mp4'].map(name=>new dom.window.File(['video'],name,{type:'video/mp4'}))});
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 const partsDialog=document.querySelector('[aria-labelledby="parts-title"]');
 assert(partsDialog,'Debe abrir una confirmación antes de unir');
 const names=()=>[...partsDialog.querySelectorAll('li span')].map(part=>part.textContent);
 assert.deepEqual(names(),['01-intro.mp4','2-entrevista.mp4','11-cierre.mp4']);
 await click(partsDialog.querySelector('button[aria-label="Subir 11-cierre.mp4"]'));
 assert.deepEqual(names(),['01-intro.mp4','11-cierre.mp4','2-entrevista.mp4']);
 await click(partsDialog.querySelector('button[aria-label="Cerrar"]'));
 assert(!document.querySelector('[aria-labelledby="parts-title"]'));

 // Regresión: Plan y Atajos atrapan el foco y se cierran con Escape o con el fondo.
 const overlay=()=>document.querySelector('.modal-overlay');
 const modal=()=>document.querySelector('.modal-card');
 const focusables=()=>{const card=modal();assert(card,'Debe haber una tarjeta modal');return [...card.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el=>{if(el===document.activeElement)return true;if(el.tagName!=='SUMMARY'&&el.closest('details:not([open])'))return false;const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&el.getClientRects().length>0;});};
 const dialogKey=async(key,shiftKey=false)=>{const event=new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true});await act(async()=>document.dispatchEvent(event));return event;};
 const assertTrap=async label=>{const card=modal();assert(card,`${label}: falta la tarjeta`);const f=focusables();assert(f.length,`${label}: no hay elementos enfocables`);assert(card.contains(document.activeElement),`${label}: el foco inicial debe estar dentro`);f.at(-1).focus();const lastTab=await dialogKey('Tab');assert.equal(document.activeElement,f[0],`${label}: Tab desde el último debe volver al primero`);assert(lastTab.defaultPrevented,`${label}: Tab en el límite debe cancelarse`);f[0].focus();const firstShiftTab=await dialogKey('Tab',true);assert.equal(document.activeElement,f.at(-1),`${label}: Shift+Tab desde el primero debe ir al último`);assert(firstShiftTab.defaultPrevented,`${label}: Shift+Tab en el límite debe cancelarse`);const outside=[...document.querySelectorAll('.nle-header button:not([disabled])')].find(item=>!card.contains(item));assert(outside,`${label}: falta un control exterior`);outside.focus();const reentry=await dialogKey('Tab');assert.equal(document.activeElement,f[0],`${label}: Tab desde fuera debe devolver el foco a la tarjeta`);assert(reentry.defaultPrevented,`${label}: la reentrada debe cancelar Tab`);assert(card.contains(document.activeElement),`${label}: el foco no debe salir`);};

 await click(button('Plan'));await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 await assertTrap('Plan');
 await dialogKey('Escape');assert(!modal(),'Plan debe cerrarse con Escape');
 await click(button('Plan'));await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 const planOverlay=overlay();assert(planOverlay,'Plan debe tener fondo');await act(async()=>planOverlay.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})));assert(!modal(),'Plan debe cerrarse al pulsar el fondo');

 const shortcutsButton=document.querySelector('button[aria-label="Atajos de teclado"]');assert(shortcutsButton,'Falta el botón de Atajos');
 await click(shortcutsButton);await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 await assertTrap('Atajos');
 await dialogKey('Escape');assert(!modal(),'Atajos debe cerrarse con Escape');
 await click(shortcutsButton);await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 const shortcutsOverlay=overlay();assert(shortcutsOverlay,'Atajos debe tener fondo');await act(async()=>shortcutsOverlay.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})));assert(!modal(),'Atajos debe cerrarse al pulsar el fondo');

 console.log('PASS DOM interactions: visible player transport, timeline seek, source mapping, cut review/context, restore, undo, Plan/Shortcuts focus trap, Escape and backdrop close, and the shorts .zip package inside the editor Creador tab. Media decoding and browser layout are not simulated.');
}finally{await act(async()=>root.unmount());dom.window.close();}
