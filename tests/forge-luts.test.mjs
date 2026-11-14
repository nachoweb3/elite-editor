import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PACK,generate,LUT_DIR,LUT_STEMS,LUT_TITLES,listLuts,lutFile,lutFileIn,lutFilter} from '../server/library/forge/luts.mjs';
import {sourceDefaults,sourceSettings,sourceAudioFilters,sourceVideoFilters} from '../server/source-settings.mjs';
import {defaults,validateSettings,projectDir,save} from '../server/core.mjs';
import {applyPlan,describeChanges,unrequested,previewInstruction} from '../server/prompt-editor.mjs';
import {rulePlan} from '../server/rule-planner.mjs';
import {frameFilter} from '../server/engine.mjs';

// Everything is generated in a temporary folder whose name has a space, like the real checkout.
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'elite lut test '));
const dir=path.join(tmp,'luts');
const logs=[];
const first=await generate({dir,log:m=>logs.push(m)});
// Settings validation looks for looks in LUT_DIR; the env override points it at the temporary folder.
process.env.ELITE_LUT_DIR=dir;
after(async()=>{delete process.env.ELITE_LUT_DIR;await fs.rm(tmp,{recursive:true,force:true});});

const cube=stem=>path.join(dir,stem+'.cube');
function parseCube(text){
 const lines=text.split('\n').filter(Boolean),head=[],rows=[];
 for(const line of lines){if(/^-?[\d.]+ -?[\d.]+ -?[\d.]+$/.test(line))rows.push(line.split(' ').map(Number));else if(!rows.length)head.push(line);else throw Error('línea inesperada tras los datos: '+line);}
 return {head,rows};
}
// Applies a filter chain to a flat colour with the real ffmpeg and returns the centre pixel as [r,g,b] (0-255).
function pixel(vf,{color='0x808080',cwd=os.tmpdir(),size='32x32'}={}){
 const r=spawnSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i',`color=c=${color}:s=${size}:r=1:d=1,format=rgb24`,'-vf',vf,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{cwd,encoding:'buffer',maxBuffer:1e7});
 assert.equal(r.status,0,String(r.stderr));
 const [w,h]=size.split('x').map(Number),i=((h>>1)*w+(w>>1))*3;
 return [...r.stdout.subarray(i,i+3)];
}
const grey=(stem,cwd)=>pixel(`format=rgb24,${lutFilter(cube(stem))}`,{cwd});
const project=(duration=180,settings={})=>({id:'00000000-0000-0000-0000-000000000000',name:'Synthetic',media:{duration,width:1920,height:1080},settings:{...defaults,...settings},clips:[{id:'0',start:0,end:duration,enabled:true}]});
const keys=plan=>Object.fromEntries(plan.changes.map(c=>[c.key,c.value]));

test('the pack generates the fourteen looks with the forge contract and a CC0 manifest',async()=>{
 assert.equal(PACK.id,'luts');assert.equal(PACK.title,'Looks de color (LUT)');assert.ok(PACK.description.length>20);
 assert.equal(LUT_STEMS.length,14);assert.equal(new Set(LUT_STEMS).size,14);
 for(const stem of LUT_STEMS)assert.match(stem,/^[a-z0-9-]{2,40}$/);
 assert.equal(first.total,14);assert.equal(first.made,14);assert.deepEqual(first.failed,[]);assert.equal(first.items.length,14);
 for(const item of first.items){
  assert.ok(LUT_STEMS.includes(item.id));assert.equal(item.file,cube(item.id));assert.ok(path.isAbsolute(item.file));
  assert.equal(item.kind,'lut');assert.equal(item.title,LUT_TITLES[item.id]);assert.equal(item.category,'LUT de color');
  assert.ok(Array.isArray(item.tags)&&item.tags.includes('lut')&&item.tags.length>=8);assert.ok(item.description.length>20);
  assert.ok((await fs.stat(item.file)).size>100_000);
  assert.ok(path.isAbsolute(item.preview));
 }
 assert.ok(logs.length>=14);
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 assert.equal(manifest.license,'CC0-1.0');assert.equal(manifest.author,'Elite Editor');assert.equal(manifest.looks.length,14);
 assert.deepEqual(manifest.looks.map(l=>l.stem),LUT_STEMS);
 assert.deepEqual((await fs.readdir(dir)).filter(f=>f.startsWith('.card')||f.endsWith('.tmp')),[],'no scratch files left behind');
});

