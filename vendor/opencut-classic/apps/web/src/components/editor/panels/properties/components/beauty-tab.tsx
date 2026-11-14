"use client";
import {useEditor} from '@/editor/use-editor';
import {useElementPreview} from '@/timeline/hooks/use-element-preview';
import type {VideoElement,ImageElement} from '@/timeline';
import {beautyDefinition} from '@/effects/definitions/beauty';
import {Button} from '@/components/ui/button';
import {useAssetsPanelStore} from '@/components/editor/panels/assets/assets-panel-store';

export function BeautyTab({element,trackId}:{element:VideoElement|ImageElement;trackId:string}){
 const editor=useEditor();
 const {renderElement,previewUpdates,commit}=useElementPreview({trackId,elementId:element.id,fallback:element});
 const effect=renderElement.effects?.find(e=>e.type==='elite-beauty');
 const ref=effect?{trackId,elementId:element.id,effectId:effect.id}:null;
 function change(key:string,value:number){if(!effect)return;previewUpdates({effects:(renderElement.effects||[]).map(e=>e.id===effect.id?{...e,params:{...e.params,[key]:value}}:e)});}
 return <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
  <h2 className="font-semibold">Belleza en directo</h2>
  <p className="text-xs text-muted-foreground">Ajusta mientras ves el vídeo. Este acabado se guarda en el clip y utiliza el mismo efecto GPU al exportar.</p>
  {!effect?<Button onClick={()=>editor.timeline.addClipEffect({trackId,elementId:element.id,effectType:'elite-beauty'})}>Activar acabado en directo</Button>:<>
   <Button variant="outline" onClick={()=>ref&&editor.timeline.toggleClipEffect(ref)}>{effect.enabled?'Ver sin este acabado':'Volver al acabado'}</Button>
   {!effect.enabled?<p role="status" className="text-xs">El acabado está desactivado para comparar.</p>:null}
   {beautyDefinition.params.slice(0,4).map(param=><label key={param.key} className="block space-y-2 text-xs">{param.label} · {Math.round(Number(effect.params[param.key]??param.default)*100)} %<input aria-label={param.label} type="range" className="w-full" min={param.type==='number'?param.min:0} max={param.type==='number'?param.max:1} step=".01" disabled={!effect.enabled} value={Number(effect.params[param.key]??param.default)} onChange={e=>change(param.key,Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>)}
   <details className="space-y-3 rounded border p-3" open><summary className="cursor-pointer font-medium">Zona de aplicación</summary><p className="text-xs text-muted-foreground">Sitúa la zona ovalada sobre el rostro. No tiene seguimiento automático: si la persona se desplaza, esta zona permanece fija en el clip. También afecta a otros objetos dentro de ella.</p>
   {beautyDefinition.params.slice(4).map(param=><label key={param.key} className="block text-xs">{param.label} · {Number(effect.params[param.key]??param.default).toFixed(2)}<input aria-label={param.label} className="w-full" type="range" min={param.type==='number'?param.min:0} max={param.type==='number'?param.max:1} step=".01" value={Number(effect.params[param.key]??param.default)} disabled={!effect.enabled} onChange={e=>change(param.key,Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>)}</details>
   <Button variant="outline" onClick={()=>ref&&editor.timeline.removeClipEffect(ref)}>Quitar acabado del clip</Button>
  </>}
  <div className="space-y-2 border-t pt-3"><p className="text-xs text-muted-foreground">El tamaño de ojos, nariz, boca y el retoque con seguimiento siguen disponibles en el asistente mediante procesamiento previo. Aún no son controles en directo.</p><Button variant="ghost" size="sm" onClick={()=>useAssetsPanelStore.getState().setActiveTab('assistant')}>Abrir retoque con seguimiento</Button></div>
 </div>;
}
