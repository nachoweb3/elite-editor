import {useState} from 'react';
import {Captions} from '@/subtitles/components/assets-view';
import {Button} from '@/components/ui/button';
import {useEditor} from '@/editor/use-editor';
import {useAssetsPanelStore} from '@/components/editor/panels/assets/assets-panel-store';
import type {TranscriptionModelId} from '@/transcription/types';

export function NachoAssistant(){
 const editor=useEditor();
 const [model,setModel]=useState<TranscriptionModelId>('whisper-tiny');
 const [message,setMessage]=useState('');
 const tab=useAssetsPanelStore(s=>s.setActiveTab);
 async function format(width:number,height:number){try{await editor.project.updateSettings({settings:{canvasSize:{width,height}}});setMessage(`Formato ${width} × ${height} aplicado. Puedes deshacerlo desde la timeline.`);}catch(e){setMessage(e instanceof Error?e.message:'No se pudo cambiar el formato');}}
 return <div className="h-full overflow-auto p-4 space-y-4 text-sm">
  <header className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3 space-y-2"><h2 className="font-semibold text-lg">Asistente IA · listo para empezar</h2><p>Español · Whisper · procesamiento en tu navegador · sin claves</p></header>
  <p>Importa un vídeo, añádelo a la timeline y genera subtítulos con IA. La primera ejecución descarga el modelo; no se envía tu grabación a un servidor.</p>
  <label className="block space-y-2">Modelo de transcripción<select aria-label="Modelo del asistente" className="w-full rounded border bg-background p-2" value={model} onChange={e=>setModel(e.target.value as TranscriptionModelId)}><option value="whisper-tiny">Rápido · Tiny (predeterminado)</option><option value="whisper-small">Equilibrado · Small</option><option value="whisper-medium">Precisión · Medium (descarga mayor)</option></select></label>
  <p className="text-xs text-muted-foreground">La descarga empieza al pulsar el botón de generar subtítulos. Los modelos más grandes consumen más memoria y tardan más. Cambiar de modelo puede requerir otra descarga.</p>
  <details open className="rounded border"><summary className="p-3 font-semibold cursor-pointer">Transcribir y crear subtítulos</summary><Captions modelId={model} initialLanguage="es"/></details>
  <section className="space-y-2"><h3 className="font-semibold">Preparar el formato</h3><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void format(1920,1080)}>YouTube · 16:9</Button><Button variant="outline" onClick={()=>void format(1080,1920)}>Shorts · 9:16</Button><Button variant="outline" onClick={()=>void format(1080,1080)}>Cuadrado · 1:1</Button></div>{message?<p role="status">{message}</p>:null}</section>
  <section className="space-y-2"><h3 className="font-semibold">Acabar tu vídeo</h3><div className="flex flex-wrap gap-2"><Button onClick={()=>tab('beauty')}>Retoque visual</Button><Button variant="outline" onClick={()=>tab('sounds')}>Música y sonidos</Button><Button variant="outline" onClick={()=>tab('settings')}>Más ajustes</Button></div></section>
  <p className="text-xs text-muted-foreground">Este asistente web transcribe y facilita los ajustes. La edición por prompts, el corte automático de silencios y la limpieza con FFmpeg requieren el motor de la versión local.</p>
 </div>;
}
