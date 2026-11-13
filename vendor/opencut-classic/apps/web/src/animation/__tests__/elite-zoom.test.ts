import {test,expect} from 'bun:test';
import {upsertPathKeyframe} from '../keyframes';
import {getElementKeyframes} from '../keyframe-query';
import {resolveAnimationPathValueAtTime} from '../resolve';
import {getParamChannelLayout} from '@/params';
import {mediaTimeFromSeconds} from '@/wasm';
import type {ElementAnimations} from '../types';

test('zoom and pan native keys interpolate and survive project JSON serialization',()=>{
 let animations:ElementAnimations|undefined;
 const channelLayout=getParamChannelLayout({param:{key:'value',label:'value',type:'number',default:0,min:-10000,step:.001}});
 const paths=['transform.scaleX','transform.scaleY','transform.positionX','transform.positionY'];
 const begin=[1,1,0,0],end=[2,2,-320,100];
 for(let i=0;i<paths.length;i++)for(const [seconds,value] of [[0,begin[i]],[2,end[i]]])animations=upsertPathKeyframe({animations,propertyPath:paths[i],time:mediaTimeFromSeconds({seconds}),value,interpolation:'linear',channelLayout,coerceValue:({value})=>value});
 const restored=JSON.parse(JSON.stringify(animations));
 expect(getElementKeyframes({animations:restored}).length).toBe(8);
 for(let i=0;i<paths.length;i++)expect(resolveAnimationPathValueAtTime({animations:restored,propertyPath:paths[i],localTime:mediaTimeFromSeconds({seconds:1}),fallbackValue:0})).toBeCloseTo((begin[i]+end[i])/2,5);
});
