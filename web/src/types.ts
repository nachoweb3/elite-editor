export type Clip={id:string;start:number;end:number;enabled:boolean;reason:string};
export type Word={start:number;end:number;word:string;estimated?:boolean};
export type Segment={start:number;end:number;text:string;words:Word[]};
export type Settings={style:string;subtitle:string;profile:string;fit:string;cropX:number;cropY:number;language:string;subtitles:boolean;cleanAudio:boolean;exposure:number;contrast:number;saturation:number;transition:number;soundEffects:boolean;musicId:string|null;musicVolume:number;zoom:number;title:string;subtitlePosition:string;encoder:string};
export type Artifact={revision?:number;width?:number;height?:number;duration?:number;encoder?:string;createdAt?:string};
export type Project={id:string;blank?:boolean;name:string;revision:number;media:{duration:number;width:number;height:number;audio:boolean};settings:Settings;clips:Clip[];transcript:Segment[];reviewed:boolean;analysis:null|{silences:{start:number;end:number}[];scenes:{start:number;end:number;type:string;confidence:number;suggestions:{type:string}[]}[];warnings:string[];transcriptionComplete:boolean};artifacts:Record<string,Artifact>;jobs:{id:string;type:string;status:string;message:string}[]};
export type Asset={id:string;name:string;kind:string;tags:string[];license:string};

export type AudioTrack={id:string;assetId:string;name:string;kind:string;sourceDuration:number;at:number;sourceIn:number;duration:number;volume:number;fadeIn:number;fadeOut:number;muted:boolean;locked:boolean};
export type AudioAsset=Asset&{duration:number;category?:string};
