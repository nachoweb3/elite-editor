// Text-based editing helpers. All times are seconds of the ORIGINAL recording unless stated.
import {remapWords,cues} from './subtitles.mjs';

// Hesitations that are never content. Ambiguous words ("este", "bueno", "pues", "like")
// are left out on purpose; users can add them in config/studio.json → "fillers".
export const DEFAULT_FILLERS=['eh','ehh','eeh','ehm','em','emm','eem','mm','mmm','hmm','hm','uh','uhh','um','umm','uhm','ah','ahh','aah','erm','er','mhm'];
const token=w=>String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}' ]+/gu,'').trim();
const round=n=>Math.round(n*1000)/1000;

export function timedWords(transcript){
 return (Array.isArray(transcript)?transcript:[]).flatMap(s=>Array.isArray(s.words)?s.words:[])
  .filter(w=>!w.estimated&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start)
  .map(w=>({start:w.start,end:w.end,word:String(w.word||'').trim(),token:token(w.word||'')}))
  .filter(w=>w.token).sort((a,b)=>a.start-b.start);
}

export function findFillers(transcript,{extra=[],repeats=true,pad=.04}={}){
 const words=timedWords(transcript),singles=new Set(DEFAULT_FILLERS),phrases=[];
 for(const item of Array.isArray(extra)?extra:[]){const parts=token(item).split(/\s+/).filter(Boolean);if(parts.length===1)singles.add(parts[0]);else if(parts.length>1&&parts.length<=4)phrases.push(parts);}
 const items=[];
 const add=(from,to,word,kind)=>{
  const prev=words[from-1],next=words[to+1];
  const start=Math.max(prev?prev.end:0,words[from].start-pad),end=Math.min(next?next.start:words[to].end+pad,words[to].end+pad);
  if(end-start>=.06)items.push({start:round(start),end:round(end),word,kind});
 };
 for(let i=0;i<words.length;i++){
  const w=words[i];
  const phrase=phrases.find(ph=>ph.every((t,k)=>words[i+k]?.token===t));
  if(phrase){add(i,i+phrase.length-1,words.slice(i,i+phrase.length).map(x=>x.word).join(' '),'filler');i+=phrase.length-1;continue;}
  if(singles.has(w.token)){add(i,i,w.word,'filler');continue;}
  // "vamos a vamos a": a restarted phrase of two or three words keeps only the second take.
  if(repeats){
   let restarted=false;
   for(const n of [3,2]){
    if(i<n||i+n>words.length)continue;
    const first=words.slice(i-n,i),second=words.slice(i,i+n);
    if(!first.every((x,k)=>x.token===second[k].token)||first.every(x=>/^\d+$/.test(x.token))||second[0].start-first.at(-1).end>=.6)continue;
    const before=words[i-n-1],start=Math.max(before?before.end:0,first[0].start-pad),end=second[0].start;
    if(end-start>=.06){items.push({start:round(start),end:round(end),word:first.map(x=>x.word).join(' '),kind:'repeat'});restarted=true;i+=n-1;}
    break;
   }
   if(restarted)continue;
  }
  // "que que", "the the": drop the first take of an immediate stutter.
  const prev=words[i-1];
  if(repeats&&prev&&prev.token===w.token&&!/^\d+$/.test(w.token)&&w.start-prev.end<.5&&!items.some(x=>x.start<=prev.start&&x.end>=prev.end)){
   const start=Math.max(words[i-2]?words[i-2].end:0,prev.start-pad),end=w.start;
   if(end-start>=.06)items.push({start:round(start),end:round(end),word:prev.word,kind:'repeat'});
  }
 }
 // Merge touching intervals so the timeline does not fill up with slivers.
 const merged=[];
 for(const it of items.sort((a,b)=>a.start-b.start)){const last=merged.at(-1);if(last&&it.start<=last.end+.02){last.end=Math.max(last.end,it.end);last.word+=' '+it.word;if(last.kind!==it.kind)last.kind='filler';}else merged.push({...it});}
 return merged;
}

