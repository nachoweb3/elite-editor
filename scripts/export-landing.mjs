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
 b.onLoad({filter:/.*/,namespace:'static'},()=>({contents:`import React from 'react';export default function Link({href,...props}){const url=href==='/projects'?'#abrir-editor':href==='/guide'?'https://github.com/nachoweb3/elite-editor/blob/main/docs/GETTING_STARTED.es.md':href==='/'?'./':href;return React.createElement('a',{...props,href:url});}`}));
 b.onResolve({filter:/^@\//},a=>({path:path.join(web,'src',a.path.slice(2))+'.'+(a.path.includes('/components/')?'tsx':'ts')}));
}}]});
const {default:Home}=await import(pathToFileURL(output));
const revision=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
let markup=renderToStaticMarkup(await Home()).replaceAll('src="/elite-mark.svg"','src="assets/elite-mark.svg"');
const access=`<section class="lp lp-section" id="abrir-editor"><div class="lp-wrap"><p class="lp-kicker">Editor local · código actualizado ${revision}</p><h2 class="lp-h2">Entra a tu estudio</h2><p class="lp-lead">Si Elite Editor ya está arrancado en este equipo, abre tus proyectos. Esta página es la presentación pública; el editor y el procesamiento de vídeo funcionan en tu ordenador.</p><div class="lp-cta"><a class="lp-btn lp-btn-primary" href="http://127.0.0.1:5181/projects">Abrir mi editor local →</a><a class="lp-btn lp-btn-ghost" href="https://github.com/nachoweb3/elite-editor">Instalar la versión actual →</a></div><p>Primera instalación: sigue el README del repositorio. La versión actual incluye la biblioteca Recursos y las herramientas de creadores disponibles. Los packs Forge todavía en desarrollo aparecen como pendientes.</p><p><a href="https://github.com/nachoweb3/elite-editor-landing/releases/tag/v0.2.0-beta">Paquetes beta 0.2 anteriores</a> · Estos paquetes todavía no contienen todos los cambios nuevos.</p><p>Created totally free by @nacho_web3 · Innovation is our flag.</p></div></section>`;
markup=markup.replace(/<footer /,access+'<footer ');
const css=(await fs.readFile(path.join(web,'src/app/xeno.css'),'utf8'))+'\n'+(await fs.readFile(path.join(web,'src/app/landing.css'),'utf8'));
await fs.mkdir(path.join(destination,'assets'),{recursive:true});
await fs.writeFile(path.join(destination,'assets/landing-current.css'),`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#03040b;color:#e6eeff;font-family:system-ui}a{text-decoration:none}button,input{font:inherit}img,video{max-width:100%}#abrir-editor{scroll-margin-top:5rem}#abrir-editor p{line-height:1.7}#abrir-editor a:focus-visible{outline:2px solid #5effc8} @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\n`+css);
await fs.writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elite Editor · Edita tu vídeo como un documento</title><meta name="description" content="Timeline, edición por texto, biblioteca de recursos y herramientas de creadores. Local, gratuito y open source por nacho_web3."><meta name="elite-editor-revision" content="${revision}"><link rel="canonical" href="https://nachoweb3.github.io/elite-editor-landing/"><link rel="icon" href="assets/elite-mark.svg"><link rel="stylesheet" href="assets/landing-current.css?v=${revision}"></head><body>${markup}</body></html>`);
console.log('Landing exported from editor source:',revision);
