import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {accept,metaphorFor,formatProblem,stickmanSpliceGraph,summarizeDrops} from '../server/stickman.mjs';

const project=()=>({
  id:'prueba',media:{duration:20},
  clips:[{start:0,end:20,enabled:true}],
  transcript:[
    {start:0.4,end:8,text:'Hoy hablamos de la voz y del ruido; la clave es limpiar el audio.'},
    {start:9,end:19.6,text:'La aplicación tiene siete horas de uso diario en la pantalla.'},
  ],
});
const idea=extra=>({at:2,concept:'LIMPIAR EL SONIDO',caption:'Lo que sobra se queda fuera',metaphor:'filter',evidence:'la clave es limpiar el audio',confidence:0.9,...extra});

test('un concepto en el segundo 0 se coloca dentro del clip en vez de descartarse',()=>{
  const items=accept(project(),[idea({at:0})]);
  assert.equal(items.length,1,'el concepto no debe desaparecer');
  assert.equal(items[0].at,0.4,'se desplaza al primer punto con sitio dentro del clip');
  assert.ok(items[0].at>=0&&items[0].at<20);
});

test('el margen entre fichas crece con la duración del montaje',()=>{
  const raw=[
    idea({at:2}),
    idea({at:10,metaphor:'clock',evidence:'La aplicación tiene siete horas'}),
    idea({at:18,metaphor:'screen',evidence:'La aplicación tiene siete horas'}),
  ];
  assert.deepEqual(accept(project(),raw).map(i=>i.at),[2,10,18],'20 s de montaje dejan 8 s de margen');
  const long={...project(),clips:[{start:0,end:120,enabled:true}]};
  assert.deepEqual(accept(long,raw).map(i=>i.at),[2],'120 s de montaje exigen 20 s: ni 10 ni 18 s caben');
});

