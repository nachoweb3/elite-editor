import test from 'node:test';
import assert from 'node:assert/strict';
import {buildComposition,chromaFor,transitionFor,outputDuration} from '../shared/composition.mjs';

const base={
 id:'project-1',name:'Prueba',revision:1,
 media:{duration:10,width:1920,height:1080,audio:true},
 settings:{profile:'youtube',transition:.12,subtitles:true,subtitle:'Tutorial',subtitlePosition:'top',title:'Prueba',musicId:'music-1',musicVolume:.1,soundEffects:true,fit:'contain',cropX:.5,cropY:.5,zoom:1,exposure:0,contrast:1,saturation:1},
 clips:[
  {id:'a',start:0,end:2,enabled:true},
  {id:'b',start:2,end:4,enabled:true,transitionIn:'slide'},
 ],
 transcript:[{start:.4,end:1.6,text:'hola',words:[{word:'hola',start:.4,end:1.2}]}],
 automatic:{direction:{media:[
  {kind:'meme',file:'input/memes/verde.mp4',outputTime:1,duration:2,placement:{x:.1,y:.1,w:.3,h:.3},greenScreen:true,useAudio:true,volume:.2},
  {kind:'sound',file:'input/sonidos/beep.wav',outputTime:3,duration:1,volume:.4},
 ]}},
 audioTracks:[{id:'t1',assetId:'asset-1',name:'Música manual',kind:'music',at:0,sourceIn:0,duration:2,volume:.3,fadeIn:.2,fadeOut:.1,muted:false}],
};

test('native canvas uses display rotation and retains high frame rates without drift across cuts',()=>{
 const project={...base,media:{width:2560,height:1440,rotation:90,fps:'120/1'},settings:{...base.settings,profile:'source'},clips:[
  {id:'a',start:0,end:1.004,enabled:true},
  {id:'b',start:2,end:3.004,enabled:true},
  {id:'c',start:4,end:5.004,enabled:true},
 ]};
 const plan=buildComposition(project);
 assert.deepEqual([plan.width,plan.height,plan.fps],[1440,2560,120]);
 assert.equal(plan.timeline.reduce((total,clip)=>total+clip.frames,0),Math.round(plan.duration*120));
});

test('the shared plan carries clip timing, transitions and remapped words',()=>{
 const plan=buildComposition(base);
 assert.equal(outputDuration(base),4);
 assert.equal(plan.duration,4);
 assert.equal(plan.timeline.length,2);
 assert.equal(plan.timeline[0].transition.in,null);
 assert.deepEqual(plan.timeline[0].transition.out,{type:'fadeblack',duration:.12});
 assert.deepEqual(plan.timeline[1].transition.in,{type:'slide',duration:.22});
 assert.equal(plan.timeline[1].src,'/api/projects/project-1/media');
 assert.deepEqual(plan.words,[{word:'hola',start:.4,end:1.2}]);
});

test('the shared plan carries placement, chroma and every audio source',()=>{
 const plan=buildComposition(base);
 assert.equal(plan.visuals.length,1);
 assert.deepEqual(plan.visuals[0].placement,{x:.1,y:.1,w:.3,h:.3});
 assert.equal(plan.visuals[0].chroma.enabled,true);
 assert.equal(plan.visuals[0].chroma.color,'0x00FF00');
 assert.equal(plan.visuals[0].src,'/api/projects/project-1/live?i=0');
 const types=plan.audio.map(event=>event.type);
 assert.deepEqual(types,['media-overlay','media-sound','music','sound-effect','track']);
 assert.equal(plan.audio.find(event=>event.type==='media-sound').src,'/api/projects/project-1/live?i=1');
 assert.equal(plan.audio.find(event=>event.type==='sound-effect').at,2);
 assert.equal(plan.audio.find(event=>event.type==='track').src,'/api/asset?id=asset-1');
});

test('chroma can be explicit, disabled or left unknown for server detection',()=>{
 assert.equal(chromaFor({greenScreen:true}).enabled,true);
 assert.equal(chromaFor({greenScreen:false}).enabled,false);
 assert.equal(chromaFor({greenScreen:null}).enabled,null);
 assert.deepEqual(chromaFor({chroma:{enabled:true,color:'#00ff00',similarity:.1,blend:.2}}),{enabled:true,color:'0x00FF00',similarity:.1,blend:.2});
});

test('transition durations are bounded by the clip length',()=>{
 const short={start:0,end:.1,transitionIn:'fadeblack'};
 assert.deepEqual(transitionFor(short,0,1,{transition:0}),{in:{type:'fadeblack',duration:.05},out:null});
});
