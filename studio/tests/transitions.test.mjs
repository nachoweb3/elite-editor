import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {transitionFilter} from '../server/transition-filter.mjs';
import {validateManualClips} from '../server/manual-editor.mjs';
import {transitionFor} from '../shared/composition.mjs';
import {CLIP_TRANSITIONS} from '../shared/transitions.mjs';

const width=40,height=24,fps=20,frameBytes=width*height*3/2;

function renderEffect(type,source='white',out=null){
 const filter=transitionFilter({in:{type,duration:.4},out},.8);
 const data=execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-f','lavfi','-i',`color=${source}:s=${width}x${height}:r=${fps}:d=0.8`,
  '-vf','format=yuv420p'+filter,'-threads:v','1','-pix_fmt','yuv420p','-f','rawvideo','pipe:1',
 ],{windowsHide:true});
 assert.equal(data.length,fps*.8*frameBytes,'El efecto conserva el número de fotogramas');
 return (frame,x,y)=>data[frame*frameBytes+y*width+x];
}

test('all published entry presets validate and use the same bounded plan',()=>{
 const sources=new Map([['source',{name:'Clip',media:{duration:1}}]]);
 for(const type of Object.keys(CLIP_TRANSITIONS)){
  const [clip]=validateManualClips([{id:'clip',sourceId:'source',start:0,end:.2,transitionIn:type}],sources);
  assert.equal(clip.transitionIn,type);
  assert.deepEqual(transitionFor(clip,0,1).in,{type,duration:.1});
 }
 assert.deepEqual(transitionFor({start:0,end:1/60,transitionIn:'iris'},0,1,{},60),{in:null,out:null});
});

test('FFmpeg renders distinct slide and mask directions and restores the full image',()=>{
 const samples={
  slide:[[34,10],[4,10]],
  'slide-left':[[4,10],[34,10]],
  'slide-top':[[20,3],[20,20]],
  'slide-bottom':[[20,20],[20,3]],
  'wipe-right':[[4,10],[34,10]],
  'wipe-diagonal':[[4,3],[34,20]],
  'open-horizontal':[[20,10],[4,10]],
  'open-vertical':[[20,12],[20,3]],
  iris:[[20,12],[4,3]],
 };
 for(const [type,[revealed,covered]] of Object.entries(samples)){
  const luma=renderEffect(type);
  assert.equal(luma(0,10,10),16,`${type} empieza sobre negro`);
  assert.equal(luma(4,...revealed),235,`${type} muestra el lado esperado`);
  assert.equal(luma(4,...covered),16,`${type} cubre el otro lado`);
  assert.equal(luma(10,...covered),235,`${type} vuelve al fotograma completo`);
 }
});

test('a white entrance and a black global exit remain distinct',()=>{
 const luma=renderEffect('fadewhite','gray',{type:'fadeblack',duration:.2});
 assert.equal(luma(0,12,10),235);
 assert.ok(luma(10,12,10)>100);
 assert.ok(luma(15,12,10)<60);
});
