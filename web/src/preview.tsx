import {Player} from '@remotion/player';
import {StudioComposition} from './Composition';
import type {Project} from './types';
export default function LivePreview({project}:{project:Project}){const landscape=project.settings.profile.startsWith('youtube'),duration=project.clips.filter(c=>c.enabled).reduce((a,c)=>a+Math.max(1,Math.round((c.end-c.start)*30)),0);return <Player component={StudioComposition} inputProps={{project}} durationInFrames={Math.max(1,duration)} fps={30} compositionWidth={landscape?1920:1080} compositionHeight={landscape?1080:1920} controls style={{height:'100%',maxWidth:'100%',aspectRatio:landscape?'16/9':'9/16'}}/>;}
