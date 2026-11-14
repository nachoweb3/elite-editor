// Pause tightening, transcript correction, statistics and a publishing draft (chapters,
// titles, description, hashtags). All pure functions over a project; times are seconds of
// the ORIGINAL recording unless a field says "at" (montage time).
import {timedWords,keptSeconds,activeFillers} from './transcript-tools.mjs';

const round=n=>Math.round(n*1000)/1000;
const ownClips=p=>p.clips.filter(c=>c.enabled&&(!c.sourceId||c.sourceId===p.id));

/* ------------------------------ Pause tightening ------------------------------ */
// Long silences between words are shortened, not removed: `keep` seconds of air remain
// so speech still breathes. Only gaps whose two words are both in the edit are touched.
export function findLongPauses(p,{maxPause=.6,keep=.25}={}){
 maxPause=Math.min(5,Math.max(.2,Number(maxPause)||.6));
 keep=Math.min(maxPause,Math.max(.05,Number(keep)||.25));
 const words=timedWords(p.transcript),items=[];
 for(let i=1;i<words.length;i++){
  const a=words[i-1],b=words[i],gap=b.start-a.end;
  if(gap<=maxPause)continue;
  const start=round(a.end+keep/2),end=round(b.start-keep/2);
  if(end-start<.05)continue;
  if(keptSeconds(p,a.start,a.end)<.02||keptSeconds(p,b.start,b.end)<.02||keptSeconds(p,start,end)<.03)continue;
  items.push({start,end,gap:round(gap),before:a.word,after:b.word});
 }
 return items;
}

/* ------------------------------- Text correction ------------------------------ */
const tokensOf=text=>String(text).trim().split(/\s+/).filter(Boolean);
// Corrected text keeps the real word timings when the word count is unchanged; otherwise the
// segment is re-timed evenly and marked estimated, so those timings are never used to cut.
export function retimeSegment(segment,text){
 const clean=String(text??'').replace(/\s+/g,' ').trim();
 if(!clean||clean.length>5000)throw Error('Escribe un texto de entre 1 y 5000 caracteres');
 const tokens=tokensOf(clean),original=Array.isArray(segment.words)?segment.words:[];
 const timed=original.length===tokens.length&&original.every(w=>!w.estimated&&Number.isFinite(w.start)&&Number.isFinite(w.end));
 if(timed)return {...segment,text:clean,words:original.map((w,i)=>({...w,word:' '+tokens[i]}))};
 const step=(segment.end-segment.start)/Math.max(1,tokens.length);
 return {...segment,text:clean,words:tokens.map((word,k)=>({word:' '+word,start:segment.start+k*step,end:segment.start+(k+1)*step,estimated:true}))};
}
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function replaceInTranscript(transcript,find,replacement,{wholeWord=true,caseSensitive=false}={}){
 if(typeof find!=='string'||!find.trim()||find.length>200)throw Error('Indica el texto a buscar (máximo 200 caracteres)');
 if(typeof replacement!=='string'||replacement.length>200)throw Error('El reemplazo admite hasta 200 caracteres');
 const source=escapeRe(find.trim());
 const re=new RegExp(wholeWord?`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`:source,caseSensitive?'gu':'giu');
 let count=0;
 const next=(Array.isArray(transcript)?transcript:[]).map(segment=>{
  const text=String(segment.text||''),matches=text.match(re);if(!matches)return segment;
  count+=matches.length;
  const replaced=text.replace(re,replacement).replace(/\s+/g,' ').trim();
  return replaced?retimeSegment(segment,replaced):{...segment,text:'',words:[]};
 });
 return {transcript:next,count};
}

/* ----------------------------------- Stats ------------------------------------ */
export function transcriptStats(p){
 const montage=p.clips.filter(c=>c.enabled).reduce((a,c)=>a+c.end-c.start,0);
 const kept=timedWords(p.transcript).filter(w=>keptSeconds(p,w.start,w.end)>(w.end-w.start)/2);
 const speech=kept.reduce((a,w)=>a+w.end-w.start,0);
 let longest=0;for(let i=1;i<kept.length;i++)longest=Math.max(longest,kept[i].start-kept[i-1].end);
 const original=Number(p.media?.duration)||0,ownKept=ownClips(p).reduce((a,c)=>a+c.end-c.start,0),removed=Math.max(0,original-ownKept);
 return {original:round(original),montage:round(montage),removed:round(removed),removedPercent:original?Math.round(removed/original*100):0,
  words:kept.length,wordsPerMinute:montage>0?Math.round(kept.length/(montage/60)):0,speechPercent:montage?Math.min(100,Math.round(speech/montage*100)):0,
  longestPause:round(longest),fillers:activeFillers(p).length};
}