test('each .cube is a valid standard 25x25x25 table with values in range and red varying fastest',async()=>{
 for(const stem of LUT_STEMS){
  const {head,rows}=parseCube(await fs.readFile(cube(stem),'utf8'));
  assert.match(head[0],/^TITLE ".+"$/,stem);
  assert.ok(head.includes('LUT_3D_SIZE 25'),stem);assert.ok(head.includes('DOMAIN_MIN 0.0 0.0 0.0'),stem);assert.ok(head.includes('DOMAIN_MAX 1.0 1.0 1.0'),stem);
  assert.equal(rows.length,25**3,stem);
  for(const row of rows)for(const v of row)assert.ok(Number.isFinite(v)&&v>=0&&v<=1,`${stem}: ${v}`);
 }
 // A near-identity look shows the lattice order: next row = red step, +25 rows = green step, +625 rows = blue step.
 const {rows}=parseCube(await fs.readFile(cube('piel-natural'),'utf8'));
 assert.ok(rows[1][0]>rows[0][0]+.03&&Math.abs(rows[1][1]-rows[0][1])<.01&&Math.abs(rows[1][2]-rows[0][2])<.01,'red varies fastest');
 assert.ok(rows[25][1]>rows[0][1]+.03&&Math.abs(rows[25][0]-rows[0][0])<.01,'green is the second axis');
 assert.ok(rows[625][2]>rows[0][2]+.03&&Math.abs(rows[625][0]-rows[0][0])<.01,'blue is the slowest axis');
 assert.deepEqual(rows.at(-1).map(v=>Math.round(v)),[1,1,1]);
});

test('previews are 480x270 JPEG images made with the real LUT',async()=>{
 for(const stem of LUT_STEMS){
  const file=path.join(dir,stem+'.jpg'),bytes=await fs.readFile(file);
  assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8,stem+' is a JPEG');
 }
 const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',path.join(dir,'sepia-suave.jpg')],{encoding:'utf8'});
 assert.equal(r.stdout.trim(),'480,270');
 // The sepia preview is warm where the card is a neutral grey ramp; the black-and-white one is neutral.
 const warm=spawnSync('ffmpeg',['-v','error','-i',path.join(dir,'sepia-suave.jpg'),'-vf','crop=4:4:238:233','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'});
 assert.ok(warm.stdout[0]>warm.stdout[2]+15,'sepia ramp is warm');
 const mono=spawnSync('ffmpeg',['-v','error','-i',path.join(dir,'blanco-negro-contraste.jpg'),'-vf','crop=4:4:238:233','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'});
 assert.ok(Math.abs(mono.stdout[0]-mono.stdout[2])<=3,'b/w ramp is neutral');
});

test('generation is idempotent, honours only/force and survives an individual failure',async()=>{
 const before=await fs.stat(cube('sepia-suave')),jpgBefore=await fs.stat(path.join(dir,'sepia-suave.jpg'));
 await new Promise(r=>setTimeout(r,30));
 const again=await generate({dir});
 assert.equal(again.made,14);assert.deepEqual(again.failed,[]);assert.equal(again.items.length,14);
 assert.equal((await fs.stat(cube('sepia-suave'))).mtimeMs,before.mtimeMs,'existing cube is not rewritten');
 assert.equal((await fs.stat(path.join(dir,'sepia-suave.jpg'))).mtimeMs,jpgBefore.mtimeMs);
 // A missing preview is rebuilt without touching the cube.
 await fs.rm(path.join(dir,'sepia-suave.jpg'));
 await generate({dir,only:['sepia-suave']});
 assert.ok((await fs.stat(path.join(dir,'sepia-suave.jpg'))).size>1000);assert.equal((await fs.stat(cube('sepia-suave'))).mtimeMs,before.mtimeMs);
 // force rewrites, and the result is deterministic.
 const bytes=await fs.readFile(cube('piel-natural'));
 const forced=await generate({dir:path.join(tmp,'forced'),only:['piel-natural','no-existe'],force:true});
 assert.equal(forced.total,1);assert.equal(forced.items.length,1);assert.deepEqual(await fs.readFile(forced.items[0].file),bytes);
 assert.deepEqual(listLuts(path.join(tmp,'forced')).map(l=>l.stem),['piel-natural']);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(tmp,'forced','manifest.json'),'utf8')).looks.map(l=>l.stem),['piel-natural']);
 // One look cannot be written (a folder squats its file name): the others are still produced.
 const broken=path.join(tmp,'broken');await fs.mkdir(path.join(broken,'frio-azulado.cube'),{recursive:true});
 const partial=await generate({dir:broken,only:['frio-azulado','sepia-suave'],force:true});
 assert.equal(partial.total,2);assert.deepEqual(partial.items.map(i=>i.id),['sepia-suave']);assert.deepEqual(partial.failed.map(f=>f.id),['frio-azulado']);assert.ok(partial.failed[0].error.length>3);
});

