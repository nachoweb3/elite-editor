import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'vendor/opencut-classic/apps/web');
const shell=path.join(web,'static-editor');
const outDir=path.resolve(process.argv[2]||path.join(root,'dist/browser-editor'));
// wasm-bindgen's bundler target imports a .wasm ES module. Vite needs that module
// instantiated explicitly; keep its generated JS imports and export names intact.
const wasmPlugin=()=>({name:'elite-wasm',async load(id){if(!id.endsWith('.wasm'))return;const mod=await WebAssembly.compile(await fs.readFile(id));const imports=[...new Set(WebAssembly.Module.imports(mod).map(i=>i.module))];return imports.map((m,i)=>`import * as m${i} from ${JSON.stringify(m)};`).join('\n')+`\nimport url from ${JSON.stringify(id+'?url')};\nconst response=await fetch(url);if(!response.ok)throw Error('No se pudo cargar el motor WASM');const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{${imports.map((m,i)=>JSON.stringify(m)+':m'+i).join(',')}});\n`+WebAssembly.Module.exports(mod).map(e=>`export const ${e.name}=instance.exports[${JSON.stringify(e.name)}];`).join('\n');}});
const localPanels=['nacho-assistant','nacho-generate','nacho-resources','library-panel'];
await build({configFile:false,root:shell,base:'./',publicDir:path.join(web,'public'),resolve:{alias:[
 ...['link','image','navigation'].map(name=>({find:'next/'+name,replacement:path.join(shell,name+'.tsx')})),
 ...localPanels.map(name=>({find:'./views/'+name,replacement:path.join(shell,'local-tools.tsx')})),
 {find:'content-collections',replacement:path.join(web,'.content-collections/generated/index.js')},
 {find:'@',replacement:path.join(web,'src')},
 ],dedupe:['react','react-dom']},esbuild:{jsx:'automatic'},css:{postcss:web},plugins:[wasmPlugin(),{name:'browser-public-paths',transform(code,id){
 if(id.endsWith('/fonts/google-fonts.ts'))return code.replaceAll('"/fonts/','"./fonts/');
 if(id.endsWith('/views/elite-audio.tsx'))return code.replace('"/nacho-api/gallery"','"./sounds/index.json"');
 if(id.endsWith('/editor/onboarding.tsx'))return code.replace('Asistente IA: detecta silencios, transcribe y propone cortes revisables.','El asistente automático requiere la versión local con FFmpeg.').replace('Edición por texto: quita frases, muletillas («eh», «mmm») y repeticiones.','En la web puedes montar medios, textos y efectos en la timeline.').replace('Escribe instrucciones como «quita los primeros 5 segundos»: siempre ves el cambio antes de aplicarlo.','Tus proyectos se guardan en este navegador. Exporta tu vídeo para conservar el resultado.');
 }}],worker:{format:'es',plugins:()=>[wasmPlugin()]},define:{'process.env.NEXT_PUBLIC_SITE_URL':JSON.stringify('https://nachoweb3.github.io/elite-editor-landing/editor/'),'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir,emptyOutDir:false,target:'esnext',chunkSizeWarningLimit:3000}});
// Only ship checked-in CC0 packs, never the user's library or imported media.
const {execFileSync}=await import('node:child_process');
const {createHash}=await import('node:crypto');
const sounds=[];await fs.mkdir(path.join(outDir,'sounds'),{recursive:true});
for(const [pack,kind,author] of [['kenney-interface-sounds','sound','Kenney'],['kenney-music-jingles','music','Kenney'],['music-shadow','music','James Gargette / cinameng'],['elite-sfx','sound','Elite Editor']]){
 const folder=path.join(root,'resources',pack);
 for(const name of await fs.readdir(folder,{recursive:true})){if(!/\.(ogg|wav|mp3)$/i.test(name))continue;const file=path.join(folder,name);const id=createHash('sha256').update(pack+'/'+name).digest('hex').slice(0,20),ext=path.extname(name);
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8',windowsHide:true}).trim());
 await fs.copyFile(file,path.join(outDir,'sounds',id+ext));sounds.push({id,name:path.basename(name),kind,pack,author,license:'CC0-1.0',duration,url:'./sounds/'+id+ext});}
}
await fs.writeFile(path.join(outDir,'sounds/index.json'),JSON.stringify(sounds));
console.log('Browser editor built:',outDir,'with',sounds.length,'bundled sounds');
