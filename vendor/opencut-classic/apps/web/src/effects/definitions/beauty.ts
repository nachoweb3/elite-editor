import type {EffectDefinition} from '../types';
import type {ParamDefinition} from '@/params';
const control=(key:string,label:string,value:number,min=0,max=1):ParamDefinition=>({key,label,type:'number',default:value,min,max,step:.01});
export const beautyDefinition:EffectDefinition={
 type:'elite-beauty',name:'Belleza en directo · zona manual',keywords:['belleza','piel','retrato','suavizar'],
 params:[control('smooth','Suavizado con detalle',0),control('light','Luz suave',0),control('warmth','Temperatura',0,-1),control('detail','Detalle',0),control('centerX','Centro horizontal',.5),control('centerY','Centro vertical',.5),control('width','Anchura de la zona',.65,.05,2),control('height','Altura de la zona',.85,.05,2)],
 renderer:{passes:[{shader:'elite',uniforms:({effectParams:p})=>({u_values:[9,Number(p.smooth??0),Number(p.light??0),Number(p.warmth??0)],u_extra:[Number(p.centerX??.5),Number(p.centerY??.5),Number(p.width??.65),Number(p.height??.85)],u_direction:[Number(p.detail??0),0]})}]}
};