test('lookup helpers validate stems and only list what exists on disk',()=>{
 assert.equal(lutFile('sepia-suave'),cube('sepia-suave'));assert.equal(lutFileIn(dir,'sepia-suave'),cube('sepia-suave'));
 for(const bad of ['../x','..','sepia-suave/../x','SEPIA','a','no-existe','','sepia suave','sepia-suave.cube',undefined,null,42,{}])assert.equal(lutFile(bad),null,String(bad));
 assert.equal(lutFileIn(path.join(tmp,'nada'),'sepia-suave'),null);
 const listed=listLuts();
 assert.deepEqual(listed.map(l=>l.stem),LUT_STEMS);
 for(const l of listed){assert.equal(l.title,LUT_TITLES[l.stem]);assert.ok(l.description);assert.equal(l.file,cube(l.stem));assert.equal(l.preview,path.join(dir,l.stem+'.jpg'));}
 assert.deepEqual(listLuts(path.join(tmp,'nada')),[]);
 assert.equal(path.basename(LUT_DIR),'luts');assert.ok(LUT_DIR.replace(/\\/g,'/').endsWith('library/forge/luts'));
});

test('piel-natural stays close to the identity on mid greys',async()=>{
 const {rows}=parseCube(await fs.readFile(cube('piel-natural'),'utf8'));
 for(let i=6;i<=18;i++){const v=i/24,row=rows[(i*25+i)*25+i];for(const c of row)assert.ok(Math.abs(c-v)<=.08,`grey ${v.toFixed(2)} -> ${row}`);}
 const [r,g,b]=grey('piel-natural');
 for(const c of [r,g,b])assert.ok(Math.abs(c-128)<=20,`ffmpeg grey ${[r,g,b]}`);
});

test('the looks really change the picture when ffmpeg applies them',()=>{
 const [bwR,bwG,bwB]=grey('blanco-negro-contraste');
 assert.ok(Math.abs(bwR-bwG)<=2&&Math.abs(bwG-bwB)<=2,`blanco-negro ${[bwR,bwG,bwB]}`);
 // And it removes the colour of a saturated input too.
 const red=pixel(`format=rgb24,${lutFilter(cube('blanco-negro-contraste'))}`,{color:'0xCC3322'});
 assert.ok(Math.abs(red[0]-red[1])<=2&&Math.abs(red[1]-red[2])<=2,`red -> ${red}`);
 const sepia=grey('sepia-suave');assert.ok(sepia[0]>sepia[2]+15,`sepia ${sepia}`);
 const cold=grey('frio-azulado');assert.ok(cold[2]>cold[0]+15,`frio ${cold}`);
 const warm=grey('calido-atardecer');assert.ok(warm[0]>warm[2]+15,`calido ${warm}`);
 const matrix=grey('verde-matrix');assert.ok(matrix[1]>matrix[0]+50&&matrix[1]>matrix[2]+50,`matrix ${matrix}`);
 const night=grey('noche-americana');assert.ok(night[2]>night[0]&&night[0]<110,`noche ${night}`);
 const dark=grey('dramatico-oscuro');assert.ok(dark[0]<110,`oscuro ${dark}`);
 const pastel=grey('mate-pastel');assert.ok(pastel[0]>128,`pastel ${pastel}`);
 // Black stays near black except in the faded looks.
 const black=pixel(`format=rgb24,${lutFilter(cube('mate-pastel'))}`,{color:'0x000000'});assert.ok(black[0]>=15,`pastel lifts blacks ${black}`);
 const crisp=pixel(`format=rgb24,${lutFilter(cube('cine-teal-naranja'))}`,{color:'0x000000'});assert.ok(crisp[0]<=10);
});

