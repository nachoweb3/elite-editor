import {probe} from './core.mjs';

export {mediaFrameRate,outputFrameRate} from '../shared/source-format.mjs';

export const UNSUPPORTED_COLOR='La exportación actual admite vídeo SDR de 8 bits. Este montaje incluye HDR o vídeo de más de 8 bits y se ha detenido para conservar la imagen original.';

export function requiresExtendedColor(media) {
  return ['smpte2084','arib-std-b67'].includes(media?.colorTransfer)
    ||media?.colorPrimaries==='bt2020'||/(?:p|gray)(?:9|10|12|14|16)(?:le|be)?$|^(?:p[024]0(?:10|12|16)|y[24](?:10|12|16)|[bx]gr(?:48|64)|[rb]gba(?:48|64)|[rb]gb48|x2[rb]gb10)/i.test(media?.pixelFormat||'');
}

export async function sourceMedia(project) {
  if(project.media?.pixelFormat||!project.source)return project.media;
  return probe(project.source).catch(()=>project.media);
}

export function sourceIsUhd(media) {
  const width=Number(media?.width)||0,height=Number(media?.height)||0;
  return Math.max(width,height)>=3840&&Math.min(width,height)>=2160;
}

export function outputQuality(settings) {
  return settings?.exportQuality==='balanced'?'balanced':'high';
}

export function videoEncodingArgs(hardware,quality,{intermediate=false}={}) {
  const quantizer=quality==='balanced'?(intermediate?16:20):(intermediate?13:16);
  return hardware
    ?['-c:v','h264_nvenc','-preset','p4','-cq',String(quantizer),'-b:v','0']
    :['-c:v','libx264','-preset','fast','-crf',String(quantizer),'-threads','8'];
}
