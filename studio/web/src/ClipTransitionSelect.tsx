import {CLIP_TRANSITIONS,isClipTransition} from '../../shared/transitions.mjs';

const groups=['Fundidos','Desplazamientos','Revelados'] as const;
const options=Object.entries(CLIP_TRANSITIONS);

export function ClipTransitionSelect({value,allowCut=true,disabled,onChange}:{
  value?:string;
  allowCut?:boolean;
  disabled?:boolean;
  onChange:(value:string)=>void;
}){
  const selected=isClipTransition(value)?value:allowCut?'none':'fadeblack';
  return <select value={selected} disabled={disabled} onChange={event=>onChange(event.target.value)}>
    {allowCut?<option value="none">Corte directo</option>:null}
    {groups.map(group=><optgroup key={group} label={group}>
      {options.filter(([,preset])=>preset.group===group).map(([id,preset])=><option key={id} value={id}>{preset.label}</option>)}
    </optgroup>)}
  </select>;
}