test('las reglas cubren palabras que la grabación no usa',()=>{
  assert.equal(metaphorFor('lo monto con una herramienta nueva'),'screen');
  assert.equal(metaphorFor('el plan es gratuito para todos'),'coins');
  assert.equal(metaphorFor('sin coste ni cuota'),'coins');
});
test('el modelo no puede colar titulares genéricos, pies imperativos ni figuras repetidas',()=>{
  const strict={strict:true};
  assert.equal(accept(project(),[idea({concept:'PROCESO'})],strict).length,0,'una categoría no es un titular');
  assert.equal(accept(project(),[idea({caption:'Muestra la aplicación FreeBuff'})],strict).length,0,'un pie no puede ser una orden');
  assert.equal(accept(project(),[idea({concept:'MEJORAR EL AUDIO GRABADO'})],strict).length,1);
  const repeated=accept(project(),[idea({at:2}),idea({at:12,evidence:'La aplicación tiene siete horas'})],strict);
  assert.equal(repeated.length,1,'la misma figura no se repite en dos ideas');
});
test('el margen se mide en el montaje, no en la fuente',()=>{
  const cut={id:'corte',media:{duration:30},clips:[{start:0,end:10,enabled:true},{start:20,end:30,enabled:true}],transcript:[
    {start:0.4,end:9.8,text:'Hoy hablamos de la voz y del ruido; la clave es limpiar el audio.'},
    {start:20.2,end:29.8,text:'La aplicación tiene siete horas de uso diario en la pantalla.'},
  ]};
  const dropped=[];
  const items=accept(cut,[
    idea({at:9.5}),
    idea({at:20.5,metaphor:'screen',concept:'USO EN LA PANTALLA',caption:'La pantalla muestra el uso',evidence:'La aplicación tiene siete horas'}),
  ],{onDrop:(code,detail)=>dropped.push({code,detail})});
  assert.equal(items.length,1,'separadas 11 s en origen, pero 1,7 s en pantalla');
  assert.equal(items[0].metaphor,'filter');
  assert.deepEqual(dropped,[{code:'margen',detail:1.7}],'el descarte se explica, no desaparece');
});
test('el resumen del descarte dice qué se perdió y por qué',()=>{
  assert.equal(summarizeDrops([]),'');
  assert.equal(summarizeDrops([{code:'margen',detail:3.8}]),'1 propuesta descartada: 1 por quedar a 3,8 s de otra ficha en pantalla.');
  assert.equal(summarizeDrops([{code:'margen',detail:6.6},{code:'margen',detail:2.4}]),'2 propuestas descartadas: 2 por quedar cerca de otra ficha en pantalla (2,4 s y 6,6 s).');
  assert.match(summarizeDrops([{code:'figura'},{code:'figura'},{code:'evidencia'}]),/^3 propuestas descartadas: 2 por repetir una figura; 1 porque la cita/);
});
test('sabe qué propuestas hay que devolver al modelo',()=>{
  assert.match(formatProblem(idea({concept:'IDEA'})),/titular/);
  assert.match(formatProblem(idea({concept:'ACCESO'})),/titular/);
  assert.match(formatProblem(idea({caption:'Muestra la aplicación'})),/orden/);
  assert.match(formatProblem(idea({caption:'Indica las horas'})),/orden/);
  assert.match(formatProblem(idea({caption:'Uso'})),/corto/);
  assert.equal(formatProblem(idea()),null);
});
test('el plan de reglas no pasa por los filtros del modelo',()=>{
  assert.equal(accept(project(),[idea({concept:'INTERFAZ VISUAL'})]).length,1,'un titular de dos palabras vale por reglas');
  const repeated=accept(project(),[idea({at:2}),idea({at:12,evidence:'La aplicación tiene siete horas'})]);
  assert.equal(repeated.length,2,'las reglas pueden repetir figura');
});
test('los titulares no acaban en artículo ni empiezan por «porque»',()=>{
  assert.equal(accept(project(),[idea({concept:'CÓMO SE VE EL USO EN LA'})])[0].concept,'CÓMO SE VE EL USO');
  const connector=accept(project(),[idea({at:12,concept:'PORQUE MI PANTALLA ES BASTANTE GRANDE',evidence:'La aplicación tiene siete horas'})]);
  assert.equal(connector[0].concept,'MI PANTALLA ES BASTANTE GRANDE');
  const pronoun=accept(project(),[idea({at:12,concept:'NO HACE FALTA INVERTIR EN ELLO OS',evidence:'La aplicación tiene siete horas'})]);
  assert.equal(pronoun[0].concept,'NO HACE FALTA INVERTIR EN ELLO','un pronombre tampoco cierra el titular');
});
test('la metáfora que el texto respalda no se cambia',()=>{
  const [clean]=accept(project(),[idea({at:3,metaphor:'filter'})]);
  assert.equal(clean.metaphor,'filter');
  const [tool]=accept(project(),[idea({at:12,metaphor:'screen',evidence:'La aplicación tiene siete horas de uso diario'})]);
  assert.equal(tool.metaphor,'screen','la figura del modelo se respeta aunque el texto mencione horas');
});

test('FFmpeg intercala un stickman sin perder fotogramas a 60 y 120 fps',()=>{
  const width=32,height=16,bytesPerFrame=width*height*3/2;
  for(const fps of [60,120]){
    const graph=stickmanSpliceGraph({width,height,duration:1.5},[{at:.5,duration:.5}],fps);
    const frames=execFileSync('ffmpeg',[
      '-hide_banner','-loglevel','error',
      '-f','lavfi','-i',`color=black:s=${width}x${height}:r=${fps}:d=1.5[out0];anullsrc=r=48000:d=1.5[out1]`,
      '-f','lavfi','-i',`color=white:s=${width}x${height}:r=${fps}:d=0.5[out0];anullsrc=r=48000:d=0.5[out1]`,
      '-filter_complex',`${graph};[aout]anullsink`,
      '-map','[vout]','-threads:v','1','-pix_fmt','yuv420p','-f','rawvideo','pipe:1',
    ],{windowsHide:true});
    assert.equal(frames.length,2*fps*bytesPerFrame);
    assert.equal(frames[.25*fps*bytesPerFrame],16);
    assert.equal(frames[.75*fps*bytesPerFrame],235);
    assert.equal(frames[1.25*fps*bytesPerFrame],16);
  }
});
