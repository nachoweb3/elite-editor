import {useEditor} from '@/editor/use-editor';
import {Button} from '@/components/ui/button';
import {usePropertiesStore} from '../../properties/stores/properties-store';
import {useAssetsPanelStore} from '../assets-panel-store';
export function EliteBeauty(){
 const editor=useEditor();
 const selected=useEditor(e=>e.selection.getSelectedElements());
 useEditor(e=>e.scenes.getActiveSceneOrNull());
 const entry=selected.length===1?editor.timeline.getElementsWithTracks({elements:selected})[0]:null;
 const visual=entry&&(entry.element.type==='video'||entry.element.type==='image')?entry:null;
 return <section className="h-full overflow-auto p-4 space-y-4 text-sm"><header className="rounded-lg border border-violet-400/50 bg-violet-400/10 p-4"><h2 className="text-lg font-semibold">Retoque visual en directo</h2><p className="mt-2">Piel, luz, calidez y detalle. Comprueba el cambio sobre tu vídeo mientras ajustas los controles de la derecha.</p></header>
 {visual?<><p>Clip seleccionado: <strong>{visual.element.name}</strong></p><Button className="w-full" onClick={()=>usePropertiesStore.getState().setActiveTab({elementType:visual.element.type,tabId:'beauty'})}>Abrir retoques a la derecha →</Button></>:<p role="status">Selecciona un único clip de vídeo o imagen en la timeline para abrir sus retoques.</p>}
 <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>useAssetsPanelStore.getState().setActiveTab('adjustment')}>Color y luz</Button><Button variant="outline" onClick={()=>useAssetsPanelStore.getState().setActiveTab('background')}>Quitar fondo / chroma</Button><Button variant="outline" onClick={()=>useAssetsPanelStore.getState().setActiveTab('zoom')}>Zoom y encuadre</Button></div>
 <p className="text-xs text-muted-foreground">El acabado usa una zona ovalada manual y se guarda en el clip. No sigue el rostro automáticamente ni cambia el tamaño de sus rasgos en directo.</p></section>;
}
