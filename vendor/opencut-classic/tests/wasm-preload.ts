import {plugin} from 'bun';
import {readFileSync} from 'node:fs';
// Bun 1.2 treats .wasm as an asset path. Load the real compiled core for tests.
import {pathToFileURL} from 'node:url';
plugin({name:'opencut-wasm-test-loader',setup(build){build.onLoad({filter:/opencut_wasm_bg\.wasm$/},async({path})=>{
 const bindings=await import(pathToFileURL(path.replace(/_bg\.wasm$/,'_bg.js')).href);
 const module=new WebAssembly.Module(readFileSync(path));
 const instance=new WebAssembly.Instance(module,{'./opencut_wasm_bg.js':bindings});
 return {loader:'object',exports:instance.exports};
});}});