const ownClips=p=>p.clips.filter(c=>c.enabled&&(!c.sourceId||c.sourceId===p.id));
export function keptSeconds(p,start,end){let kept=0;for(const c of ownClips(p))kept+=Math.max(0,Math.min(end,c.end)-Math.max(start,c.start));return kept;}

// Only intervals that are still in the edit matter; removed material needs no cut.
export function activeFillers(p,options){
 return findFillers(p.transcript,options).filter(it=>keptSeconds(p,it.start,it.end)>.03);
}

export function transcriptView(p){
 const segments=(Array.isArray(p.transcript)?p.transcript:[]).map((s,index)=>{
  const length=Math.max(.001,s.end-s.start),kept=keptSeconds(p,s.start,s.end)/length;
  // Real word timings let the editor cut single words; estimated ones are display-only.
  const words=(Array.isArray(s.words)?s.words:[]).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)).map(w=>({start:w.start,end:w.end,word:String(w.word||'').trim(),estimated:w.estimated===true,kept:keptSeconds(p,w.start,w.end)>(w.end-w.start)/2}));
  return {index,start:s.start,end:s.end,text:String(s.text||''),state:kept>.95?'kept':kept<.05?'removed':'partial',words};
 });
 return {revision:p.revision,manual:p.manual===true,duration:Number(p.media?.duration)||0,clips:p.clips.filter(c=>c.enabled&&(!c.sourceId||c.sourceId===p.id)).map(c=>({start:c.start,end:c.end})),segments,fillers:activeFillers(p).length};
}

// Re-enable [start,end] of the original. Only plain single-source edits in source order
// are restorable here; reordered montages are edited on the timeline.
export function restoreRange(p,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>p.media.duration+.001)throw Error('Intervalo fuera del vídeo original');
 if(p.manual||p.clips.some(c=>c.sourceId&&c.sourceId!==p.id))throw Error('En un montaje manual, recupera el fragmento desde la timeline');
 const enabled=p.clips.filter(c=>c.enabled).map(c=>({...c}));
 for(let i=1;i<enabled.length;i++)if(enabled[i].start<enabled[i-1].end-.001)throw Error('Los cortes están reordenados; recupera el fragmento desde la timeline');
 let gaps=[{start,end}];
 for(const c of enabled)gaps=gaps.flatMap(g=>c.end<=g.start||c.start>=g.end?[g]:[{start:g.start,end:c.start},{start:c.end,end:g.end}]).filter(g=>g.end-g.start>=.05);
 if(!gaps.length)return null;
 const clips=[...enabled,...gaps.map(g=>({start:round(g.start),end:round(g.end),enabled:true,reason:'Recuperado desde la transcripción'}))].sort((a,b)=>a.start-b.start);
 return clips.map((c,i)=>({...c,id:String(i)}));
}

// Words of the edited montage, resolving every clip against its own recording.
export async function montageWords(p,loadProject){
 const words=[];let offset=0;
 for(const c of p.clips.filter(c=>c.enabled)){
  const owner=!c.sourceId||c.sourceId===p.id?p:await loadProject(c.sourceId).catch(()=>null);
  if(owner)for(const w of remapWords(owner.transcript||[],[{...c,enabled:true}]))words.push({...w,start:w.start+offset,end:w.end+offset});
  offset+=c.end-c.start;
 }
 return words;
}
function stamp(t,sep){const ms=Math.max(0,Math.round(t*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${sep}${String(ms%1000).padStart(3,'0')}`;}
export function vtt(words){return 'WEBVTT\n\n'+cues(words).map((g,i)=>`${i+1}\n${stamp(g[0].start,'.')} --> ${stamp(g.at(-1).end,'.')}\n${g.map(w=>w.word.trim()).join(' ')}\n`).join('\n');}
export function plainText(words){return words.map(w=>w.word.trim()).filter(Boolean).join(' ').replace(/([.?!…])\s+/g,'$1\n').trim()+'\n';}
