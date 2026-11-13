export type SourceClip={id:string;sourceId?:string;start:number;end:number;enabled:boolean};
export type Range={start:number;end:number};
export function removedRanges(clips:SourceClip[],sourceId:string,duration:number):Range[]{
 const ranges:Range[]=[];let cursor=0;
 for(const c of clips.filter(c=>c.enabled&&(c.sourceId||sourceId)===sourceId).sort((a,b)=>a.start-b.start)){
  const start=Math.max(0,Math.min(duration,c.start)),end=Math.max(start,Math.min(duration,c.end));
  if(start-cursor>=1/30)ranges.push({start:cursor,end:start});cursor=Math.max(cursor,end);
 }
 if(duration-cursor>=1/30)ranges.push({start:cursor,end:duration});return ranges;
}
export function sourceAtMontage(clips:SourceClip[],time:number){let offset=0;for(const c of clips){const length=c.end-c.start;if(time<offset+length)return {sourceId:c.sourceId,time:c.start+Math.max(0,time-offset)};offset+=length;}const last=clips.at(-1);return last?{sourceId:last.sourceId,time:last.end}:null;}
export function montageAtSource(clips:SourceClip[],sourceId:string,time:number){let offset=0,nearest=0,distance=Infinity;for(const c of clips){if((c.sourceId||sourceId)===sourceId){if(time>=c.start&&time<=c.end)return offset+time-c.start;const d=Math.min(Math.abs(time-c.start),Math.abs(time-c.end));if(d<distance){distance=d;nearest=offset+(time<c.start?0:c.end-c.start);}}offset+=c.end-c.start;}return nearest;}
export function restoreRange<T extends SourceClip>(clips:T[],sourceId:string,duration:number,range:Range,makeClip:(r:Range)=>T):T[]{
 const missing=removedRanges(clips,sourceId,duration).flatMap(g=>{const start=Math.max(range.start,g.start),end=Math.min(range.end,g.end);return end-start>=1/30?[{start,end}]:[];});
 const result=[...clips];for(const gap of missing){const index=result.findIndex(c=>(c.sourceId||sourceId)===sourceId&&c.start>=gap.end);result.splice(index<0?result.length:index,0,makeClip(gap));}return result;
}
