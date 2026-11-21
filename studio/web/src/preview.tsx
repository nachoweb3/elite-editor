import {Player} from '@remotion/player';
import {useMemo} from 'react';
import {CompositionRenderer} from './Composition';
import {buildComposition} from '../../shared/composition.mjs';
import type {CompositionSpec,Project} from './types';

export default function LivePreview({project}:{project:Project}){
 const inputProps=useMemo(()=>({composition:buildComposition(project) as CompositionSpec}),[project]);
 const {composition}=inputProps;
 return <Player component={CompositionRenderer} inputProps={inputProps} durationInFrames={Math.max(1,Math.round(composition.duration*composition.fps))} fps={composition.fps} compositionWidth={composition.width} compositionHeight={composition.height} controls style={{height:'100%',maxWidth:'100%',aspectRatio:`${composition.width} / ${composition.height}`}}/>;
}
