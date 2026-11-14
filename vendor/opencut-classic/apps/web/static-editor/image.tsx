import type {ImgHTMLAttributes} from 'react';
export default function Image({src,fill,priority,unoptimized,quality,loader,style,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'>&{src:string|{src:string};fill?:boolean;priority?:boolean;unoptimized?:boolean;quality?:number;loader?:unknown}){
 const url=typeof src==='string'?src:src.src;
 return <img {...props} src={url.startsWith('/')?'.'+url:url} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%',...style}:style}/>;
}
