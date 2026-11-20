import test from 'node:test';
import assert from 'node:assert/strict';
import {brollCandidates} from '../server/broll.mjs';

test('Pexels suggestions use retained source time and skip screen tutorials',()=>{
  const project={
    clips:[{start:10,end:40,enabled:true},{start:45,end:70,enabled:true}],
    transcript:[
      {start:1,end:4,text:'Bitcoin'},
      {start:14,end:20,text:'Una criptomoneda'},
      {start:32,end:35,text:'Centro de datos'},
      {start:47,end:49,text:'Otro centro de datos'},
      {start:56,end:60,text:'Entrenamiento de fuerza'}
    ],
    analysis:{scenes:[{start:30,end:36,type:'screen'}]},
  };
  assert.deepEqual(brollCandidates(project).map(({query,outputTime})=>[query,outputTime]),[
    ['cryptocurrency digital tokens',7],
    ['data center server racks',33],
  ]);
});

test('director suggestions respect a small count, spacing and distinct queries',()=>{
  const project={clips:[{start:0,end:90,enabled:true}],transcript:[]};
  const requests=Array.from({length:8},(_,i)=>({at:5+10*i,query:i===2?'idea':'concepto '+i,reason:'Pertinente'}));
  const output=brollCandidates(project,requests);
  assert.deepEqual(output.map(item=>item.outputTime),[5,25,45,65]);
});
