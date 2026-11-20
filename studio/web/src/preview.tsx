import {Player} from '@remotion/player';
import {StudioComposition} from './Composition';
import {buildComposition} from '../../shared/composition.mjs';
import type {CompositionSpec,Project} from './types';

export default function LivePreview({project}:{project:Project}){
 const composition=buildComposition(project) as CompositionSpec;
 const landscape=composition.width>composition.height;
 return <Player component={StudioComposition} inputProps={{project}} durationInFrames={Math.max(1,Math.round(composition.duration*composition.fps))} fps={composition.fps} compositionWidth={composition.width} compositionHeight={composition.height} controls style={{height:'100%',maxWidth:'100%',aspectRatio:landscape?'16/9':'9/16'}}/>;
}
