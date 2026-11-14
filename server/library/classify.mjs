// File sniffing and smart classification. We never trust a provider's claimed type:
// the bytes decide what a file is, and unsafe SVG is rejected before it is stored.
import {plainText,spanishTags} from './glossary.mjs';

export const CATEGORIES={
 sfx:'Efecto de sonido',music:'Música',ambience:'Ambiente',photo:'Foto',illustration:'Ilustración',icon:'Icono',sticker:'Sticker',meme:'Meme',gif:'GIF',
 overlay:'Overlay',overlayVideo:'Overlay en vídeo',background:'Fondo',texture:'Textura',broll:'Vídeo de recurso (B-roll)',vertical:'Vídeo vertical',loopVideo:'Fondo animado',
 font:'Tipografía',script:'Tipografía manuscrita',lut:'LUT de color',lottie:'Animación Lottie',model:'Modelo 3D',template:'Plantilla para creadores',guide:'Guía de zonas seguras',other:'Otro',
};

export function sniff(buffer){
 const b=buffer,ascii=b.toString('latin1',0,16);
 if(b.length<12)return null;
 if(b[0]===0x89&&ascii.slice(1,4)==='PNG')return {mime:'image/png',ext:'png',kind:'image'};
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return {mime:'image/jpeg',ext:'jpg',kind:'image'};
 if(ascii.startsWith('GIF8'))return {mime:'image/gif',ext:'gif',kind:'image'};
 if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP')return {mime:'image/webp',ext:'webp',kind:'image'};
 if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE')return {mime:'audio/wav',ext:'wav',kind:'audio'};
 if(ascii.startsWith('OggS'))return {mime:'audio/ogg',ext:'ogg',kind:'audio'};
 if(ascii.startsWith('fLaC'))return {mime:'audio/flac',ext:'flac',kind:'audio'};
 if(ascii.startsWith('ID3')||(b[0]===0xff&&(b[1]&0xe0)===0xe0&&(b[1]&0x06)!==0))return {mime:'audio/mpeg',ext:'mp3',kind:'audio'};
 if(ascii.slice(4,8)==='ftyp'){const brand=ascii.slice(8,12);return /^M4[AB]/.test(brand)?{mime:'audio/mp4',ext:'m4a',kind:'audio'}:brand==='qt  '?{mime:'video/quicktime',ext:'mov',kind:'video'}:{mime:'video/mp4',ext:'mp4',kind:'video'};}
 if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return {mime:'video/webm',ext:'webm',kind:'video'};
 if(ascii.startsWith('wOF2'))return {mime:'font/woff2',ext:'woff2',kind:'font'};
 if(ascii.startsWith('wOFF'))return {mime:'font/woff',ext:'woff',kind:'font'};
 if(ascii.startsWith('OTTO'))return {mime:'font/otf',ext:'otf',kind:'font'};
 if((b[0]===0&&b[1]===1&&b[2]===0&&b[3]===0)||ascii.startsWith('true'))return {mime:'font/ttf',ext:'ttf',kind:'font'};
 if(ascii.startsWith('PK\x03\x04'))return {mime:'application/zip',ext:'zip',kind:'archive'};
 const head=b.toString('utf8',0,Math.min(b.length,6000)).replace(/^﻿/,'').trimStart();
 if(/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head))return {mime:'image/svg+xml',ext:'svg',kind:'image'};
 if(/LUT_3D_SIZE\s+\d+/.test(head))return {mime:'application/x-cube-lut',ext:'cube',kind:'lut'};
 if(head.startsWith('{')&&b.length<8*1024*1024){try{const json=JSON.parse(b.toString('utf8'));if(Array.isArray(json.layers)&&('fr' in json||'op' in json))return {mime:'application/json',ext:'json',kind:'lottie'};}catch{}}
 return null;
}

/** SVG can carry script and external references: only inert drawings are stored. */
export function checkSvg(buffer){
 const text=buffer.toString('utf8');
 if(/<script|<foreignObject|<iframe|<embed|<!ENTITY|javascript:|\son[a-z]+\s*=/i.test(text))throw new Error('El SVG contiene scripts o contenido activo y se ha rechazado');
 if(/(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i.test(text))throw new Error('El SVG enlaza recursos externos y se ha rechazado');
 if(buffer.length>5*1024*1024)throw new Error('SVG demasiado grande');
}

const norm=tag=>plainText(String(tag).trim()).replace(/[^\p{L}\p{N}\s-]/gu,'').trim();
export function classify({kind,ext='',title='',tags=[],duration=0,width=0,height=0,alpha=false,hint=''}){
 const words=plainText([title,hint,...tags].join(' ')),has=re=>re.test(words);
 let category;
 switch(kind){
  case 'audio':
   category=has(/music|musica|song|cancion|melod|beat|jingle|theme|soundtrack/)&&duration>=8?CATEGORIES.music
    :has(/ambien|atmos|drone|\brain\b|lluvia|\bwind\b|viento|forest|bosque|ocean|crowd|gente|room tone/)&&duration>=6?CATEGORIES.ambience
    :duration>75?CATEGORIES.music:CATEGORIES.sfx;break;
  case 'image':
   if(has(/meme/))category=CATEGORIES.meme;
   else if(ext==='gif')category=CATEGORIES.gif;
   else if(has(/guide|guia|safe zone|zona segura/))category=CATEGORIES.guide;
   else if(has(/template|plantilla|end screen|pantalla final|lower third|tercio inferior/))category=CATEGORIES.template;
   else if(ext==='svg')category=has(/icon|icono/)?CATEGORIES.icon:has(/sticker|emoji|badge|arrow|flecha|bubble|bocadillo/)?CATEGORIES.sticker:CATEGORIES.illustration;
   else if(has(/overlay|light leak|dust|grain|grano|bokeh|vignette|vineta|scanline|frame|marco|bars|barras/))category=CATEGORIES.overlay;
   else if(alpha)category=has(/icon|icono/)?CATEGORIES.icon:CATEGORIES.sticker;
   else if(has(/texture|textura|pattern|patron|material|seamless|hdri/))category=CATEGORIES.texture;
   else if(has(/background|fondo|gradient|degradado|abstract|abstracto|wallpaper/))category=CATEGORIES.background;
   else category=CATEGORIES.photo;break;
  case 'video':
   category=has(/overlay|bokeh|particle|particula|grain|grano|light leak|smoke|humo|glitch|flicker/)&&duration<=20?CATEGORIES.overlayVideo
    :has(/background|fondo|abstract|abstracto|loop/)&&duration<=30?CATEGORIES.loopVideo
    :height>width&&height>0?CATEGORIES.vertical:CATEGORIES.broll;break;
  case 'font':category=has(/script|handwriting|manuscrit|cursive/)?CATEGORIES.script:CATEGORIES.font;break;
  case 'lut':category=CATEGORIES.lut;break;
  case 'texture':category=CATEGORIES.texture;break;
  case 'lottie':category=CATEGORIES.lottie;break;
  case 'model':category=CATEGORIES.model;break;
  default:category=CATEGORIES.other;
 }
 const clean=[...new Set(tags.map(norm).filter(t=>t.length>=2&&t.length<=40))];
 const all=[...new Set([...clean,...spanishTags(clean),norm(category)])].slice(0,32);
 return {kind,category,tags:all};
}
