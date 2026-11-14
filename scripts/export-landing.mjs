// Publish the same landing used by the local app to a static Pages checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const destination=process.argv[2]&&path.resolve(process.argv[2]);
if(!destination)throw Error('Usage: node scripts/export-landing.mjs <landing-checkout>');
const web=path.join(root,'vendor/opencut-classic/apps/web');
const output=path.join(root,'cache/landing-export.mjs');
await fs.mkdir(path.dirname(output),{recursive:true});
await build({entryPoints:[path.join(web,'src/app/page.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'static-links',setup(b){
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'static'}));
 b.onLoad({filter:/.*/,namespace:'static'},()=>({contents:`import React from 'react';export default function Link({href,...props}){const url=href==='/projects'?'./editor/#/projects':href==='/guide'?'https://github.com/nachoweb3/elite-editor/blob/main/docs/GETTING_STARTED.es.md':href==='/'?'./':href;return React.createElement('a',{...props,href:url});}`}));
 b.onResolve({filter:/^@\//},a=>({path:path.join(web,'src',a.path.slice(2))+'.'+(a.path.includes('/components/')?'tsx':'ts')}));
}}]});
const {default:Home}=await import(pathToFileURL(output));
const revision=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
let markup=renderToStaticMarkup(await Home()).replaceAll('src="/elite-mark.svg"','src="assets/elite-mark.svg"');
const access=`<section class="lp lp-section" id="abrir-editor"><div class="lp-wrap"><p class="lp-kicker">Editor web · código actualizado ${revision}</p><h2 class="lp-h2">Entra a tu estudio</h2><p class="lp-lead">Abre el editor directamente en tu navegador. Crea un proyecto, importa tus archivos y trabaja en la timeline sin instalar un servidor.</p><div class="lp-cta"><a class="lp-btn lp-btn-primary" href="./editor/#/projects">Iniciar editor →</a><a class="lp-btn lp-btn-ghost" href="https://github.com/nachoweb3/elite-editor">Versión local completa →</a></div><p>La edición manual funciona en el navegador: medios, timeline, textos, stickers, efectos y exportación según los códecs compatibles. Tus proyectos se guardan en este navegador; usa Chrome o Edge actualizado.</p><p>La automatización con FFmpeg, el asistente del motor local y las bibliotecas mediante claves privadas requieren la versión local. El editor web identifica estas herramientas.</p><p>Created totally free by @nacho_web3 · Innovation is our flag.</p></div></section>`;
markup=markup.replace(/<footer /,access+'<footer ');
const css=(await fs.readFile(path.join(web,'src/app/xeno.css'),'utf8'))+'\n'+(await fs.readFile(path.join(web,'src/app/landing.css'),'utf8'));
await fs.mkdir(path.join(destination,'assets'),{recursive:true});
await fs.writeFile(path.join(destination,'assets/landing-current.css'),`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#03040b;color:#e6eeff;font-family:system-ui}a{text-decoration:none}button,input{font:inherit}img,video{max-width:100%}#abrir-editor{scroll-margin-top:5rem}#abrir-editor p{line-height:1.7}#abrir-editor a:focus-visible{outline:2px solid #5effc8} @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\n`+css);
await fs.writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elite Editor · Edita tu vídeo como un documento</title><meta name="description" content="Timeline, edición por texto, biblioteca de recursos y herramientas de creadores. Local, gratuito y open source por nacho_web3."><meta name="elite-editor-revision" content="${revision}"><link rel="canonical" href="https://nachoweb3.github.io/elite-editor-landing/"><link rel="icon" href="assets/elite-mark.svg"><link rel="stylesheet" href="assets/landing-current.css?v=${revision}"></head><body>${markup}</body></html>`);
console.log('Landing exported from editor source:',revision);
