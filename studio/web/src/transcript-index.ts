import {clock,searchText,type SourceClip} from './timeline.ts';
import type {Segment} from './types';

export type TranscriptHit={id:string;time:number;text:string;searchable:string};
export type Chapter={time:number;title:string};

export function indexMontageTranscript(clips:SourceClip[],sources:ReadonlyMap<string,Segment[]>,projectId:string):TranscriptHit[]{
 const index:TranscriptHit[]=[];
 const prepared=new Map<string,{segments:Segment[];ends:number[]}>();
 let offset=0;
 for(const clip of clips){
  if(!clip.enabled)continue;
  const sourceId=clip.sourceId||projectId;
  let transcript=prepared.get(sourceId);
  if(!transcript){
   const segments=[...(sources.get(sourceId)||[])].sort((a,b)=>a.start-b.start);
   let latest=0;
   const ends=segments.map(segment=>latest=Math.max(latest,segment.end));
   transcript={segments,ends};
   prepared.set(sourceId,transcript);
  }
  const {segments,ends}=transcript;
  let low=0,high=segments.length;
  while(low<high){
   const mid=Math.floor((low+high)/2);
   if(ends[mid]<=clip.start)low=mid+1;
   else high=mid;
  }
  for(let i=low;i<segments.length&&segments[i].start<clip.end;i++){
   const segment=segments[i];
   if(segment.end<=clip.start)continue;
   const partial=segment.start<clip.start||segment.end>clip.end;
   const words=partial?segment.words?.filter(word=>word.start<clip.end&&word.end>clip.start):null;
   const text=(words?.length?words.map(word=>word.word).join(' '):partial&&segment.words?.length?'':segment.text).trim();
   if(!text)continue;
   const start=Math.max(clip.start,words?.[0]?.start??segment.start);
   index.push({id:`${clip.id}:${i}`,time:offset+start-clip.start,text,searchable:searchText(text)});
  }
  offset+=clip.end-clip.start;
 }
 return index.sort((a,b)=>a.time-b.time);
}

export function montageChapters(index:TranscriptHit[],duration:number):Chapter[]{
 if(!index.length)return [];
 const title=(line:string)=>line.split(/\s+/).slice(0,10).join(' ').slice(0,64).trimEnd().replace(/[,.;:]$/,'')||'Inicio';
 const chapters:Chapter[]=[{time:0,title:index[0].time<10?title(index[0].text):'Inicio'}];
 for(const line of index){
  if(chapters.length===40||line.time>duration-10)break;
  if(line.time-chapters.at(-1)!.time>=75)chapters.push({time:line.time,title:title(line.text)});
 }
 return chapters;
}

export function chapterText(chapters:Chapter[]){
 return chapters.map(({time,title})=>{
  const hours=Math.floor(time/3600);
  const minutes=clock(time%3600).padStart(5,'0');
  return `${hours?`${hours}:`:''}${minutes} ${title}`;
 }).join('\n');
}
