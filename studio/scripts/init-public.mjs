import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT} from '../server/core.mjs';
for(const dir of ['config','data','cache','logs','projects','models','runtime','input/raw_videos','input/audio','input/memes','input/sonidos','output/previews','output/reels','output/shorts','output/youtube','thumbnails','subtitles'])await fs.mkdir(path.join(ROOT,dir),{recursive:true});
async function create(file,data){try{await fs.writeFile(path.join(ROOT,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}}
await create('config/studio.json',{language:'es',model:'tiny',transcriptionDevice:'cpu',computeType:'int8',silenceDb:-35,silenceMin:.65,speechPadding:.18,maxUploadGB:10,dictionary:[],corrections:{}});
const registry=path.join(ROOT,'config/assets.json');
let entries=[];try{entries=JSON.parse(await fs.readFile(registry,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const packs=[['kenney-interface-sounds/addons/kenney_interface_sounds','sound','Kenney','https://kenney.nl/assets/interface-sounds'],['kenney-music-jingles/Audio','music','Kenney','https://kenney.nl/assets/music-jingles'],['music-shadow','music','James Gargette / cinameng','https://opengameart.org/content/shadow-2']];
let unavailable=0,added=0;
for(const [folder,kind,author,source] of packs){const dir=path.join(ROOT,'resources',folder);for(const name of (await fs.readdir(dir)).filter(n=>/\.(wav|ogg|mp3)$/i.test(n))){
 const file=path.join(dir,name),h=createHash('sha256').update(folder+'/'+name).digest('hex');
 const id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
 if(entries.some(e=>e.id===id))continue;
 let duration;try{duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim());}catch{unavailable++;continue;}
 if(!(duration>0))continue;
 entries.push({id,name,kind,pack:folder.split('/')[0],license:'CC0-1.0',author,source,file,duration,automatic:false});added++;
}}
await fs.writeFile(registry,JSON.stringify(entries,null,2)+'\n');
console.log(`Carpetas locales preparadas. Audios registrados: ${added}. ${unavailable ? 'Instala FFmpeg y ffprobe y vuelve a ejecutar npm run setup para registrar los audios pendientes.' : 'Se conservan los ajustes y los proyectos existentes.'}`);
