import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {run,ROOT} from '../server/core.mjs';
import {normalizeLicense,licenseRecord,LICENSES} from '../server/library/licenses.mjs';
import {expandQuery} from '../server/library/glossary.mjs';
import {isPrivateAddress,assertPublicHttps,USER_AGENT} from '../server/library/net.mjs';
import {readZip,extractEntry} from '../server/library/zip.mjs';
import {sniff,checkSvg,classify} from '../server/library/classify.mjs';
import {LibraryStore} from '../server/library/store.mjs';
import {ingest,importFile,importFromUrl,downloadResult,syncBundled,fetchThumb} from '../server/library/ingest.mjs';
import {openverse,commons,ambientcg,polyhaven} from '../server/library/connectors/open.mjs';
import {pexels,pixabay,freesound,giphy,googlefonts} from '../server/library/connectors/keyed.mjs';
import {CONNECTORS,describeConnectors,connectorById} from '../server/library/connectors/index.mjs';
import {unifiedSearch,resetSearchCache,rememberResult} from '../server/library/search.mjs';
import {getKeys,setKey,configuredKeys} from '../server/library/keys.mjs';

const tmp=async fn=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'elite-lib-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}};
const png=async(dir,{alpha=false,size='64x48',color='red'}={})=>{const file=path.join(dir,`t-${Math.random().toString(36).slice(2)}.png`);await run('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=${color}:s=${size}`,'-frames:v','1',...(alpha?['-pix_fmt','rgba']:[]),file],{signal:null});return fs.readFile(file);};
function makeZip(entries){
 const locals=[],central=[];let offset=0;
 for(const [name,data,stored] of entries){
  const nameBuf=Buffer.from(name),body=stored?data:zlib.deflateRawSync(data),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(stored?0:8,8);local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
  locals.push(local,nameBuf,body);
  const cen=Buffer.alloc(46);cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);cen.writeUInt16LE(stored?0:8,10);cen.writeUInt32LE(body.length,20);cen.writeUInt32LE(data.length,24);cen.writeUInt16LE(nameBuf.length,28);cen.writeUInt32LE(offset,42);
  central.push(cen,nameBuf);offset+=30+nameBuf.length+body.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}

test('licences normalise provider codes and describe what each allows',()=>{
 assert.equal(normalizeLicense('CC BY-SA 4.0'),'CC-BY-SA');
 assert.equal(normalizeLicense('by-nc 4.0',{url:'https://creativecommons.org/licenses/by-nc/4.0/'}),'CC-BY-NC');
 assert.equal(normalizeLicense('',{url:'https://creativecommons.org/publicdomain/zero/1.0/'}),'CC0-1.0');
 assert.equal(normalizeLicense('pdm'),'PDM');assert.equal(normalizeLicense('Copyrighted free use'),'Unknown');
 assert.equal(licenseRecord('CC-BY-NC').commercial,false);assert.equal(licenseRecord('CC0-1.0').attribution,false);
 assert.equal(licenseRecord('CC-BY-ND').derivatives,false);assert.equal(licenseRecord('no-existe').id,'Unknown');
 for(const id of Object.keys(LICENSES))assert(LICENSES[id].name,id);
});

test('bilingual search expands Spanish to English for APIs and keeps synonym groups for local matching',()=>{
 const rain=expandQuery('lluvia en el bosque');
 assert.equal(rain.english,'rain forest');assert.equal(rain.translated,true);assert.equal(rain.groups.length,2,'stopwords are dropped from groups');
 assert(rain.groups[0].includes('lluvia')&&rain.groups[0].includes('rain'));
 assert.equal(expandQuery('rain forest').translated,false);
 assert.equal(expandQuery('perros').english,'dog','plural Spanish still translates');
 assert.equal(expandQuery('dogs').english,'dogs','English plurals are left alone');
});

test('network guard rejects private, local, credentialed and non-https targets',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.5','172.20.1.1','169.254.1.1','100.64.0.1','::1','fd00::1','::ffff:10.0.0.1'])assert(isPrivateAddress(ip),ip);
 assert.equal(isPrivateAddress('8.8.8.8'),false);
 for(const url of ['http://example.com/a','https://localhost/a','https://127.0.0.1/a','https://user:pw@example.com/a','https://[::1]/a','https://nas.local/a','nota url'])await assert.rejects(assertPublicHttps(url),undefined,url);
 await assert.doesNotReject(assertPublicHttps('https://8.8.8.8/a.png'));
 assert.match(USER_AGENT,/^[ -~]+$/,'the User-Agent is printable ASCII: Openverse answers 403 to accents');
});

test('zip reader extracts deflated and stored entries and refuses corrupt archives',()=>{
 const color=Buffer.from('COLOR-MAP'.repeat(50)),archive=makeZip([['wood_Color.jpg',color],['wood_Normal.jpg',Buffer.from('n')],['readme.txt',Buffer.from('hola'),true]]);
 const entries=readZip(archive);assert.deepEqual(entries.map(e=>e.name),['wood_Color.jpg','wood_Normal.jpg','readme.txt']);
 assert.deepEqual(extractEntry(archive,entries[0]),color);assert.equal(extractEntry(archive,entries[2]).toString(),'hola');
 assert.throws(()=>readZip(Buffer.from('no es un zip')),/zip/i);
 assert.throws(()=>extractEntry(archive,{...entries[0],size:entries[0].size+1}),/no coincide/);
 assert.throws(()=>extractEntry(archive,{...entries[0],size:200*1024*1024}),/demasiado grande/);
});

test('files are identified by their bytes; active SVG is refused; classification is explainable',async()=>tmp(async dir=>{
 assert.equal(sniff(await png(dir)).ext,'png');assert.equal(sniff(Buffer.from('<?xml version="1.0"?><svg viewBox="0 0 1 1"/>')).ext,'svg');
 assert.equal(sniff(Buffer.from('TITLE "x"\nLUT_3D_SIZE 3\n0 0 0\n')).kind,'lut');
 assert.equal(sniff(Buffer.from('{"v":"5","fr":30,"layers":[]}')).kind,'lottie');
 assert.equal(sniff(Buffer.from('esto es texto plano sin firma alguna')),null);
 assert.throws(()=>checkSvg(Buffer.from('<svg><script>alert(1)</script></svg>')),/activo/);
 assert.throws(()=>checkSvg(Buffer.from('<svg onload="x()"/>')),/activo/);
 assert.throws(()=>checkSvg(Buffer.from('<svg><image href="https://evil.test/x.png"/></svg>')),/externos/);
 assert.doesNotThrow(()=>checkSvg(Buffer.from('<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>')));
 assert.equal(classify({kind:'audio',title:'Deep whoosh',tags:['whoosh'],duration:1.4}).category,'Efecto de sonido');
 assert.equal(classify({kind:'audio',title:'Chill beat',tags:['music'],duration:60}).category,'Música');
 assert.equal(classify({kind:'audio',title:'Rain',tags:['ambience'],duration:30}).category,'Ambiente');
 assert.equal(classify({kind:'image',ext:'png',title:'star',alpha:true}).category,'Sticker');
 assert.equal(classify({kind:'image',ext:'jpg',title:'Wood',tags:['texture']}).category,'Textura');
 assert.equal(classify({kind:'video',title:'Light leak overlay',duration:5}).category,'Overlay en vídeo');
 assert.equal(classify({kind:'video',title:'Street',duration:30,width:1080,height:1920}).category,'Vídeo vertical');
 assert(classify({kind:'image',ext:'jpg',title:'Rain',tags:['rain']}).tags.includes('lluvia'),'Spanish tags are added');
}));

test('store dedupes by hash, merges provenance, searches in both languages and survives restarts',async()=>tmp(async dir=>{
 const store=new LibraryStore(path.join(dir,'lib')),license=licenseRecord('CC-BY');
 const base={ext:'png',kind:'image',title:'Rain on window',category:'Foto',tags:['rain','lluvia','window'],license,attribution:'x'};
 const a=await store.add({...base,buffer:Buffer.from('imagen-uno'),source:{connector:'openverse',sourceKey:'openverse:1',author:'Ana'}});
 assert.equal(a.duplicate,false);assert(a.item.id.startsWith('lib_'));
 const again=await store.add({...base,buffer:Buffer.from('imagen-uno'),source:{connector:'commons',sourceKey:'commons:9',author:'Ana'}});
 assert.equal(again.duplicate,true);assert.equal(again.item.sources.length,2,'the second place it was found is remembered');
 assert.equal(store.ownedBySource('commons:9'),a.item.id);
 await store.add({...base,buffer:Buffer.from('sonido'),ext:'wav',kind:'audio',title:'Whoosh',category:'Efecto de sonido',tags:['whoosh'],license:licenseRecord('CC0-1.0'),source:{connector:'forge',sourceKey:'forge:sounds:w'}});
 assert.equal(store.search('lluvia').total,1);assert.equal(store.search('rain window').total,1);assert.equal(store.search('lluvia ventana').total,0,'every word must match');
 assert.equal(store.search('',{kind:'audio'}).total,1);assert.equal(store.search('',{commercialOnly:true}).total,2);
 assert.equal(store.search('whoosh',{generated:false}).total,1,'generated flag filters');
 assert.equal(store.stats().items,2);assert.deepEqual(store.credits(),['x']);
 const reopened=new LibraryStore(path.join(dir,'lib'));await reopened.load();
 assert.equal(reopened.items.size,2);assert.equal(reopened.ownedBySource('openverse:1'),a.item.id);
 assert.equal(await fs.readFile(reopened.absolute(reopened.get(a.item.id)),'utf8'),'imagen-uno');
 await reopened.remove(a.item.id);assert.equal(reopened.items.size,1);await assert.rejects(reopened.remove('lib_nope'),/no encontrado/);
 await assert.rejects(fs.stat(store.absolute(a.item)));
}));

test('ingest probes real media, records licence and provenance, and refuses unsafe or unknown files',async()=>tmp(async dir=>{
 const store=new LibraryStore(path.join(dir,'lib'));
 const {item}=await ingest(await png(dir,{alpha:true,size:'80x60'}),{title:'Star icon',connector:'openverse',connectorName:'Openverse',sourceKey:'openverse:s1',sourceUrl:'https://example.org/s1',author:'Bo',licenseId:'CC-BY',tags:['star']},{store});
 assert.equal(item.kind,'image');assert.deepEqual([item.width,item.height],[80,60]);assert.equal(item.hasAlpha,true);assert.equal(item.category,'Icono','alpha + the word icon');
 assert.equal(item.license.attribution,true);assert.match(item.attribution,/Star icon.*Bo.*CC BY.*Openverse/);assert.equal(item.sources[0].sourceKey,'openverse:s1');
 const svg=await ingest(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="10" height="10"/></svg>'),{title:'Flecha',tags:['arrow'],licenseId:'CC0-1.0'},{store});
 assert.deepEqual([svg.item.ext,svg.item.width,svg.item.height],['svg',120,80]);
 await assert.rejects(ingest(Buffer.from('<svg><script>1</script></svg>'),{title:'mal'},{store}),/activo/);
 await assert.rejects(ingest(Buffer.from('basura sin formato conocido'),{title:'x'},{store}),/no reconocido/);
 await assert.rejects(ingest(await png(dir),{title:'x'},{store,expect:['audio']}),/no es del tipo esperado/);
 const dup=await ingest(await png(dir,{alpha:true,size:'80x60'}),{title:'Star otra vez',licenseId:'CC0-1.0'},{store});assert.equal(dup.duplicate,true);
 const texture=await ingest(await png(dir,{size:'128x128'}),{title:'Wood floor',kind:'texture',tags:['wood'],licenseId:'CC0-1.0'},{store});assert.equal(texture.item.kind,'texture');
}));

test('manual import requires a real licence and a public source; URL import is capped to public https',async()=>tmp(async dir=>{
 const store=new LibraryStore(path.join(dir,'lib')),bytes=await png(dir);
 await assert.rejects(importFile(bytes,{name:'a.png'},{store}),/licencia/);
 await assert.rejects(importFile(bytes,{name:'a.png',licenseId:'inventada'},{store}),/licencia/);
 await assert.rejects(importFile(bytes,{name:'a.png',licenseId:'CC0-1.0',source:'http://insegura.test/x'},{store}),/https pública/);
 const ok=await importFile(bytes,{name:'mi_foto-final.png',licenseId:'Personal',author:'Yo',tags:['casa']},{store});
 assert.equal(ok.item.title,'mi foto final');assert.equal(ok.item.personal,true);assert.equal(ok.item.license.id,'Personal');
 const fetched=[];const fetcher=async(url,options)=>{fetched.push([url,options.maxBytes]);return {buffer:await png(dir,{color:'blue'}),type:'image/png',url};};
 const viaUrl=await importFromUrl({url:'https://8.8.8.8/generacion.png',licenseId:'Personal',author:'Higgsfield',connector:'manual'},{store,fetcher});
 assert.equal(viaUrl.item.title,'generacion');assert.equal(fetched[0][0],'https://8.8.8.8/generacion.png');assert(fetched[0][1]>=100*1024*1024);
 await assert.rejects(importFromUrl({url:'http://8.8.8.8/x.png',licenseId:'Personal'},{store,fetcher}),/https/);
 await assert.rejects(importFromUrl({url:'https://127.0.0.1/x.png',licenseId:'Personal'},{store,fetcher}),/privada/);
 await assert.rejects(importFromUrl({url:'https://8.8.8.8/x.png'},{store,fetcher}),/licencia/);
}));

const fakeJson=table=>async url=>{for(const [needle,value] of table)if(decodeURIComponent(url).includes(needle))return typeof value==='function'?value(url):value;throw new Error('URL inesperada: '+url);};

test('connectors turn real-shaped API responses into licensed, attributable results',async()=>{
 const ov=await openverse.search({query:'lluvia',english:'rain',kind:'audio'},{getJson:fakeJson([['/audio/',{result_count:1,results:[{id:'a1',title:'Rain loop',url:'https://cdn.example.org/rain.mp3',creator:'Kino',license:'cc0',license_version:'1.0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',foreign_landing_url:'https://freesound.org/s/1',filetype:'mp3',duration:12500,tags:[{name:'rain'}]}]}]])});
 assert.equal(ov.items[0].license.id,'CC0-1.0');assert.equal(ov.items[0].duration,12.5);assert.equal(ov.items[0].audioUrl,'https://cdn.example.org/rain.mp3');
 const cm=await commons.search({query:'rain',english:'rain',kind:'image'},{getJson:fakeJson([['filetype:bitmap',{query:{pages:{1:{pageid:1,index:1,title:'File:Rain_on_leaf.jpg',imageinfo:[{url:'https://upload.wikimedia.org/a.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Rain_on_leaf.jpg',thumburl:'https://upload.wikimedia.org/t.jpg',mime:'image/jpeg',size:1000,width:800,height:600,extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0'},Artist:{value:'<a href="x">Ana &amp; Co</a>'},ImageDescription:{value:'<p>Rain on a leaf</p>'}}}]},2:{pageid:2,index:2,title:'File:Logo.png',imageinfo:[{url:'u',mime:'image/png',extmetadata:{LicenseShortName:{value:'Copyrighted free use'}}}]}}}}],['filetype:drawing',{query:{pages:{}}}]])});
 assert.equal(cm.items.length,1,'unrecognised licences are not offered');assert.equal(cm.items[0].license.id,'CC-BY-SA');assert.equal(cm.items[0].author,'Ana & Co');assert.equal(cm.items[0].title,'Rain on leaf');
 const ac=await ambientcg.search({query:'madera',english:'wood'},{getJson:fakeJson([['ambientcg.com/api',{numberOfResults:1,foundAssets:[{assetId:'Wood096',displayName:'Wood 096',shortLink:'https://ambientcg.com/a/Wood096',tags:['wood'],category:'Wood',previewImage:{'256-PNG':'https://acg-media.example/w.png'},downloadFolders:{default:{downloadFiletypeCategories:{zip:{downloads:[{attribute:'2K-JPG',downloadLink:'https://ambientcg.com/get?file=2K.zip',size:9},{attribute:'1K-JPG',downloadLink:'https://ambientcg.com/get?file=1K.zip',size:5}]}}}}}]}]])});
 assert.equal(ac.items[0].kind,'texture');assert.equal(ac.items[0]._download.url,'https://ambientcg.com/get?file=1K.zip');assert.equal(ac.items[0].license.attribution,false);
 assert.equal(ac.items[0]._download.extract([{name:'Wood096_1K-JPG_NormalGL.jpg'},{name:'Wood096_1K-JPG_Color.jpg'}]).name,'Wood096_1K-JPG_Color.jpg');
 const ph=await polyhaven.search({query:'madera',english:'wood',kind:'texture'},{getJson:fakeJson([['type=textures',{wood_floor:{name:'Wood Floor',tags:['wood'],categories:['floor'],authors:{'Rob Tuytel':'All'}},rock_wall:{name:'Rock Wall',tags:['rock'],categories:['wall']}}]])});
 assert.deepEqual(ph.items.map(i=>i.title),['Wood Floor']);assert.equal(ph.items[0].previewUrl,'https://cdn.polyhaven.com/asset_img/thumbs/wood_floor.png?width=256&height=256');
 const plan=await polyhaven.resolveDownload(ph.items[0],{getJson:fakeJson([['/files/wood_floor',{Diffuse:{'2k':{jpg:{url:'https://dl.polyhaven.org/wood_2k.jpg'}}}}]])});assert.equal(plan.url,'https://dl.polyhaven.org/wood_2k.jpg');
 const px=await pexels.search({query:'perro',english:'dog',kind:'all',keys:{pexels:'k'.repeat(10)}},{getJson:fakeJson([['/v1/search',{photos:[{id:1,alt:'A dog on grass',photographer:'Eva',photographer_url:'https://pexels.com/@eva',url:'https://pexels.com/photo/1',width:4000,height:3000,src:{medium:'https://images.pexels.com/m.jpg',large2x:'https://images.pexels.com/l.jpg'}}]}],['/videos/search',{videos:[{id:2,url:'https://www.pexels.com/video/dog-run-2/',image:'https://images.pexels.com/v.jpg',duration:9,user:{name:'Leo',url:'https://pexels.com/@leo'},video_files:[{file_type:'video/mp4',width:1920,height:1080,link:'https://videos.pexels.com/hd.mp4'},{file_type:'video/mp4',width:3840,height:2160,link:'https://videos.pexels.com/4k.mp4'}]}]}]])});
 assert.deepEqual(px.items.map(i=>i.kind),['image','video']);assert.equal(px.items[1]._download.url,'https://videos.pexels.com/hd.mp4','4K is skipped: 1080p is the editor target');assert.equal(px.items[0].license.id,'Pexels');
 await assert.rejects(pexels.search({query:'x',keys:{}},{getJson:fakeJson([])}),/clave/);
 const pb=await pixabay.search({query:'gato',kind:'all',keys:{pixabay:'k'.repeat(10)}},{getJson:fakeJson([['/api/videos/',{hits:[{id:5,tags:'cat, pet',pageURL:'https://pixabay.com/videos/5',user:'Zed',user_id:9,picture_id:'abc',duration:7,videos:{large:{url:'https://cdn.pixabay.com/v.mp4',width:1920,height:1080}}}]}],['/api/?',{hits:[{id:4,tags:'cat, kitten',pageURL:'https://pixabay.com/photos/4',user:'Zed',user_id:9,webformatURL:'https://pixabay.com/w.jpg',largeImageURL:'https://pixabay.com/l.jpg',imageWidth:2000,imageHeight:1000,type:'photo'}]}]])});
 assert.deepEqual(pb.items.map(i=>i.title),['cat','cat']);assert(pb.items.every(i=>i.license.id==='Pixabay'&&!i.license.attribution));
 const fs1=await freesound.search({query:'whoosh',keys:{freesound:'k'.repeat(10)}},{getJson:fakeJson([['freesound.org/apiv2',{count:2,results:[{id:7,name:'Whoosh',tags:['whoosh'],username:'kino',license:'https://creativecommons.org/publicdomain/zero/1.0/',previews:{'preview-hq-mp3':'https://cdn.freesound.org/7.mp3'},duration:1.5,url:'https://freesound.org/s/7/'},{id:8,name:'Pad',tags:['pad'],username:'z',license:'http://creativecommons.org/licenses/by-nc/3.0/',previews:{},duration:9,url:'https://freesound.org/s/8/'}]}]])});
 assert.equal(fs1.items[0].license.id,'CC0-1.0');assert.equal(fs1.items[1].license.id,'CC-BY-NC');assert.equal(fs1.items[1].canDownload,false);assert.equal(fs1.items[1].license.commercial,false);
 const gp=await giphy.search({query:'gato',kind:'video',keys:{giphy:'k'.repeat(10)}},{getJson:fakeJson([['api.giphy.com',{data:[{id:'g1',title:'Funny cat',url:'https://giphy.com/gifs/g1',username:'bob',images:{fixed_width_small:{url:'https://media.giphy.com/s.gif'},original:{url:'https://media.giphy.com/o.gif',width:'480',height:'270'},original_mp4:{mp4:'https://media.giphy.com/o.mp4'}}}],pagination:{total_count:1}}]])});
 assert.equal(gp.items[0].kind,'video');assert.equal(gp.items[0]._download.url,'https://media.giphy.com/o.mp4');assert.equal(gp.items[0].license.commercial,false);assert(giphy.requiresAck&&giphy.credit);
 const gf=await googlefonts.search({query:'lobster',keys:{googlefonts:'k'.repeat(10)}},{getJson:fakeJson([['webfonts',{items:[{family:'Lobster',category:'display',subsets:['latin'],files:{regular:'http://fonts.gstatic.com/s/lobster.ttf'}},{family:'Roboto',category:'sans-serif',files:{regular:'http://fonts.gstatic.com/s/roboto.ttf'}}]}]])});
 assert.deepEqual(gf.items.map(i=>i.title),['Lobster']);assert.equal(gf.items[0]._download.url,'https://fonts.gstatic.com/s/lobster.ttf');assert.equal(gf.items[0].license.id,'OFL-1.1');
});

test('every connector declares formats, licence, attribution, restrictions and limits; manual ones never automate',()=>{
 const ids=CONNECTORS.map(c=>c.id);
 for(const expected of ['kenney','iconstash','openverse','commons','pixabay','pexels','freesound','giphy','ambientcg','polyhaven','mixkit','svgrepo','memevault','memescreens','usesounds','opengameart','googlefonts','lottiefiles'])assert(ids.includes(expected),expected);
 assert.equal(new Set(ids).size,ids.length);
 for(const connector of describeConnectors({configured:{}})){
  assert(connector.formats.length&&connector.kinds.length,connector.id);assert(connector.license.summary,connector.id);assert(['none','recommended','required','per-item'].includes(connector.attribution),connector.id);
  assert(Array.isArray(connector.restrictions)&&connector.restrictions.length,connector.id);assert(connector.limits&&typeof connector.limits==='object',connector.id);
  assert.equal(JSON.stringify(connector).includes('function'),false,'public metadata carries no code');
  if(connector.mode==='manual'){assert(connector.manual.importHint,connector.id);assert.equal(connector.auth.type,'none');}
 }
 assert.equal(connectorById('polyhaven').credit,'Powered by Poly Haven');assert.equal(describeConnectors({configured:{pexels:true}}).find(c=>c.id==='pexels').configured,true);
 assert.equal(describeConnectors({configured:{}}).find(c=>c.id==='pixabay').configured,false);
});

const fakeConnector=(id,items,{kinds=['image'],key=null,delay=0,fail=null}={})=>({id,name:id.toUpperCase(),mode:'api',kinds,auth:key?{type:'key',keyName:key}:{type:'none'},calls:0,async search(){this.calls++;if(delay)await new Promise(r=>setTimeout(r,delay));if(fail)throw new Error(fail);return {items,total:items.length};}});
const item=(connector,n,over={})=>({key:`${connector}:${n}`,connector,sourceId:String(n),kind:'image',title:`Foto ${n}`,sourceUrl:`https://example.org/${connector}/${n}`,license:licenseRecord(over.licenseId||'CC0-1.0'),tags:[],canDownload:true,_download:{url:'https://8.8.8.8/x.png'},...over});

test('unified search merges local and remote, interleaves sources, isolates failures and caches',async()=>tmp(async dir=>{
 resetSearchCache();
 const store=new LibraryStore(path.join(dir,'lib'));
 await store.add({buffer:Buffer.from('propio'),ext:'png',kind:'image',title:'Lluvia mía',category:'Foto',tags:['lluvia'],license:licenseRecord('Personal'),source:{connector:'manual',sourceKey:''}});
 await store.add({buffer:Buffer.from('ya-bajado'),ext:'png',kind:'image',title:'Ya',category:'Foto',tags:[],license:licenseRecord('CC0-1.0'),source:{connector:'a',sourceKey:'a:2'}});
 const a=fakeConnector('a',[item('a',1,{licenseId:'CC-BY'}),item('a',2),item('a',3)]),b=fakeConnector('b',[item('b',1),item('b',2,{sourceUrl:'https://example.org/a/1'}),item('b',3,{licenseId:'CC-BY-NC'})]);
 const broken=fakeConnector('broken',[],{fail:'HTTP 500'}),keyless=fakeConnector('keyless',[],{key:'pexels'}),audioOnly=fakeConnector('audio',[],{kinds:['audio']}),slow=fakeConnector('slow',[item('slow',1)],{delay:60});
 const connectors=[a,b,broken,keyless,audioOnly,slow];
 const result=await unifiedSearch({q:'lluvia',kind:'image'},{store,connectors,keys:{pexels:''}});
 assert.equal(result.query.english,'rain');assert.equal(result.query.translated,true);
 assert.deepEqual(result.local.items.map(i=>i.title),['Lluvia mía'],'local results are matched in Spanish');assert.match(result.local.items[0].url,/^\/api\/library\/file\/lib_/);assert.equal('file' in result.local.items[0],false,'no filesystem paths leak');
 assert.deepEqual(result.remote.errors.map(e=>e.connector),['broken']);assert.deepEqual(result.remote.skipped.map(s=>[s.connector,s.reason]),[['keyless','falta la clave de API'],['audio','no ofrece image']]);
 const keys=result.remote.items.map(i=>i.key);
 assert.equal(keys.includes('b:2')&&!keys.includes('a:1'),true,'the same source URL appears once, keeping the more freely reusable copy');
 assert.deepEqual(keys.slice(0,3),['a:2','b:1','slow:1'],'round-robin across sources, freely reusable licences first');
 assert.equal(result.remote.items.find(i=>i.key==='a:2').owned,store.ownedBySource('a:2'),'already downloaded results say so');assert.equal(result.remote.items.every(i=>!('_download' in i)),true);
 const commercial=await unifiedSearch({q:'lluvia',kind:'image',scope:'remote',commercialOnly:true},{store,connectors,keys:{}});
 assert.equal(commercial.remote.items.some(i=>i.key==='b:3'),false,'NC results are hidden when only commercial use is wanted');assert.equal(commercial.local.items.length,0);
 assert.equal(a.calls,1,'second identical search comes from the cache (commercial filter is applied afterwards)');
 const localOnly=await unifiedSearch({q:'lluvia',scope:'local'},{store,connectors,keys:{}});assert.equal(localOnly.remote.items.length,0);assert.equal(a.calls,1);
 const empty=await unifiedSearch({q:'  '},{store,connectors,keys:{}});assert.equal(empty.remote.items.length,0);
}));

test('downloads only fetch results the backend returned, honour acknowledgements, extract zips and dedupe',async()=>tmp(async dir=>{
 resetSearchCache();
 const store=new LibraryStore(path.join(dir,'lib')),image=await png(dir,{size:'32x32'});
 const swatch=await png(dir,{size:'32x32',color:'blue'});
 const fetcher=async(url,options)=>({buffer:url.endsWith('.zip')?makeZip([['W_Normal.jpg',Buffer.from('n')],['W_Color.png',swatch]]):image,type:'image/png',url,options});
 const plain=item('openverse',1,{title:'Wood',author:'Ana',licenseId:'CC-BY'});rememberResult(plain);
 const done=await downloadResult('openverse:1',{query:'madera'},{store,fetcher});
 assert.equal(done.duplicate,false);assert.equal(done.item.sources[0].query,'madera');assert.match(done.item.attribution,/Ana.*CC BY.*Openverse/);assert.equal(done.item.sources[0].downloadUrl,'https://8.8.8.8/x.png');
 assert.equal((await downloadResult('openverse:1',{},{store,fetcher})).duplicate,true,'owned results are not downloaded twice');
 await assert.rejects(downloadResult('nada:0',{},{store,fetcher}),e=>e.status===410&&/caducado/.test(e.message));
 const gif=item('giphy',1,{title:'Cat',kind:'image',licenseId:'GIPHY'});rememberResult(gif);
 await assert.rejects(downloadResult('giphy:1',{},{store,fetcher}),e=>e.status===428&&/derechos de terceros/.test(e.message));
 await assert.doesNotReject(downloadResult('giphy:1',{ack:true},{store,fetcher}));
 const zipped=item('ambientcg',1,{kind:'texture',title:'Wood',_download:{url:'https://8.8.8.8/w.zip',extract:entries=>entries.find(e=>/_Color\./.test(e.name))}});rememberResult(zipped);
 const texture=await downloadResult('ambientcg:1',{},{store,fetcher});assert.equal(texture.item.kind,'texture');assert.deepEqual([texture.item.width,texture.item.height],[32,32]);
 const noFile=item('pexels',9,{canDownload:false,_download:undefined});rememberResult(noFile);await assert.rejects(downloadResult('pexels:9',{},{store,fetcher}),/no se puede descargar/);
 const wrong=item('openverse',2,{kind:'audio'});rememberResult(wrong);await assert.rejects(downloadResult('openverse:2',{},{store,fetcher}),/no es del tipo esperado/);
 const lazy=item('polyhaven',1,{kind:'texture',_download:{resolve:'polyhaven',assetId:'x',type:'textures'}});rememberResult(lazy);
 const connectors=id=>id==='polyhaven'?{...polyhaven,resolveDownload:async()=>({url:'https://8.8.8.8/resolved.jpg'})}:connectorById(id);
 const resolved=await downloadResult('polyhaven:1',{},{store,fetcher,connectors});assert.equal(resolved.duplicate,true,'same bytes as an earlier download');assert(resolved.item.sources.some(x=>x.downloadUrl==='https://8.8.8.8/resolved.jpg'&&x.sourceKey==='polyhaven:1'),'the resolved URL is recorded as another place it was found');
}));

test('bundled files are indexed by reference without copying and without re-hashing next time',async()=>tmp(async dir=>{
 const store=new LibraryStore(path.join(dir,'lib')),file=path.join(ROOT,'resources/kenney-interface-sounds/addons/kenney_interface_sounds/back_001.wav');
 try{await fs.access(file);}catch{return;}
 const assets=[{id:'abc',name:'back_001.wav',kind:'sound',pack:'kenney-interface-sounds',license:'CC0-1.0',author:'Kenney',source:'https://kenney.nl',file,duration:.07}];
 assert.deepEqual(await syncBundled({store,assets}),{added:1,total:1});
 const [bundled]=[...store.items.values()];
 assert.equal(bundled.external,true);assert.equal(bundled.sources[0].connector,'kenney');assert.equal(bundled.license.id,'CC0-1.0');assert.equal(bundled.generated,false);assert.match(bundled.file,/^resources\//);
 assert.equal(store.absolute(bundled),file);await assert.rejects(store.remove(bundled.id),/incluidos/);
 assert.deepEqual(await syncBundled({store,assets}),{added:0,total:1});assert.equal(store.stats().bytes,0,'referenced files do not count as library storage');
}));

test('thumbnail proxy only returns small real raster images',async()=>tmp(async dir=>{
 const image=await png(dir),ok=await fetchThumb('https://8.8.8.8/a.png',{fetcher:async()=>({buffer:image,type:'image/png'})});assert.equal(ok.type,'image/png');
 await assert.rejects(fetchThumb('https://8.8.8.8/b.png',{fetcher:async()=>({buffer:Buffer.from('<svg xmlns="x" viewBox="0 0 1 1"/>'),type:'image/png'})}),/no es una imagen válida/);
 await assert.rejects(fetchThumb('https://8.8.8.8/c.png',{fetcher:async()=>({buffer:Buffer.from('nope nope nope nope'),type:'image/png'})}),/no es una imagen válida/);
}));

test('API keys are validated, stored outside the repo config and never exposed',async()=>tmp(async dir=>{
 const file=path.join(dir,'keys.json'),empty={};
 assert.deepEqual(await configuredKeys({file,env:empty}),{pexels:false,pixabay:false,freesound:false,giphy:false,googlefonts:false});
 assert.deepEqual(await setKey('pixabay','1234-abcdef-5678',{file}),{configured:true});
 await assert.rejects(setKey('pixabay','con espacios dentro',{file}),/no es válida/);await assert.rejects(setKey('openverse','12345678',{file}),/no usa clave/);
 assert.equal((await getKeys({file,env:empty})).pixabay,'1234-abcdef-5678');
 assert.equal((await getKeys({file,env:{PIXABAY_API_KEY:' "desde-entorno-1" '}})).pixabay,'desde-entorno-1','the environment wins and quotes are stripped');
 assert.equal((await configuredKeys({file,env:empty})).pixabay,true);
 assert.deepEqual(await setKey('pixabay','',{file}),{configured:false});assert.equal((await getKeys({file,env:empty})).pixabay,'');
}));
