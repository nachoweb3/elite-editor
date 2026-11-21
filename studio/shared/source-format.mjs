export function mediaFrameRate(media) {
  const value=media?.fps;
  if(typeof value!=='number'&&typeof value!=='string')return 0;
  const [num,den='1']=String(value).split('/');
  const rate=Number(num)/Number(den);
  return Number.isFinite(rate)&&rate>0?rate:0;
}

export function sourceDimensions(media) {
  const width=Number(media?.width)||0,height=Number(media?.height)||0;
  return Math.abs((media?.rotation||0)%180)===90?[height,width]:[width,height];
}

export function sourceCanvas(primary,sources) {
  const dimensions=sources.map(sourceDimensions).filter(([width,height])=>width>0&&height>0);
  const [primaryWidth,primaryHeight]=sourceDimensions(primary);
  const [width,height]=primaryWidth&&primaryHeight?[primaryWidth,primaryHeight]:(dimensions[0]||[1920,1080]);
  const scale=Math.max(1,...dimensions.map(([w,h])=>Math.max(w/width,h/height)));
  const even=size=>Math.ceil(size/2-1e-8)*2;
  return [even(width*scale),even(height*scale)];
}

export function outputFrameRate(settings,sources) {
  if(settings?.frameRate==='30'||settings?.frameRate==='60')return Number(settings.frameRate);
  return Math.max(0,...sources.map(mediaFrameRate))||30;
}
