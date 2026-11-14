// Forge pack "svg": original vector stickers (arrows, marks, speech bubbles, call-to-action badges, numbers,
// ratings, progress bars and lower thirds). Every file is built by a pure string function: no scripts, no
// event attributes, no external references. All of it is CC0-1.0 by "Elite Editor".
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkSvg,CATEGORIES} from '../classify.mjs';

export const PACK={id:'svg',title:'Stickers SVG',description:'Más de 70 stickers vectoriales: flechas, marcas, bocadillos, insignias para creadores, números, valoraciones, barras de progreso y tercios inferiores. Originales y de dominio público (CC0).'};

const INK='#101014',YELLOW='#FFD60A',RED='#FF3B30',MINT='#5CF2C2';
const FONT="'Arial Black','Bahnschrift','Segoe UI Emoji',Arial,sans-serif";
const FONT2="Bahnschrift,'Segoe UI','Segoe UI Emoji',Arial,sans-serif";
const n=v=>String(Math.round(v*100)/100);

/** Text and attribute escaping: everything outside printable ASCII becomes a numeric character reference. */
export const esc=s=>String(s).replace(/[&<>"']|[^\x20-\x7e]/g,c=>`&#${c.codePointAt(0)};`);
const svg=(w,h,title,body,defs='')=>`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">\n<title>${esc(title)}</title>\n${defs?`<defs>${defs}</defs>\n`:''}${body}\n</svg>\n`;

/** Structural XML check for the subset these generators emit (balanced tags, quoted unique attributes, valid entities). */
export function wellFormed(text){
 const tag=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/g;
 const stack=[];let last=0,root=null,m;
 const plain=chunk=>{if(/</.test(chunk))throw new Error('Marcado XML no válido');if(/&(?!(?:[A-Za-z]+|#\d+|#x[0-9A-Fa-f]+);)/.test(chunk))throw new Error('Entidad XML no válida');};
 while((m=tag.exec(text))){
  const gap=text.slice(last,m.index);plain(gap);if(!stack.length&&gap.trim()&&root)throw new Error('Texto fuera del elemento raíz');
  last=tag.lastIndex;if(!m[2])continue;
  const attrs=[...m[3].matchAll(/([\w:.-]+)\s*=/g)].map(x=>x[1]);
  if(new Set(attrs).size!==attrs.length)throw new Error(`Atributo repetido en <${m[2]}>`);
  for(const v of m[3].matchAll(/=\s*(?:"([^"]*)"|'([^']*)')/g))plain(v[1]??v[2]);
  if(m[1]){if(stack.pop()!==m[2])throw new Error(`Etiqueta </${m[2]}> sin pareja`);}
  else{if(!stack.length){if(root)throw new Error('Más de un elemento raíz');root=m[2];}if(!m[4])stack.push(m[2]);}
 }
 plain(text.slice(last));
 if(stack.length)throw new Error(`Etiqueta <${stack.pop()}> sin cerrar`);
 if(root!=='svg')throw new Error('El elemento raíz debe ser <svg>');
 if(!/<svg[^>]*\sviewBox="[^"]+"/.test(text)||!/<svg[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(text))throw new Error('Falta viewBox o xmlns');
 return true;
}

/* ------------------------------ arrows ------------------------------ */
const COLORS={amarillo:{hex:YELLOW,en:'yellow'},rojo:{hex:RED,en:'red'}};
const DIRS=[['derecha',0,'right'],['abajo-derecha',45,'down right'],['abajo',90,'down'],['abajo-izquierda',135,'down left'],['izquierda',180,'left'],['arriba-izquierda',225,'up left'],['arriba',270,'up'],['arriba-derecha',315,'up right']];
const ARROW='M20 90H130V45L220 120L130 195V150H20Z';
const arrow=(angle,color)=>svg(240,240,'Flecha',`<g transform="rotate(${angle} 120 120)"><path d="${ARROW}" fill="${color}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/><path d="M32 99H139V64L200 114" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`);
const head=(tip,theta,len,spread)=>[-1,1].map(s=>`${n(tip[0]+len*Math.cos(theta+Math.PI+s*spread))} ${n(tip[1]+len*Math.sin(theta+Math.PI+s*spread))}`);
const angle=(p,q)=>Math.atan2(q[1]-p[1],q[0]-p[0]);
// Curved arrow: thick stroke + filled head, each with a dark outline underneath. `flip` mirrors it horizontally.
const curved=(d,end,prev,color,flip)=>{
 const deg=n(angle(prev,end)*180/Math.PI),tri='0 -30 46 0 0 30';
 const body=`<path d="${d}" fill="none" stroke="${INK}" stroke-width="34" stroke-linecap="round"/><polygon transform="translate(${end[0]} ${end[1]}) rotate(${deg})" points="${tri}" fill="${INK}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round"/><polygon transform="translate(${end[0]} ${end[1]}) rotate(${deg})" points="${tri}" fill="${color}"/>`;
 return svg(240,240,'Flecha curva',flip?`<g transform="translate(240 0) scale(-1 1)">${body}</g>`:body);
};
const CURVES=[['arriba-derecha','M30 212C30 110 70 56 150 56',[150,56],[70,56],false,'up right'],['abajo-derecha','M30 28C30 130 70 184 150 184',[150,184],[70,184],false,'down right'],
 ['arriba-izquierda','M30 212C30 110 70 56 150 56',[150,56],[70,56],true,'up left'],['abajo-izquierda','M30 28C30 130 70 184 150 184',[150,184],[70,184],true,'down left']];
// Hand-drawn arrow: wobbly marker stroke with a two-line head computed from the final direction.
const hand=(d,tip,prev,color)=>{
 const [a,b]=head(tip,angle(prev,tip),46,0.5),line=`M${a}L${tip.join(' ')}L${b}`;
 const g=(w,c)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${line}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
 return svg(240,240,'Flecha dibujada a mano',g(22,INK)+g(12,color));
};
const HANDS=[['1','M28 206C62 176 78 190 108 150S162 92 196 56',[196,56],[162,92],RED,'rojo','red'],['2','M30 40C80 20 150 40 170 110S190 170 200 196',[200,196],[190,170],YELLOW,'amarillo','yellow'],['3','M20 130C70 118 110 142 160 126S190 124 214 120',[214,120],[190,124],'#FFFFFF','blanco','white']];

/* ------------------------------ marks ------------------------------ */
const stroke=(d,w,c)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const marker=(w,h,title,d,color,width=12)=>svg(w,h,title,stroke(d,width+10,INK)+stroke(d,width,color));
const disc=(color,glyph)=>`<circle cx="100" cy="100" r="92" fill="${color}" stroke="${INK}" stroke-width="8"/>${stroke(glyph,32,INK)}${stroke(glyph,20,'#fff')}`;
const MARKS=[
 ['circulo','Círculo marcador','círculo, circle, rodear, destacar, highlight, marcador, marker',()=>marker(240,180,'Círculo marcador','M180 28C126 4 44 20 24 70C8 112 44 156 112 160C178 164 228 132 226 86C224 44 176 18 118 20C96 21 80 26 66 34',RED),240,180],
 ['recuadro','Recuadro marcador','recuadro, rectángulo, box, rectangle, rodear, destacar, highlight, marcador, marker',()=>marker(240,160,'Recuadro marcador','M16 22L224 14L228 142L12 146L15 16',RED),240,160],
 ['subrayado','Subrayado ondulado','subrayado, underline, línea, line, destacar, highlight, marcador, marker',()=>svg(300,64,'Subrayado ondulado',stroke('M8 30C50 14 90 42 130 26S210 12 292 26',20,INK)+stroke('M40 48C110 38 190 52 262 44',18,INK)+stroke('M8 30C50 14 90 42 130 26S210 12 292 26',10,YELLOW)+stroke('M40 48C110 38 190 52 262 44',8,YELLOW)),300,64],
 ['tachado','Tachado','tachado, strikethrough, tachar, cruzar, cross out, línea, line, marcador, marker',()=>svg(300,80,'Tachado',stroke('M8 50L292 26M30 62L270 44',22,INK)+stroke('M8 50L292 26M30 62L270 44',11,RED)),300,80],
 ['check','Marca de verificación','check, verificación, correcto, correct, ok, sí, yes, tick, visto bueno',()=>svg(200,200,'Marca de verificación',disc('#22C55E','M52 104L88 140L150 64')),200,200],
 ['cruz','Cruz de error','cruz, cross, error, incorrecto, wrong, no, equis, x',()=>svg(200,200,'Cruz de error',disc('#EF4444','M62 62L138 138M138 62L62 138')),200,200],
];

/* ------------------------------ speech bubbles ------------------------------ */
const bubble=(title,body)=>svg(340,260,title,body);
const BUBBLES=[
 ['habla','Bocadillo de habla','habla, speech, diálogo, dialogue, hablar, say',()=>bubble('Bocadillo de habla','<path d="M70 30H270Q310 30 310 70V140Q310 180 270 180H140L72 232L92 180H70Q30 180 30 140V70Q30 30 70 30Z" fill="#fff" stroke="'+INK+'" stroke-width="8" stroke-linejoin="round"/>')],
 ['pensamiento','Bocadillo de pensamiento','pensamiento, thought, pensar, think, nube, cloud',()=>{
  const C=[[92,96,46],[152,66,54],[218,84,50],[262,128,40],[200,142,52],[122,140,46],[70,132,32]],T=[[96,206,17],[64,238,10]];
  const all=[...C,...T];return bubble('Bocadillo de pensamiento',all.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r+5}" fill="${INK}"/>`).join('')+all.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join(''));}],
 ['grito','Bocadillo de grito','grito, shout, scream, gritar, exclamación, exclamation, explosión, burst',()=>{
  const pts=Array.from({length:32},(_,i)=>{const a=Math.PI*2*i/32-Math.PI/2,out=i%2===0,j=out?1+((i*7)%5)*0.03:1-((i*5)%4)*0.02;return `${n(170+Math.cos(a)*(out?154:102)*j)} ${n(130+Math.sin(a)*(out?118:78)*j)}`;});
  return bubble('Bocadillo de grito',`<polygon points="${pts.join(' ')}" fill="#FFE14D" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`);}],
 ['susurro','Bocadillo de susurro','susurro, whisper, bajito, quiet, discreto, punteado, dashed',()=>bubble('Bocadillo de susurro','<path d="M70 30H270Q310 30 310 70V140Q310 180 270 180H140L72 232L92 180H70Q30 180 30 140V70Q30 30 70 30Z" fill="#fff" stroke="'+INK+'" stroke-width="7" stroke-dasharray="16 11" stroke-linecap="round" stroke-linejoin="round"/>')],
 ['cuadro','Cuadro de texto','cuadro, caja, box, narrador, narrator, caption, nota, note, recuadro',()=>bubble('Cuadro de texto',`<rect x="38" y="62" width="272" height="132" rx="6" fill="${INK}"/><rect x="26" y="50" width="272" height="132" rx="6" fill="#FFF1A8" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`)],
];

/* ------------------------------ call-to-action badges ------------------------------ */
// Arial Black capital widths in em, used to give <text> an explicit textLength so any fallback font still fits the pill.
const CAPS={A:.78,B:.78,C:.78,D:.78,E:.72,F:.67,G:.83,H:.83,I:.39,J:.61,K:.83,L:.67,M:.94,N:.83,O:.83,P:.72,Q:.83,R:.78,S:.72,T:.72,U:.78,V:.78,W:1,X:.78,Y:.78,Z:.72,' ':.33};
const textWidth=(t,size)=>[...t.normalize('NFD').replace(/[̀-ͯ]/g,'')].reduce((w,c)=>w+(CAPS[c.toUpperCase()]??.68),0)*size;
const ICONS={
 campana:c=>`<path d="M-15 10C-15-6-10-17 0-19C10-17 15-6 15 10L19 14H-19Z" fill="${c}"/><circle cx="0" cy="19" r="5" fill="${c}"/>`,
 corazon:c=>`<path d="M0 17C-24-1-20-19-9-19C-4-19 0-15 0-12C0-15 4-19 9-19C20-19 24-1 0 17Z" fill="${c}"/>`,
 comentario:c=>`<path d="M-20-16H20Q24-16 24-12V8Q24 12 20 12H-2L-14 22V12H-20Q-24 12-24 8V-12Q-24-16-20-16Z" fill="${c}"/>`,
 compartir:c=>`<g fill="${c}" stroke="${c}" stroke-width="4" stroke-linecap="round"><circle cx="-14" cy="0" r="7" stroke="none"/><circle cx="14" cy="-14" r="7" stroke="none"/><circle cx="14" cy="14" r="7" stroke="none"/><path d="M-14 0L14-14M-14 0L14 14" fill="none"/></g>`,
 persona:c=>`<circle cx="0" cy="-9" r="10" fill="${c}"/><path d="M-19 20C-19 6-10 2 0 2C10 2 19 6 19 20Z" fill="${c}"/>`,
 directo:c=>`<circle cx="0" cy="0" r="9" fill="${c}"/><circle cx="0" cy="0" r="18" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="6 5"/>`,
 play:c=>`<path d="M-11-17L19 0L-11 17Z" fill="${c}"/>`,
 avance:c=>`<path d="M-20-15L-2 0L-20 15ZM0-15L18 0L0 15Z" fill="${c}"/>`,
 estrella:c=>`<polygon points="${starPoints(0,0,21,9.5)}" fill="${c}"/>`,
 porcentaje:c=>`<circle cx="-10" cy="-10" r="6" fill="none" stroke="${c}" stroke-width="5"/><circle cx="10" cy="10" r="6" fill="none" stroke="${c}" stroke-width="5"/><path d="M12-18L-12 18" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
 regalo:c=>`<rect x="-18" y="-4" width="36" height="22" rx="2" fill="${c}"/><rect x="-21" y="-12" width="42" height="10" rx="2" fill="${c}"/><path d="M0-12C-10-26-22-18-14-12M0-12C10-26 22-18 14-12" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`,
 aviso:c=>`<path d="M0-20L21 16H-21Z" fill="${c}" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>`,
 bombilla:c=>`<circle cx="0" cy="-5" r="13" fill="${c}"/><rect x="-7" y="8" width="14" height="5" rx="2" fill="${c}"/><rect x="-5" y="15" width="10" height="5" rx="2" fill="${c}"/>`,
};
function starPoints(cx,cy,R,r,rot=-Math.PI/2){return Array.from({length:10},(_,i)=>{const a=rot+Math.PI*i/5,d=i%2?r:R;return `${n(cx+Math.cos(a)*d)} ${n(cy+Math.sin(a)*d)}`;}).join(' ');}
const pill=(text,bg,ink,icon,extra='')=>{
 const H=104,size=46,pad=30,iw=icon?70:0,tw=textWidth(text,size),w=Math.ceil(pad*2+iw+tw);
 const glyph=icon?`<g transform="translate(${pad+30} ${H/2})">${ICONS[icon](ink)}${icon==='aviso'?`<rect x="-2.5" y="-6" width="5" height="12" rx="2" fill="${bg}"/><circle cx="0" cy="11" r="3" fill="${bg}"/>`:''}</g>`:'';
 const body=`<rect x="5" y="5" width="${w-10}" height="${H-10}" rx="${(H-10)/2}" fill="${bg}" stroke="${INK}" stroke-width="8"/><rect x="26" y="12" width="${w-52}" height="${(H-10)*0.28}" rx="${(H-10)*0.14}" fill="#fff" opacity=".2"/>${glyph}`
  +`<text x="${pad+iw}" y="${H/2+16}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${ink}" textLength="${Math.round(tw)}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>${extra}`;
 return [svg(w,H,text,body),w,H];
};
const BADGES=[
 ['suscribete','SUSCRÍBETE','#E62117','#fff','campana','suscribirse, subscribe, suscripción, canal, channel, campana, bell'],
 ['me-gusta','ME GUSTA','#FF3B6B','#fff','corazon','like, me gusta, corazón, heart, reacción, reaction'],
 ['comenta','COMENTA','#2FA8FF','#fff','comentario','comentar, comment, comentarios, comments, opinión, opinion'],
 ['comparte','COMPARTE','#22C55E','#fff','compartir','compartir, share, difundir, enviar, send'],
 ['sigueme','SÍGUEME','#A855F7','#fff','persona','seguir, follow, sígueme, redes sociales, social media, perfil, profile'],
 ['en-directo','EN DIRECTO','#E11D2E','#fff','directo','directo, live, streaming, retransmisión, broadcast, en vivo'],
 ['nuevo-video','NUEVO VÍDEO','#FFD60A',INK,'play','nuevo, new, vídeo, video, estreno, premiere, novedad'],
 ['parte-2','PARTE 2',INK,YELLOW,'avance','parte, part, continuará, to be continued, serie, series, segunda parte, sequel'],
 ['top-10','TOP 10','#FFC400',INK,'estrella','top, ranking, lista, list, mejores, best, clasificación'],
 ['oferta','OFERTA','#E11D2E',YELLOW,'porcentaje','oferta, sale, descuento, discount, rebajas, promoción, promotion'],
 ['sorteo','SORTEO','#EC4899','#fff','regalo','sorteo, giveaway, regalo, gift, concurso, contest, premio, prize'],
 ['importante','IMPORTANTE','#FF8A00',INK,'aviso','importante, important, atención, warning, aviso, alerta, alert'],
 ['dato-curioso','DATO CURIOSO','#14B8A6',INK,'bombilla','dato curioso, fun fact, curiosidad, trivia, sabías que, did you know, idea'],
];

/* ------------------------------ numbers, ratings, progress, lower thirds ------------------------------ */
const numberBadge=k=>{const size=k>=10?104:132;return svg(200,200,`Número ${k}`,`<circle cx="100" cy="100" r="92" fill="${YELLOW}" stroke="${INK}" stroke-width="10"/><path d="M34 70A72 72 0 0 1 100 28" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/><text x="100" y="${n(100+size*0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${INK}">${k}</text>`);};
const stars=k=>svg(440,92,`Valoración ${k} de 5`,Array.from({length:5},(_,i)=>`<polygon points="${starPoints(46+i*87,48,38,17)}" fill="${i<k?'#FFC400':'#3B4252'}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`).join(''));
const progress=p=>{const fw=p?60+560*p/100:0;return svg(640,80,`Progreso ${p} %`,`<rect x="4" y="4" width="632" height="72" rx="36" fill="#1B1F2A" stroke="${INK}" stroke-width="8"/>${fw?`<rect x="10" y="10" width="${n(fw)}" height="60" rx="30" fill="url(#fill)"/><rect x="26" y="15" width="${n(Math.max(fw-32,0))}" height="14" rx="7" fill="#fff" opacity=".25"/>`:''}`,'<linearGradient id="fill" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#5CF2C2"/><stop offset="1" stop-color="#2DB8FF"/></linearGradient>');};
const NAME='Nombre Apellido',ROLE='Cargo o descripción';
const txt=(x,y,size,fill,t,extra='')=>`<text x="${x}" y="${y}" font-family="${FONT2}" font-size="${size}" font-weight="700" fill="${fill}"${extra}>${esc(t)}</text>`;
const SHADOW=' stroke="#000" stroke-opacity=".55" stroke-width="6" paint-order="stroke" stroke-linejoin="round"';
const THIRDS=[
 ['neon','Barra neón','barra neón, neon bar, oscuro, dark',()=>svg(1920,1080,'Tercio inferior neón',`<rect x="120" y="800" width="900" height="152" rx="14" fill="#0B1020" fill-opacity=".8"/><rect x="120" y="800" width="10" height="152" fill="${MINT}"/><rect x="120" y="944" width="900" height="6" fill="#5CE1FF"/>${txt(166,874,58,'#fff',NAME)}${txt(166,922,34,MINT,ROLE)}`)],
 ['caja','Caja degradada','caja degradada, gradient box, violeta, violet, cian, cyan',()=>svg(1920,1080,'Tercio inferior caja degradada',`<rect x="120" y="792" width="880" height="160" rx="22" fill="url(#g)"/>${txt(168,868,60,'#fff',NAME)}${txt(168,918,34,'#fff',ROLE,' fill-opacity=".88"')}`,'<linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#06B6D4"/></linearGradient>')],
 ['minimal','Línea minimal','línea minimal, minimal line, sencillo, simple, limpio, clean',()=>svg(1920,1080,'Tercio inferior minimal',`${txt(120,846,62,'#fff',NAME,SHADOW)}<rect x="120" y="864" width="420" height="6" rx="3" fill="${YELLOW}"/>${txt(120,914,36,'#fff',ROLE,SHADOW)}`)],
 ['cinta','Cinta amarilla','cinta, ribbon, amarillo, yellow, noticias, news, informativo',()=>svg(1920,1080,'Tercio inferior cinta',`<polygon points="150,796 1010,796 972,894 112,894" fill="${INK}" transform="translate(10 8)"/><polygon points="150,796 1010,796 972,894 112,894" fill="${YELLOW}"/>${txt(190,860,56,INK,NAME)}<polygon points="112,894 972,894 958,938 98,938" fill="${INK}"/>${txt(170,926,30,'#fff',ROLE)}`)],
 ['doble','Doble caja','doble caja, double box, blanco, white, oscuro, dark, nombre y cargo',()=>svg(1920,1080,'Tercio inferior doble caja',`<rect x="120" y="800" width="700" height="84" fill="#fff" stroke="${INK}" stroke-width="4"/>${txt(148,860,48,INK,NAME)}<rect x="120" y="884" width="560" height="60" fill="${INK}"/>${txt(148,926,32,'#fff',ROLE)}`)],
];

/* ------------------------------ catalogue ------------------------------ */
const STICKER=CATEGORIES.sticker;
const item=(id,title,tags,description,svgText,width,height,category=STICKER)=>({id,title,tags,description:`${description} Vector SVG que se escala sin perder calidad. Original y de dominio público (CC0).`,svg:svgText,width,height,category});
const sizeOf=text=>{const m=/viewBox="0 0 (\d+) (\d+)"/.exec(text);return [Number(m[1]),Number(m[2])];};

/** Every SVG sticker as pure data, without touching the disk. */
export function buildSvgs(){
 const out=[];
 for(const [cn,{hex,en}] of Object.entries(COLORS))for(const [dir,deg,dirEn] of DIRS)
  out.push(item(`flecha-${dir}-${cn}`,`Flecha ${dir.replace('-',' ')} ${cn}`,['sticker','icono','flecha','arrow','señalar','pointer','dirección','direction',dir.replace('-',' '),dirEn,cn,en],`Flecha ${cn} apuntando ${dir.replace('-',' ')}, con contorno oscuro para que se lea sobre cualquier fondo.`,arrow(deg,hex),240,240));
 for(const [cn,{hex,en}] of Object.entries(COLORS))for(const [dir,d,end,prev,flip,dirEn] of CURVES)
  out.push(item(`flecha-curva-${dir}-${cn}`,`Flecha curva ${dir.replace('-',' ')} ${cn}`,['sticker','icono','flecha','arrow','flecha curva','curved arrow','curva','curve','señalar','pointer',dir.replace('-',' '),dirEn,cn,en],`Flecha curva ${cn} que sube o baja hacia ${dir.endsWith('derecha')?'la derecha':'la izquierda'}.`,curved(d,end,prev,hex,flip),240,240));
 for(const [k,d,tip,prev,color,cn,en] of HANDS)
  out.push(item(`flecha-mano-${k}`,`Flecha a mano ${k}`,['sticker','flecha','arrow','a mano','hand drawn','dibujada','marcador','marker','garabato','doodle','señalar','pointer',cn,en],`Flecha ${cn} dibujada a mano con trazo de rotulador.`,hand(d,tip,prev,color),240,240));
 for(const [id,title,words,make,w,h] of MARKS)
  out.push(item(`marca-${id}`,title,['sticker','icono','marca','mark',...words.split(', ')],`${title} para destacar algo del vídeo.`,make(),w,h));
 for(const [id,title,words,make] of BUBBLES)
  out.push(item(`bocadillo-${id}`,title,['sticker','bocadillo','speech bubble','globo','cómic','comic','viñeta',...words.split(', ')],`${title} vacío: añade tu propio texto encima.`,make(),340,260));
 for(const [id,text,bg,ink,icon,words] of BADGES){const [s,w,h]=pill(text,bg,ink,icon);
  out.push(item(`insignia-${id}`,`Insignia ${text[0]+text.slice(1).toLowerCase()}`,['sticker','insignia','badge','etiqueta','label','llamada a la acción','call to action','cta','creadores','creators',...words.split(', ')],`Insignia con el texto «${text}» para pedir una acción a tu audiencia.`,s,w,h));}
 for(let k=1;k<=10;k++)out.push(item(`numero-${k}`,`Número ${k}`,['sticker','icono','número','number',String(k),'cifra','digit','ranking','lista','list','paso','step'],`Número ${k} dentro de un círculo amarillo, ideal para rankings y listas.`,numberBadge(k),200,200));
 for(let k=0;k<=5;k++)out.push(item(`estrellas-${k}`,`Valoración ${k} de 5 estrellas`,['sticker','icono','estrellas','stars','valoración','rating','reseña','review','puntuación','score',`${k} estrellas`,`${k} stars`],`Valoración de ${k} de 5 estrellas.`,stars(k),440,92));
 for(const p of [0,25,50,75,100])out.push(item(`barra-progreso-${p}`,`Barra de progreso ${p} %`,['sticker','barra de progreso','progress bar','progreso','progress','carga','loading','porcentaje','percent',`${p}%`],`Barra de progreso al ${p} % en menta y azul.`,progress(p),640,80));
 for(const [id,title,words,make] of THIRDS)
  out.push(item(`tercio-inferior-${id}`,`Tercio inferior ${title.toLowerCase()}`,['tercio inferior','lower third','plantilla','template','nombre','name','rótulo','titular','presentador','presenter','texto de ejemplo','sample text',...words.split(', ')],`Tercio inferior con texto de ejemplo («${NAME}» y «${ROLE}»). Se usa a pantalla completa (1920×1080) y el texto se sustituye por el tuyo.`,make(),1920,1080,CATEGORIES.template));
 return out;
}

export async function generate({dir,force=false,log=()=>{},only}={}){
 const all=buildSvgs(),list=Array.isArray(only)&&only.length?all.filter(s=>only.includes(s.id)):all;
 await fs.mkdir(dir,{recursive:true});
 const items=[],failed=[];let made=0;
 for(const s of list){
  const file=path.join(dir,`${s.id}.svg`);
  try{
   const there=!force&&await fs.stat(file).then(st=>st.size>0,()=>false);
   if(!there){const buffer=Buffer.from(s.svg,'utf8');wellFormed(s.svg);checkSvg(buffer);await fs.writeFile(file,buffer);made++;}
   const [width,height]=sizeOf(s.svg);
   items.push({id:s.id,file,title:s.title,kind:'image',category:s.category,tags:s.tags,description:s.description,width,height});
  }catch(e){failed.push({id:s.id,error:String(e.message||e).slice(0,300)});log(`Error en ${s.id}: ${e.message||e}`);}
 }
 if(made)log(`SVG generados: ${made}`);
 return {made,total:list.length,failed,items};
}
