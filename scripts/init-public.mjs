import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT,resolveAssetFile,storedAssetFile,ensureDirectories} from '../server/core.mjs';
await ensureDirectories();
async function create(file,data){try{await fs.writeFile(path.join(ROOT,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}}
await create('config/studio.json',{language:'es',model:'tiny',transcriptionDevice:'cpu',computeType:'int8',silenceDb:-35,silenceMin:.65,speechPadding:.18,maxUploadGB:10,dictionary:[],corrections:{},promptEngine:'auto',fillers:[]});
const registry=path.join(ROOT,'config/assets.json');
let entries=[];try{entries=JSON.parse(await fs.readFile(registry,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const packs=[['kenney-interface-sounds/addons/kenney_interface_sounds','sound','Kenney','https://kenney.nl/assets/interface-sounds'],['kenney-music-jingles/Audio','music','Kenney','https://kenney.nl/assets/music-jingles'],['music-shadow','music','James Gargette / cinameng','https://opengameart.org/content/shadow-2']];
let unavailable=0,added=0,migrated=0;
// Older registries stored absolute paths; keep them working after the folder is moved.
entries=entries.map(e=>{const file=storedAssetFile(resolveAssetFile(e.file));if(file!==e.file)migrated++;return {...e,file};});
async function audioFiles(dir,prefix=''){const files=[];for(const item of await fs.readdir(path.join(dir,prefix),{withFileTypes:true})){const relative=path.join(prefix,item.name);if(item.isDirectory())files.push(...await audioFiles(dir,relative));else if(item.isFile()&&/\.(wav|ogg|mp3)$/i.test(item.name))files.push(relative);}return files;}
for(const [folder,kind,author,source] of packs){const dir=path.join(ROOT,'resources',folder);for(const name of await audioFiles(dir)){
 const file=path.join(dir,name),h=createHash('sha256').update(folder+'/'+name).digest('hex');
 const id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
 if(entries.some(e=>e.id===id))continue;
 let duration;try{duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim());}catch{unavailable++;continue;}
 if(!(duration>0))continue;
 entries.push({id,name,kind,pack:folder.split('/')[0],license:'CC0-1.0',author,source,file:storedAssetFile(file),duration,automatic:false});added++;
}}
await fs.writeFile(registry,JSON.stringify(entries,null,2)+'\n');
console.log(`Local folders ready. Registered ${added} bundled sounds${migrated?`, made ${migrated} paths portable`:""}. ${unavailable ? 'Install FFmpeg/ffprobe and rerun npm run setup to register audio.' : 'Existing projects and settings preserved.'}`);
