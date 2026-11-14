// Unified search: your local library first-class, plus every enabled connector in
// parallel. Failures stay per-connector; a slow or keyless source never blocks the rest.
import {CONNECTORS} from './connectors/index.mjs';
import {expandQuery} from './glossary.mjs';
import {getKeys} from './keys.mjs';

const SEARCH_TTL=10*60_000,RESULT_TTL=30*60_000,CONNECTOR_TIMEOUT=15_000;
const searchCache=new Map(),resultCache=new Map();
export const resetSearchCache=()=>{searchCache.clear();resultCache.clear();};

export function rememberResult(item){resultCache.set(item.key,{item,at:Date.now()});if(resultCache.size>4000)resultCache.delete(resultCache.keys().next().value);}
export function getResult(key){const hit=resultCache.get(key);if(!hit)return null;if(Date.now()-hit.at>RESULT_TTL){resultCache.delete(key);return null;}return hit.item;}

export function publicLocal(item){const {file,...rest}=item;return {...rest,url:`/api/library/file/${item.id}`};}
export function publicRemote(item,connector,store){const {_download,...rest}=item;return {...rest,connectorName:connector.name,owned:store.ownedBySource(item.key),requiresAck:connector.requiresAck||undefined};}

const supports=(connector,kind)=>kind==='all'||connector.kinds.includes(kind);
// Prefer freely reusable results: CC0/public domain, then no-attribution, then the rest.
const licenseRank=item=>['CC0-1.0','PDM'].includes(item.license?.id)?0:!item.license?.attribution&&item.license?.commercial?1:item.license?.commercial?2:3;
const withTimeout=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tiempo de espera agotado')),ms);timer.unref?.();})]).finally(()=>clearTimeout(timer));};

export async function unifiedSearch({q='',kind='all',scope='all',connectorIds,page=1,perPage=18,commercialOnly=false,category}={},{store,connectors=CONNECTORS,deps,keys,now=Date.now}={}){
 const started=now(),expanded=expandQuery(q),query=expanded.original;
 const local=scope==='remote'||!store?{items:[],total:0}:store.search(query,{kind,category,commercialOnly,limit:60});
 const result={query:{original:expanded.original,english:expanded.english,translated:expanded.translated},local:{items:local.items.map(publicLocal),total:local.total},remote:{items:[],total:0,errors:[],skipped:[]},tookMs:0};
 if(scope==='local'||!query){result.tookMs=now()-started;return result;}
 const available=keys??await getKeys();
 const chosen=connectors.filter(c=>c.mode==='api'&&(!connectorIds?.length||connectorIds.includes(c.id)));
 const settled=await Promise.all(chosen.map(async connector=>{
  if(!supports(connector,kind))return {connector,skipped:`no ofrece ${kind==='all'?'este tipo':kind}`};
  if(connector.auth.type==='key'&&!available[connector.auth.keyName])return {connector,skipped:'falta la clave de API'};
  const cacheKey=JSON.stringify([connector.id,query,kind,page,perPage]),hit=searchCache.get(cacheKey);
  if(hit&&now()-hit.at<SEARCH_TTL)return {connector,items:hit.items,total:hit.total};
  try{
   const found=await withTimeout(connector.search({query,english:expanded.english,kind,page,perPage,keys:available},deps),CONNECTOR_TIMEOUT);
   const items=(found.items||[]).filter(item=>kind==='all'||item.kind===kind);
   searchCache.set(cacheKey,{at:now(),items,total:found.total||items.length});if(searchCache.size>300)searchCache.delete(searchCache.keys().next().value);
   return {connector,items,total:found.total||items.length};
  }catch(e){return {connector,error:String(e.message||e).slice(0,240)};}
 }));
 const lists=[];const seenKey=new Set(),seenUrl=new Set();
 for(const entry of settled){
  if(entry.skipped){result.remote.skipped.push({connector:entry.connector.id,name:entry.connector.name,reason:entry.skipped});continue;}
  if(entry.error){result.remote.errors.push({connector:entry.connector.id,name:entry.connector.name,error:entry.error});continue;}
  const list=entry.items.filter(item=>!(commercialOnly&&item.license?.commercial===false)).map((item,index)=>({item,index,rank:licenseRank(item)})).sort((a,b)=>a.rank-b.rank||a.index-b.index);
  lists.push({connector:entry.connector,list:list.map(e=>e.item)});result.remote.total+=entry.total;
 }
 // Round-robin keeps every source visible instead of letting one fill the page.
 for(let i=0;lists.some(l=>i<l.list.length);i++)for(const {connector,list} of lists){
  const item=list[i];if(!item||seenKey.has(item.key)||(item.sourceUrl&&seenUrl.has(item.sourceUrl)))continue;
  seenKey.add(item.key);if(item.sourceUrl)seenUrl.add(item.sourceUrl);
  rememberResult(item);result.remote.items.push(publicRemote(item,connector,store||{ownedBySource:()=>null}));
 }
 result.tookMs=now()-started;return result;
}
