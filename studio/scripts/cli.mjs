import path from 'node:path';
import {importVideo,load} from '../server/core.mjs';
import {doctor,analyze} from '../server/engine.mjs';
import {render} from '../server/render-pipeline.mjs';
import {decorate} from '../server/decorate.mjs';
const [command,target,...options]=process.argv.slice(2),report=s=>process.stdout.write(String(s)+'\n');
try{if(command==='doctor')console.log(JSON.stringify(await doctor(),null,2));
else if(command==='analyze'){if(!target)throw new Error('Uso: npm run analyze -- "C:\\ruta\\video.mp4" o ID de proyecto');const p=/^[a-f0-9-]{36}$/.test(target)?await load(target):await importVideo(path.resolve(target),path.basename(target));console.log('Proyecto: '+p.id);await analyze(p.id,report);}
else if(command==='edit'){if(!target)throw new Error('Uso: npm run edit -- ID. Edita y aprueba desde http://127.0.0.1:5173');const p=await load(target);console.log(JSON.stringify({id:p.id,clips:p.clips,settings:p.settings,reviewed:p.reviewed},null,2));console.log('Revisión disponible en la interfaz. No se aprueban recortes automáticamente.');}
else if(command==='render'){if(!target)throw new Error('Uso: npm run render -- ID [--preview]');const preview=options.includes('--preview');await render(target,preview,report);await decorate(target,preview,report);}
else throw new Error('Comando desconocido');}catch(e){console.error(e.message);process.exitCode=1;}
