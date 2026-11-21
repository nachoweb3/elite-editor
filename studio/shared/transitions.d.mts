export type ClipTransitionType=
  |'fadeblack'|'fadewhite'
  |'slide'|'slide-left'|'slide-top'|'slide-bottom'
  |'wipe-right'|'wipe-diagonal'|'open-horizontal'|'open-vertical'|'iris';

type TransitionPreset={
  label:string;
  group:'Fundidos'|'Desplazamientos'|'Revelados';
  duration:number;
}&(
  |{kind:'fade';color:'black'|'white'}
  |{kind:'slide';axis:'x'|'y';direction:1|-1}
  |{kind:'open';axis:'x'|'y'}
  |{kind:'wipe-right'|'wipe-diagonal'|'iris'}
);

export const CLIP_TRANSITIONS:Readonly<Record<ClipTransitionType,TransitionPreset>>;
export function isClipTransition(value:unknown):value is ClipTransitionType;