test('lutFilter escapes Windows drive letters and works from any folder, with spaces and odd characters',async()=>{
 const f=lutFilter(cube('sepia-suave'));
 assert.match(f,/^lut3d=file='.+':interp=tetrahedral$/);
 assert.ok(!f.replace(/\\:/g,'').includes('\\'),'only the drive colon is escaped; separators are forward slashes');
 if(process.platform==='win32')assert.match(f,/^lut3d=file='[A-Za-z]\\:\//);
 assert.ok(path.dirname(cube('sepia-suave')).includes(' '),'the test folder really has a space');
 // A different working directory, as thumbnails and enhanced sources use.
 const elsewhere=await fs.mkdtemp(path.join(os.tmpdir(),'elite cwd '));
 try{const [r,,b]=grey('sepia-suave',elsewhere);assert.ok(r>b+15);}finally{await fs.rm(elsewhere,{recursive:true,force:true});}
 // Apostrophes, brackets, commas and semicolons in the path (valid on Windows) survive too.
 const odd=path.join(tmp,"it's [a],b;c");await fs.mkdir(odd);await fs.copyFile(cube('sepia-suave'),path.join(odd,'x.cube'));
 const out=pixel(`format=rgb24,${lutFilter(path.join(odd,'x.cube'))}`);assert.ok(out[0]>out[2]+15,`odd path ${out}`);
});

test('the engine appends the look after denoise and sharpening, with an absolute path that works from any cwd',async()=>{
 const withLut={...defaults,lut:'sepia-suave',videoDenoise:.5,videoSharpen:.3,fit:'contain',zoom:1};
 const filters=sourceVideoFilters(withLut);
 assert.equal(filters.length,3);assert.match(filters[0],/^hqdn3d=/);assert.match(filters[1],/^unsharp=/);assert.match(filters[2],/^lut3d=file='.+sepia-suave\.cube':interp=tetrahedral$/);
 assert.equal(filters[2],lutFilter(cube('sepia-suave')));
 const chain=frameFilter(withLut,160,90);
 assert.ok(chain.endsWith(filters[2]),'the look is the last filter of the frame chain');
 const elsewhere=await fs.mkdtemp(path.join(os.tmpdir(),'elite cwd '));
 try{
  // engine.thumbnail runs ffmpeg with a temporary cwd and the same frame filter.
  const [r,,b]=pixel(chain,{size:'160x90',cwd:elsewhere});assert.ok(r>b+10,`frame chain ${[r,b]}`);
  // prepareEnhancedSource passes the video filters to -vf and encodes with libx264.
  const out=path.join(elsewhere,'enhanced.mp4'),enc=spawnSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','color=c=0x808080:s=160x90:r=10:d=0.5','-vf',filters.join(','),'-c:v','libx264','-pix_fmt','yuv420p','-y',out],{cwd:elsewhere,encoding:'utf8'});
  assert.equal(enc.status,0,enc.stderr);assert.ok((await fs.stat(out)).size>500);
 }finally{await fs.rm(elsewhere,{recursive:true,force:true});}
 assert.equal(sourceVideoFilters({...defaults}).length,0,'no look, no lut3d');
 assert.equal(frameFilter({...defaults,fit:'contain'},160,90).includes('lut3d'),false);
});

test('lut and audioTargetLufs are validated, and old projects without them keep validating',()=>{
 assert.equal(sourceDefaults.lut,'');assert.equal(sourceDefaults.audioTargetLufs,-16);assert.equal(defaults.lut,'');assert.equal(defaults.audioTargetLufs,-16);
 assert.equal(sourceSettings({}).lut,'');assert.equal(sourceSettings({}).audioTargetLufs,-16);
 assert.equal(sourceSettings({lut:''}).lut,'');assert.equal(sourceSettings({lut:'sepia-suave'}).lut,'sepia-suave');
 for(const bad of ['../x','..\\x','no-existe','SEPIA-SUAVE','sepia-suave/x','a',' sepia-suave',42,true,{},[]])assert.throws(()=>sourceSettings({lut:bad}),/LUT no disponible: genera el pack «Looks de color» en Recursos → ASSET FORGE/,String(bad));
 for(const ok of [-24,-23,-16,-14,-14.5,-9])assert.equal(sourceSettings({audioTargetLufs:ok}).audioTargetLufs,ok);
 for(const bad of [-24.1,-25,-8.9,0,14,NaN,Infinity,'-14','abc',{}])assert.throws(()=>sourceSettings({audioTargetLufs:bad}),/fuera de rango/,String(bad));
 // A project saved before these controls existed: the keys are filled with defaults.
 const {lut,audioTargetLufs,...legacy}=defaults;
 const upgraded=validateSettings(legacy);assert.equal(upgraded.lut,'');assert.equal(upgraded.audioTargetLufs,-16);
 assert.equal(validateSettings({...legacy,lut:null,audioTargetLufs:null}).audioTargetLufs,-16);
 assert.equal(validateSettings({lut:'frio-azulado'}).lut,'frio-azulado');
 assert.throws(()=>validateSettings({lut:'../../etc/passwd'}),/LUT no disponible/);
});

test('voice normalisation uses the chosen loudness target',()=>{
 assert.deepEqual(sourceAudioFilters({...defaults,cleanAudio:true}),['highpass=f=75','afftdn=nr=12:nf=-25','loudnorm=I=-16:TP=-1.5:LRA=11']);
 assert.ok(sourceAudioFilters({...defaults,cleanAudio:true,audioTargetLufs:-14}).includes('loudnorm=I=-14:TP=-1.5:LRA=11'));
 assert.ok(sourceAudioFilters({...defaults,cleanAudio:true,audioTargetLufs:-23}).includes('loudnorm=I=-23:TP=-1.5:LRA=11'));
 assert.ok(sourceAudioFilters({...defaults,cleanAudio:true,audioTargetLufs:-14.5}).includes('loudnorm=I=-14.5:TP=-1.5:LRA=11'));
 assert.equal(sourceAudioFilters({...defaults,cleanAudio:true,audioNormalize:false,audioTargetLufs:-14}).some(f=>f.startsWith('loudnorm')),false);
 assert.deepEqual(sourceAudioFilters({...defaults,cleanAudio:false,audioTargetLufs:-14}),[]);
 // The filter is accepted by the real ffmpeg.
 const r=spawnSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','sine=f=440:d=1','-af',sourceAudioFilters({...defaults,cleanAudio:true,audioTargetLufs:-14}).join(','),'-f','null','-'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});

test('applyPlan accepts the look and the loudness target and rejects anything else',()=>{
 const p=project();
 const out=applyPlan(p,{changes:[{key:'lut',value:'sepia-suave'},{key:'audioTargetLufs',value:'-14'}],remove:[],explanation:'x'});
 assert.equal(out.settings.lut,'sepia-suave');assert.equal(out.settings.audioTargetLufs,-14);
 assert.equal(applyPlan(project(180,{lut:'sepia-suave'}),{changes:[{key:'lut',value:''}],remove:[],explanation:'x'}).settings.lut,'');
 for(const value of ['../x','no-existe','Sepia-Suave','x'.repeat(41)]){
  assert.throws(()=>applyPlan(p,{changes:[{key:'lut',value}],remove:[],explanation:'x'}),/LUT|Control/,value);
 }
 assert.throws(()=>applyPlan(p,{changes:[{key:'lut',value:5}],remove:[],explanation:'x'}),/Control no admitido/);
 for(const value of ['-30','-5','abc','-14;rm'])assert.throws(()=>applyPlan(p,{changes:[{key:'audioTargetLufs',value}],remove:[],explanation:'x'}),/inválido|rango/,value);
 const changes=describeChanges(p,out);
 const byKey=Object.fromEntries(changes.map(c=>[c.key,c]));
 assert.equal(changes.length,2);
 assert.deepEqual([byKey.audioTargetLufs.label,byKey.audioTargetLufs.before,byKey.audioTargetLufs.after],['Volumen objetivo (LUFS)',-16,-14]);
 assert.deepEqual([byKey.lut.label,byKey.lut.before,byKey.lut.after],['Look de color (LUT)','','sepia-suave']);
 assert.equal(unrequested('pon un look de cine','lut'),false);assert.equal(unrequested('sube el contraste','lut'),true);
 assert.equal(unrequested('volumen para youtube','audioTargetLufs'),false);assert.equal(unrequested('sube el contraste','audioTargetLufs'),true);
});

test('the model is told about looks and loudness targets, and its answer is validated like any plan',async()=>{
 const id=randomUUID(),pdir=projectDir(id),originalFetch=globalThis.fetch;
 await fs.mkdir(pdir,{recursive:true});
 let request=null;
 globalThis.fetch=async(url,init)=>{request=JSON.parse(init.body);return {ok:true,status:200,json:async()=>({message:{content:JSON.stringify({explanation:'Look de cine',unsupported:false,changes:[{key:'lut',value:'cine-teal-naranja'},{key:'audioTargetLufs',value:'-14'}],remove:[]})}})};};
 try{
  await save({...project(),id,revision:1,jobs:[],artifacts:{},transcript:[]});
  const preview=await previewInstruction(id,'dale a la imagen un acabado de película taquillera y mejora la sonoridad',1);
  assert.equal(preview.engine,'ollama');
  const system=request.messages[0].content;
  for(const stem of LUT_STEMS)assert.ok(system.includes(stem),stem);
  assert.match(system,/audioTargetLufs de -24 a -9/);assert.match(system,/YouTube ≈ -14/);
  const keysEnum=request.format.properties.changes.items.properties.key.enum;
  assert.ok(keysEnum.includes('lut')&&keysEnum.includes('audioTargetLufs'));
  assert.deepEqual(Object.fromEntries(preview.changes.map(c=>[c.key,c.after])),{audioTargetLufs:-14,lut:'cine-teal-naranja'});
 }finally{globalThis.fetch=originalFetch;await fs.rm(pdir,{recursive:true,force:true});}
});

test('rule planner: look phrases in Spanish and English',()=>{
 const p=project();
 const cases={
  'look cine':'cine-teal-naranja','look cine / teal y naranja':'cine-teal-naranja','ponle un look de cine':'cine-teal-naranja','teal and orange look':'cine-teal-naranja',
  'look vintage/retro':'vintage-70','dale un look retro':'vintage-70','look cálido / atardecer':'calido-atardecer','look frío':'frio-azulado','sunset look':'calido-atardecer',
  'blanco y negro con contraste':'blanco-negro-contraste','look en blanco y negro':'blanco-negro-contraste','black and white with high contrast':'blanco-negro-contraste',
  'estilo cyberpunk / neón':'neon-cyberpunk','cyberpunk look':'neon-cyberpunk','look mate pastel':'mate-pastel','look bleach bypass':'bleach-bypass','estilo matrix':'verde-matrix',
  'look sepia':'sepia-suave','look dramático':'dramatico-oscuro','look youtuber':'vivo-youtuber','look piel natural':'piel-natural','look noche americana':'noche-americana',
 };
 const seen=new Set();
 for(const [prompt,stem] of Object.entries(cases)){
  const plan=rulePlan(prompt,p);assert.equal(plan.unsupported,false,prompt);assert.deepEqual(keys(plan),{lut:stem},prompt);
  assert.match(plan.explanation,/look de color/,prompt);
  assert.doesNotThrow(()=>applyPlan(p,plan),prompt);seen.add(stem);
 }
 assert.deepEqual([...seen].sort(),[...LUT_STEMS].sort(),'every look can be requested');
 for(const prompt of ['quita el look','sin LUT','sin look','quita el look de cine','remove the look','no quiero ningún look','elimina el LUT']){
  const plan=rulePlan(prompt,project(180,{lut:'sepia-suave'}));assert.deepEqual(keys(plan),{lut:''},prompt);assert.doesNotThrow(()=>applyPlan(project(180,{lut:'sepia-suave'}),plan),prompt);
 }
 const none=rulePlan('quita el look',p);assert.equal(none.unsupported,true);assert.match(none.explanation,/No hay ningún look/);
 const same=rulePlan('look sepia',project(180,{lut:'sepia-suave'}));assert.equal(same.unsupported,true);assert.match(same.explanation,/ya está aplicado/);
 // A look plus another request in the same sentence.
 assert.deepEqual(keys(rulePlan('look cálido y sube el contraste',p)),{lut:'calido-atardecer',contrast:'1.12'});
 assert.deepEqual(keys(rulePlan('look vivo con más contraste',p)),{lut:'vivo-youtuber',contrast:'1.12'});
 const withCut=rulePlan('look cine y quita los primeros 5 segundos',p);assert.deepEqual(keys(withCut),{lut:'cine-teal-naranja'});assert.deepEqual(withCut.remove,[{start:0,end:5}]);
});

test('rule planner: loudness phrases and no regressions in the existing wording',()=>{
 const p=project();
 assert.deepEqual(keys(rulePlan('volumen para YouTube',p)),{audioTargetLufs:'-14'});
 assert.deepEqual(keys(rulePlan('ajusta el volumen para youtube',p)),{audioTargetLufs:'-14'},'"youtube" here is a loudness target, not an output format');
 assert.deepEqual(keys(rulePlan('volumen para podcast',project(180,{audioTargetLufs:-14}))),{audioTargetLufs:'-16'});
 assert.deepEqual(keys(rulePlan('para podcast',project(180,{audioTargetLufs:-14}))),{audioTargetLufs:'-16'});
 assert.deepEqual(keys(rulePlan('volumen para tele',p)),{audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('volumen para broadcast',p)),{audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('para la tele',p)),{audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('set the loudness for broadcast',p)),{audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('normaliza a -14 lufs',p)),{audioTargetLufs:'-14'});
 assert.deepEqual(keys(rulePlan('normaliza a 18 LUFS',p)),{audioTargetLufs:'-18'});
 assert.deepEqual(keys(rulePlan('volumen a 40 lufs',p)),{audioTargetLufs:'-24'});
 assert.match(rulePlan('volumen a 40 lufs',p).explanation,/limitado a -24/);
 // The target only acts with the clean-up chain and normalisation on, so the plan switches them on.
 assert.deepEqual(keys(rulePlan('volumen para youtube',project(180,{cleanAudio:false,audioNormalize:false}))),{audioTargetLufs:'-14',cleanAudio:'true',audioNormalize:'true'});
 // Existing behaviour stays as it was.
 assert.deepEqual(keys(rulePlan('ponlo en blanco y negro',p)),{saturation:'0'});
 assert.deepEqual(keys(rulePlan('pon blanco y negro y sube el contraste',p)),{saturation:'0',contrast:'1.12'});
 assert.deepEqual(keys(rulePlan('hazlo cinematográfico',p)),{contrast:'1.1',saturation:'0.88'});
 assert.equal(keys(rulePlan('natural look',p)).lut,undefined,'"natural look" is still the portrait recipe, not a LUT');
 assert.equal(keys(rulePlan('natural look',p)).faceSmooth,'0.1');
 assert.deepEqual(keys(rulePlan('pon formato youtube con audio limpio',p)),{profile:'youtube'});
 assert.deepEqual(keys(rulePlan('formato youtube y volumen para tele',p)),{profile:'youtube',audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('pon formato youtube con volumen para tele',p)),{profile:'youtube',audioTargetLufs:'-23'});
 assert.deepEqual(keys(rulePlan('subtítulos estilo cine',p)),{subtitle:'Cinematic'});
 assert.deepEqual(keys(rulePlan('estilo de subtítulos viral',p)),{subtitle:'Viral'});
 assert.deepEqual(keys(rulePlan('piel más cálida',p)),{faceWarmth:'0.25'});
 assert.deepEqual(keys(rulePlan('sube el volumen de la música',p)),{musicVolume:'0.11'});
 assert.deepEqual(keys(rulePlan('sin música',p)),{musicVolume:'0'});
 assert.equal(rulePlan('sube el volumen',p).unsupported,true,'no target, no change');
 assert.equal(rulePlan('quiero un look que no existe',p).unsupported,true);
 const plan=rulePlan('volumen para youtube',p);assert.doesNotThrow(()=>applyPlan(p,plan));
});