/* ------------------------------ Publishing draft ------------------------------ */
const STOP=new Set(('a al algo algun alguna algunos ante antes aqui asi aunque bien bueno cada casi como con contra cosa cosas cual cuando de del desde donde dos el ella ellos en entonces entre era eres es esa ese eso esta estaba estamos estan estar este esto estos estoy fue hace hacer hay hoy la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o otra otro para pero poco por porque pues que quien se sea ser si sin sobre solo son su sus tambien tan tanto te tener tengo ti tiene todo todos tu tus un una uno unos vale vamos va voy y ya yo '
 +'the and for that this with you your are was were have has had but not they them then than what when where which who will would can could just like also into about from our out its it is be to of in on at an as or by we he she his her i me my do does did so if no yes eh mmm hmm um uh ok okay').split(' '));
const plainWord=w=>String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
export function keywords(text,limit=8){
 const counts=new Map();
 for(const raw of String(text).split(/\s+/)){const w=plainWord(raw);if(w.length<4||STOP.has(w)||/^\d+$/.test(w))continue;counts.set(w,(counts.get(w)||0)+1);}
 return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([w])=>w);
}
export const chapterStamp=t=>{const s=Math.max(0,Math.floor(t)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,sec=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sec}`:`${m}:${sec}`;};
export function toOutput(time,p){let offset=0;for(const c of p.clips.filter(c=>c.enabled)){if((!c.sourceId||c.sourceId===p.id)&&time>=c.start&&time<c.end)return offset+time-c.start;offset+=c.end-c.start;}return null;}
export function headline(text){
 const cleaned=String(text||'').replace(/(^|\s)(eh+|mm+|hmm|um+|uh+|ah+)[,.]?(?=\s|$)/gi,' ').replace(/\s+/g,' ').trim();
 const first=(cleaned.split(/(?<=[.?!])\s+/)[0]||cleaned).split(/\s+/).slice(0,7).join(' ').replace(/[,;:.…¿?¡!]+$/,'').replace(/^[¿¡]/,'');
 return first?first[0].toUpperCase()+first.slice(1):'';
}
// YouTube chapters need a 0:00 start, at least three chapters and ten seconds per chapter.
export function chaptersFor(p){
 const montage=p.clips.filter(c=>c.enabled).reduce((a,c)=>a+c.end-c.start,0);
 const segments=(Array.isArray(p.transcript)?p.transcript:[]).map(s=>({...s,at:toOutput(s.start,p)})).filter(s=>s.at!==null&&String(s.text||'').trim()).sort((a,b)=>a.at-b.at);
 if(montage<30||segments.length<3)return {chapters:[],note:'Los capítulos de YouTube necesitan al menos 30 s de montaje con transcripción.'};
 const count=Math.max(3,Math.min(12,Math.round(montage/90))),spacing=Math.max(10,montage/(count*1.6));
 const sceneTimes=(p.analysis?.scenes||[]).map(s=>toOutput(s.start,p)).filter(t=>t!==null);
 // Strong boundaries: long pauses before a phrase, and visual scene changes.
 const candidates=segments.slice(1).map((s,i)=>({s,score:Math.max(0,s.start-segments[i].end)+(sceneTimes.some(t=>Math.abs(t-s.at)<1.5)?1.5:0)})).sort((a,b)=>b.score-a.score||a.s.at-b.s.at);
 const picked=[];
 for(const c of candidates){if(picked.length>=count-1)break;if(c.s.at<spacing||montage-c.s.at<10||picked.some(x=>Math.abs(x.at-c.s.at)<spacing))continue;picked.push(c.s);}
 const starts=[segments[0],...picked.sort((a,b)=>a.at-b.at)];
 if(starts.length<3)return {chapters:[],note:'No hay suficientes pausas claras para separar al menos tres capítulos de 10 s.'};
 const chapters=starts.map((s,i)=>{const at=i?s.at:0,end=starts[i+1]?.at??montage;const text=segments.filter(x=>x.at>=at&&x.at<end).map(x=>x.text).join(' ');return {at:Math.round(at),title:headline(s.text)||`Parte ${i+1}`,text:text.slice(0,600)};});
 return {chapters,note:''};
}
export function publishingDraft(p){
 const text=(Array.isArray(p.transcript)?p.transcript:[]).filter(s=>keptSeconds(p,s.start,s.end)>(s.end-s.start)/2).map(s=>String(s.text||'').trim()).filter(Boolean).join(' ');
 const {chapters,note}=chaptersFor(p),tags=keywords(text);
 const sentences=text.split(/(?<=[.?!])\s+/).filter(s=>s.split(/\s+/).length>=4);
 let description='';for(const s of sentences){if((description+' '+s).length>280)break;description=(description+' '+s).trim();}
 const titles=[headline(sentences[0]||text),tags.length>=2?`${tags[0][0].toUpperCase()+tags[0].slice(1)} y ${tags[1]}: lo esencial`:''].filter(Boolean).map(t=>t.slice(0,90));
 return {engine:'rules',titles,description:description||text.slice(0,280),hashtags:tags.slice(0,6).map(t=>'#'+t),chapters,note,empty:!text};
}
export function chapterText(chapters){return chapters.map(c=>`${chapterStamp(c.at)} ${c.title}`).join('\n');}
