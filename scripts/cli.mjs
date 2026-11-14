import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,importVideo,load,save} from '../server/core.mjs';
import {doctor,analyze,render,capabilities} from '../server/engine.mjs';
const [command,target,...options]=process.argv.slice(2),report=s=>process.stdout.write(String(s)+'\n');
// "npm run doctor" explains what works and how to fix the rest; "-- --json" keeps the raw report.
async function printDoctor(){
 if(options.includes('--json')||target==='--json'){console.log(JSON.stringify(await doctor(),null,2));return;}
 const c=await capabilities({fresh:true}),line=(ok,label,detail)=>console.log(`  ${ok?'✔':'✖'} ${label}${detail?' · '+detail:''}`);
 console.log('Elite Editor · estado del motor\n');
 line(true,'Node.js',process.version);
 line(c.ffmpeg,'FFmpeg y ffprobe','análisis, limpieza y render');
 line(c.transcription.ready,'Transcripción local',`Whisper ${c.transcription.modelName}${c.transcription.python?'':' · falta Python'}${c.transcription.model?'':' · falta el modelo'}`);
 line(c.ollama.running&&c.ollama.installed,'IA de instrucciones',c.ollama.running?(c.ollama.installed?c.ollama.model:'falta '+c.ollama.model):'sin Ollama · se usan reglas locales');
 line(c.faceTracking,'Retoque con seguimiento facial','MediaPipe');
 line(c.nvenc,'Codificación por GPU (NVENC)',c.nvenc?'':'opcional, se usa la CPU');
 line(c.autoEditor,'Auto-Editor','opcional, FFmpeg propone los cortes');
 console.log(c.hints.length?'\nCómo completar la instalación:\n'+c.hints.map(h=>'  → '+h).join('\n'):'\nTodo listo.');
 if(!c.ffmpeg)process.exitCode=1;
}
try{if(command==='doctor')await printDoctor();
else if(command==='analyze'){if(!target)throw new Error('Uso: npm run analyze -- "C:\\ruta\\video.mp4" o ID de proyecto');const p=/^[a-f0-9-]{36}$/.test(target)?await load(target):await importVideo(path.resolve(target),path.basename(target));console.log('Proyecto: '+p.id);await analyze(p.id,report);}
else if(command==='edit'){if(!target)throw new Error('Uso: npm run edit -- ID. Edita y aprueba desde http://127.0.0.1:5173');const p=await load(target);console.log(JSON.stringify({id:p.id,clips:p.clips,settings:p.settings,reviewed:p.reviewed},null,2));console.log('Revisión disponible en la interfaz. No se aprueban recortes automáticamente.');}
else if(command==='render'){if(!target)throw new Error('Uso: npm run render -- ID [--preview]');await render(target,options.includes('--preview'),report);}
else throw new Error('Comando desconocido');}catch(e){console.error(e.message);process.exitCode=1;}
