import type {AnchorHTMLAttributes} from 'react';
export default function Link({href='',prefetch,replace,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{prefetch?:boolean;replace?:boolean}){
 return <a {...props} href={href.startsWith('/')?'#'+href:href}/>;
}
