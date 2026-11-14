// Bilingual search. Most media APIs index English while creators search in Spanish.
// Each line is one concept: `español, español / english, english`.
// expandQuery() keeps the user's words, adds the translation and returns synonym
// groups so local search can require every word (in either language).
const TABLE=`explosión/explosion,blast
fuego,llamas/fire,flames
humo/smoke
agua/water
lluvia,llovizna/rain,drizzle
nieve/snow
mar,océano/sea,ocean
playa/beach
montaña/mountain
bosque/forest
ciudad/city
noche/night
día/day
cielo/sky
nubes,nube/clouds,cloud
sol/sun
luna/moon
estrellas,estrella/stars,star
espacio/space
galaxia/galaxy
perro/dog
gato/cat
pájaro,ave/bird
caballo/horse
pez/fish
animal,animales/animal,animals
coche,auto/car
tren/train
avión/airplane,plane
calle/street
carretera/road
edificio/building
persona,gente/person,people,crowd
niño/child,kid
mujer/woman
hombre/man
manos,mano/hands,hand
ordenador,computadora/computer
móvil,teléfono/phone,smartphone
tecnología/technology
código/code
robot/robot
dinero/money
negocio,empresa/business
oficina/office
reunión/meeting
trabajo/work
comida/food
café/coffee
cocina/kitchen,cooking
fiesta/party
música,canción/music,song
baile/dance
deporte/sport,sports
fútbol/soccer,football
gimnasio/gym,fitness
correr/running,run
madera/wood
piedra,roca/stone,rock
metal/metal
ladrillo/brick
asfalto/asphalt
tela/fabric
césped,hierba/grass
papel/paper
mármol/marble
hormigón,cemento/concrete
arena/sand
hielo/ice
óxido/rust
golpe/hit,punch
impacto/impact
silbido/whoosh,swoosh
transición/transition
risa,risas/laugh,laughter
aplausos,aplauso/applause,clapping
grito/scream,shout
campana/bell
timbre/doorbell
alarma/alarm
sirena/siren
pasos/footsteps
puerta/door
viento/wind
trueno/thunder
tormenta/storm
clic/click
botón/button
notificación/notification
éxito,victoria/success,victory
fallo/fail,failure
moneda/coin
ambiente/ambience,ambient
fondo/background
textura/texture
patrón/pattern
degradado/gradient
abstracto/abstract
neón/neon
brillo/glow,shine
luz/light
sombra/shadow
polvo/dust
grano/grain
icono/icon
flecha/arrow
corazón/heart
logo/logo
bandera/flag
mapa/map
meme/meme
gracioso,divertido/funny
sorpresa/surprise
triste/sad
feliz,contento/happy
enfadado/angry
celebración/celebration
confeti/confetti
aburrido/bored
fuente,tipografía/font,typeface
manuscrita/handwriting,script
negrita/bold
interior/indoor
exterior/outdoor
atardecer/sunset
amanecer/sunrise
estudio/studio
vídeo/video
imagen,foto,fotografía/image,photo,picture
sonido,audio/sound,audio
efecto/effect
bocina/horn
retro,vintage/retro,vintage
cine,película/cinema,film,movie
look,estilo/look,style`;

export const plainText=v=>String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const INDEX=new Map();
for(const line of TABLE.split('\n')){
 const [es,en]=line.split('/').map(side=>side.split(',').map(s=>plainText(s.trim())).filter(Boolean));
 const group={es,en};
 for(const word of [...es,...en])if(!INDEX.has(word))INDEX.set(word,group);
}
const singular=word=>word.length>3?word.replace(/(es|s)$/,''):word;
const STOPWORDS=new Set('de del la las el los un una unos unas en con para por y o a al que se su sus lo mi tu'.split(' '));

/** Returns the English form for APIs, synonym groups for local matching, and whether we translated. */
export function expandQuery(query){
 const words=plainText(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0,12);
 const groups=[],english=[];let translated=false;
 for(const word of words){
  const key=INDEX.has(word)?word:INDEX.has(singular(word))?singular(word):null;
  // Spanish function words only add noise to an English API query.
  // They are not required terms either: «lluvia en el bosque» must still match «bosque con lluvia».
  if(!key&&STOPWORDS.has(word))continue;
  if(!key){groups.push([word]);english.push(word);continue;}
  const group=INDEX.get(key);
  groups.push([...new Set([word,key,...group.es,...group.en])]);
  if(group.es.includes(key)&&!group.en.includes(key)){english.push(group.en[0]);translated=true;}
  else english.push(word);
 }
 return {original:String(query).trim(),english:english.join(' '),translated,groups,terms:[...new Set(groups.flat())]};
}

/** Spanish labels for English tags, used when classifying downloads. */
export function spanishTags(tags){
 const out=new Set();
 for(const tag of tags){const group=INDEX.get(plainText(tag));if(group)for(const es of group.es)out.add(es);}
 return [...out];
}
