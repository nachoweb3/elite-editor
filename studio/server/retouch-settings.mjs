export const faceSignedControls=['faceEyeSize','faceNoseSize','faceMouthSize','faceWidth','faceWarmth'];
export const faceDefaults={faceRetouch:false,faceSmooth:.22,faceLight:.12,faceUnderEyes:.12,faceEyes:.08,faceTeeth:0,faceJaw:0,faceWrinkles:0,faceTexture:0,faceWarmth:0,faceLipColor:0,faceEyeSize:0,faceNoseSize:0,faceMouthSize:0,faceWidth:0};
// Preset fuerte y natural: piel/ojos/lifting al máximo; los cuatro tamaños son límites que el worker adapta a las proporciones medidas de cada cara.
export const faceMaxBeauty={faceRetouch:true,faceSmooth:.7,faceLight:.32,faceUnderEyes:.66,faceEyes:.48,faceTeeth:.18,faceJaw:.52,faceWrinkles:.38,faceTexture:0,faceWarmth:.08,faceLipColor:.16,faceEyeSize:.24,faceNoseSize:-.16,faceMouthSize:.06,faceWidth:-.18};
export function faceSettings(settings){const s={...faceDefaults,...settings};if(typeof s.faceRetouch!=='boolean')throw new Error('Retoque facial inválido');for(const k of Object.keys(faceDefaults).filter(k=>k!=='faceRetouch'))if(!Number.isFinite(s[k])||s[k]<(faceSignedControls.includes(k)?-1:0)||s[k]>1)throw new Error('Control facial fuera de rango: '+k);return Object.fromEntries(Object.keys(faceDefaults).map(k=>[k,s[k]]));}
export function automaticFaceSettings(settings,preference){
  if(preference===false)return {...faceSettings(settings),faceRetouch:false};
  return preference===true||settings.beautyAuto===true?faceMaxBeauty:faceSettings(settings);
}
