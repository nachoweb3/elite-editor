// Sources without a public API we use: Elite never scrapes or automates them. The panel
// opens their site and imports files YOU downloaded, recording licence and provenance.
const manual=o=>({
 id:o.id,name:o.name,tier:o.tier||'secondary',mode:'manual',homepage:o.homepage||'',
 kinds:o.kinds,formats:o.formats,auth:{type:'none'},attribution:o.attribution||'per-item',
 license:{summary:o.licenseSummary},
 restrictions:o.restrictions,
 limits:{note:'Sin automatización: descarga desde su sitio y usa «Importar».'},
 manual:{importHint:o.importHint,licenseHint:o.licenseHint,url:o.homepage||'',defaultLicense:o.defaultLicense||'Unknown'},
 async search(){return {items:[],total:0};},
});

export const kenney=manual({id:'kenney',name:'Kenney',tier:'primary',homepage:'https://kenney.nl/assets',kinds:['image','audio'],formats:['png','svg','ogg','wav'],attribution:'none',defaultLicense:'CC0-1.0',
 licenseSummary:'CC0 1.0: uso libre, también comercial, sin atribución.',
 restrictions:['No hay API pública: descarga los packs desde su sitio e impórtalos aquí.','Los sonidos de interfaz y los jingles de Kenney ya vienen incluidos en Elite Editor.'],
 importHint:'Descarga un pack en kenney.nl, extrae los archivos que quieras y arrástralos al formulario de importación.',licenseHint:'Todos los recursos de Kenney son CC0.'});
export const iconstash=manual({id:'iconstash',name:'IconStash',tier:'primary',homepage:'',kinds:['image'],formats:['svg','png'],defaultLicense:'Unknown',
 licenseSummary:'La licencia depende de cada icono o pack.',
 restrictions:['Sin API que Elite utilice: importación manual.','Comprueba la licencia y la atribución exigida de cada icono antes de publicar.'],
 importHint:'Descarga los iconos desde su sitio e impórtalos indicando su licencia.',licenseHint:'Si no estás seguro de la licencia, deja «Licencia no verificada».'});
export const mixkit=manual({id:'mixkit',name:'Mixkit',homepage:'https://mixkit.co',kinds:['video','audio','image'],formats:['mp4','mp3','wav','jpg'],attribution:'none',defaultLicense:'Mixkit',
 licenseSummary:'Licencia de Mixkit para sus recursos gratuitos.',
 restrictions:['Revisa en cada recurso si es «Mixkit License» o «Restricted License».','No redistribuyas los archivos como banco de recursos.'],
 importHint:'Descarga el recurso desde mixkit.co e impórtalo con la licencia Mixkit.',licenseHint:'Mixkit License: gratuita, también comercial; los recursos marcados como restringidos tienen condiciones propias.'});
export const svgrepo=manual({id:'svgrepo',name:'SVG Repo',homepage:'https://www.svgrepo.com',kinds:['image'],formats:['svg'],defaultLicense:'Unknown',
 licenseSummary:'Cada SVG muestra su propia licencia (CC0, MIT, Apache, CC BY…).',
 restrictions:['La licencia varía de un icono a otro: cópiala de su página al importar.','Si exige atribución, Elite la guarda en la procedencia.'],
 importHint:'Descarga el SVG e indica la licencia que figura en su página.',licenseHint:'Ejemplos habituales: CC0, MIT, Apache 2.0, CC BY.'});
export const memevault=manual({id:'memevault',name:'Meme Vault',homepage:'',kinds:['image','video'],formats:['jpg','png','gif','mp4'],attribution:'required',defaultLicense:'Third-party',
 licenseSummary:'Los memes suelen incluir material con derechos de terceros.',
 restrictions:['Úsalos bajo tu responsabilidad (p. ej. cita o parodia según tu legislación).','Elite no los redistribuye ni los incluye en su repositorio.'],
 importHint:'Importa memes que hayas descargado y que tengas derecho a usar.',licenseHint:'Se guardan como «Derechos de terceros».'});
export const memescreens=manual({id:'memescreens',name:'MemeScreens',homepage:'',kinds:['image','video'],formats:['jpg','png','gif','mp4'],attribution:'required',defaultLicense:'Third-party',
 licenseSummary:'Capturas y plantillas de origen variado; suelen tener derechos de terceros.',
 restrictions:['Úsalas bajo tu responsabilidad.','No se redistribuyen ni se incluyen en el repositorio.'],
 importHint:'Importa las capturas que hayas descargado y tengas derecho a usar.',licenseHint:'Se guardan como «Derechos de terceros».'});
export const usesounds=manual({id:'usesounds',name:'UseSounds',homepage:'',kinds:['audio'],formats:['mp3','wav'],defaultLicense:'Unknown',
 licenseSummary:'Comprueba las condiciones de cada sonido.',
 restrictions:['Sin API utilizada: importación manual.','Verifica uso comercial y atribución antes de publicar.'],
 importHint:'Importa los sonidos que hayas descargado indicando su licencia.',licenseHint:'Si no figura, deja «Licencia no verificada».'});
export const opengameart=manual({id:'opengameart',name:'OpenGameArt',homepage:'https://opengameart.org',kinds:['image','audio'],formats:['png','ogg','wav','mp3'],defaultLicense:'Unknown',
 licenseSummary:'Mezcla de CC0, CC BY, CC BY-SA, OGA-BY y GPL según el recurso.',
 restrictions:['Cada recurso indica su licencia: respeta la atribución, el copyleft (SA/GPL) y NC si aparece.','No hay API que Elite utilice: importación manual.'],
 importHint:'Descarga el recurso e importa los archivos con la licencia de su página.',licenseHint:'Elige CC0, CC BY, CC BY-SA, OGA-BY o GPL según corresponda.'});
export const lottiefiles=manual({id:'lottiefiles',name:'LottieFiles',homepage:'https://lottiefiles.com',kinds:['lottie'],formats:['json'],defaultLicense:'Lottie-Simple',
 licenseSummary:'Lottie Simple License u otra, según la animación.',
 restrictions:['Revisa la licencia de cada animación en su página.','Elite guarda los .json de Lottie en la biblioteca, pero el editor todavía no los reproduce como capa.'],
 importHint:'Descarga el JSON de Lottie e impórtalo con su licencia.',licenseHint:'Lottie Simple License permite uso comercial con condiciones; compruébalas.'});

export const MANUAL_CONNECTORS=[kenney,iconstash,mixkit,svgrepo,memevault,memescreens,usesounds,opengameart,lottiefiles];
