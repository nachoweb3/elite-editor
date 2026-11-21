type Media = {width?: number; height?: number; rotation?: number; fps?: string | number};
export function mediaFrameRate(media?: Media): number;
export function sourceDimensions(media?: Media): [number, number];
export function sourceCanvas(primary: Media | undefined, sources: Media[]): [number, number];
export function outputFrameRate(settings: {frameRate?: string} | undefined, sources: Media[]): number;
