import {describe,test,expect} from 'bun:test';
import {eliteEffects} from './elite';
import {buildDefaultParamValues} from '@/params/registry';
describe('Elite built-in effects',()=>{
 test('all nine effects produce finite native GPU uniforms',()=>{expect(eliteEffects.length).toBe(9);for(const definition of eliteEffects){const p=buildDefaultParamValues(definition.params);const u=definition.renderer.passes[0].uniforms({effectParams:p,width:1920,height:1080});expect(definition.renderer.passes[0].shader).toBe('elite');for(const v of Object.values(u)){expect(Array.isArray(v)).toBe(true);expect((v as number[]).length).toBe(4);expect((v as number[]).every(Number.isFinite)).toBe(true);}}});
 test('chroma supports custom key color and separate edge controls',()=>{const definition=eliteEffects.find(e=>e.type==='elite-chroma')!;const u=definition.renderer.passes[0].uniforms({effectParams:{color:'#0000ff',threshold:.2,softness:.1,spill:.7},width:100,height:100});expect(u.u_values).toEqual([6,.2,.1,.7]);expect(u.u_extra).toEqual([0,0,1,0]);});
});
