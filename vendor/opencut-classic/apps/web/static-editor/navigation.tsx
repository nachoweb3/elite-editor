import {useSyncExternalStore} from 'react';
const subscribe=(fn:()=>void)=>{window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);};
const snapshot=()=>window.location.hash.slice(1)||'/projects';
export function usePathname(){return useSyncExternalStore(subscribe,snapshot,()=>'/projects');}
const navigate=(url:string,replace=false)=>{if(!url.startsWith('/')){window.location.assign(url);return;}if(replace){history.replaceState(null,'','#'+url);window.dispatchEvent(new HashChangeEvent('hashchange'));}else window.location.hash=url;};
const router={push:(url:string)=>navigate(url),replace:(url:string)=>navigate(url,true),back:()=>history.back(),refresh:()=>location.reload(),prefetch:()=>{}};
export function useRouter(){return router;}
export function useParams(){const pathname=usePathname();return{project_id:pathname.split('/')[2]};}
export function useSearchParams(){return new URLSearchParams(usePathname().split('?')[1]);}
