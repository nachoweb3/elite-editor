// ASSET FORGE from the terminal: npm run forge [-- sounds luts visuals svg creators] [--force]
// Generates original CC0 assets into library/forge/ (ignored by git) and indexes them in the library.
import {library} from '../server/library/store.mjs';
import {runForge,PACK_IDS,PACK_INFO} from '../server/library/forge/index.mjs';

const args=process.argv.slice(2),force=args.includes('--force'),requested=args.filter(a=>!a.startsWith('--'));
const unknown=requested.filter(id=>!PACK_IDS.includes(id));
if(unknown.length){console.error(`Pack desconocido: ${unknown.join(', ')}. Disponibles: ${PACK_IDS.join(', ')}`);process.exit(1);}
await library.load();
let problems=0;
for(const id of requested.length?requested:PACK_IDS){
 console.log(`▸ ${PACK_INFO[id].title} (${id})`);
 try{
  const result=await runForge(id,{store:library,force,log:line=>console.log('   ·',line)});
  console.log(`   ${result.made} generados · ${result.ingested} nuevos en la biblioteca · ${result.duplicates} ya estaban · ${result.failed.length} fallos`);
  for(const failure of result.failed){problems++;console.log(`   ✖ ${failure.id}: ${failure.error}`);}
 }catch(e){problems++;console.log(`   omitido: ${e.message}`);}
}
console.log(problems?`Terminado con ${problems} avisos.`:'Terminado.');
process.exitCode=problems?1:0;
