import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,python,run} from '../server/core.mjs';
// Larger downloads require explicit user authorization; medium was authorized in this session.
const model=process.argv[2]||'tiny';if(!['tiny','medium'].includes(model))throw new Error('Modelo no configurado');
console.log(`Descargando faster-whisper-${model} para uso local.`);
const dir=path.join(ROOT,'models',model);await fs.mkdir(dir,{recursive:true});
await run(python,['-c',`import os; os.environ['HF_HUB_DISABLE_XET']='1'; os.environ['HF_HOME']=${JSON.stringify(path.join(ROOT,'cache/huggingface'))}; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-${model}', local_dir=${JSON.stringify(dir)}, allow_patterns=['model.bin','config.json','tokenizer.json','vocabulary.*','preprocessor_config.json'])`],{log:x=>process.stderr.write(x)});
console.log('Modelo '+model+' disponible en '+dir);
if(model==='medium'){const file=path.join(ROOT,'config/studio.json'),cfg=JSON.parse(await fs.readFile(file,'utf8'));cfg.model='medium';await fs.writeFile(file,JSON.stringify(cfg,null,2));console.log('Medium configurado como modelo predeterminado.');}
