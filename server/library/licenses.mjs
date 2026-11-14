// Normalised licence records. Every library item carries one of these, so the editor
// can tell at a glance whether an asset needs credit, allows commercial use or edits.
const CC='https://creativecommons.org/licenses/';
const base={attribution:false,commercial:true,derivatives:true,shareAlike:false,redistribution:true,notes:''};
export const LICENSES={
 'CC0-1.0':{...base,name:'CC0 1.0 (dominio público)',url:'https://creativecommons.org/publicdomain/zero/1.0/'},
 'PDM':{...base,name:'Marca de dominio público',url:'https://creativecommons.org/publicdomain/mark/1.0/'},
 'CC-BY':{...base,name:'CC BY',url:CC+'by/4.0/',attribution:true},
 'CC-BY-SA':{...base,name:'CC BY-SA',url:CC+'by-sa/4.0/',attribution:true,shareAlike:true,notes:'Las obras derivadas deben compartirse con la misma licencia.'},
 'CC-BY-ND':{...base,name:'CC BY-ND',url:CC+'by-nd/4.0/',attribution:true,derivatives:false,notes:'No se permiten obras derivadas: úsalo sin modificar.'},
 'CC-BY-NC':{...base,name:'CC BY-NC',url:CC+'by-nc/4.0/',attribution:true,commercial:false,notes:'Solo uso no comercial.'},
 'CC-BY-NC-SA':{...base,name:'CC BY-NC-SA',url:CC+'by-nc-sa/4.0/',attribution:true,commercial:false,shareAlike:true,notes:'Solo uso no comercial; derivadas con la misma licencia.'},
 'CC-BY-NC-ND':{...base,name:'CC BY-NC-ND',url:CC+'by-nc-nd/4.0/',attribution:true,commercial:false,derivatives:false,notes:'Solo uso no comercial y sin modificaciones.'},
 'OFL-1.1':{...base,name:'SIL Open Font License 1.1',url:'https://openfontlicense.org',notes:'No se puede vender la fuente por sí sola.'},
 'Apache-2.0':{...base,name:'Apache 2.0',url:'https://www.apache.org/licenses/LICENSE-2.0',attribution:true},
 'MIT':{...base,name:'MIT',url:'https://opensource.org/license/mit',attribution:true},
 'Pexels':{...base,name:'Licencia de Pexels',url:'https://www.pexels.com/license/',notes:'Atribución agradecida. No vender copias sin modificar ni insinuar respaldo de las personas que aparecen.',redistribution:false},
 'Pixabay':{...base,name:'Licencia de contenido de Pixabay',url:'https://pixabay.com/service/license-summary/',notes:'Sin atribución obligatoria. No vender copias sin modificar ni redistribuir como banco de imágenes.',redistribution:false},
 'Mixkit':{...base,name:'Licencia de Mixkit',url:'https://mixkit.co/license/',notes:'Revisa en cada recurso si es Mixkit License o Restricted License.',redistribution:false},
 'GIPHY':{...base,name:'Condiciones de GIPHY',url:'https://support.giphy.com/hc/en-us/articles/360020027752-GIPHY-Terms-of-Service',attribution:true,commercial:false,redistribution:false,notes:'Los GIF pertenecen a sus autores. Atribución «Powered by GIPHY». Uso comercial no garantizado: responsabilidad del usuario.'},
 'Lottie-Simple':{...base,name:'Lottie Simple License',url:'https://lottiefiles.com/page/license',notes:'Revisa las condiciones de cada animación en LottieFiles.'},
 'OGA-BY':{...base,name:'OGA-BY 3.0',url:'https://static.opengameart.org/OGA-BY-3.0.txt',attribution:true},
 'GPL':{...base,name:'GPL',url:'https://www.gnu.org/licenses/gpl-3.0.html',attribution:true,shareAlike:true,notes:'Copyleft: revisa las obligaciones antes de publicar.'},
 'Third-party':{...base,name:'Derechos de terceros',url:'',attribution:true,commercial:false,redistribution:false,notes:'Contenido con copyright de terceros (memes de películas, series…). Uso bajo tu responsabilidad, p. ej. cita o parodia según tu legislación.'},
 'Personal':{...base,name:'Propio',url:'',notes:'Recurso propio del usuario.'},
 'Unknown':{...base,name:'Licencia no verificada',url:'',attribution:true,commercial:false,redistribution:false,notes:'Verifica la licencia antes de publicar.'},
};

/** Maps provider licence codes (Openverse, Commons, Freesound URLs…) to our ids. */
export function normalizeLicense(raw,{version='',url=''}={}){
 const text=`${raw||''} ${url||''}`.toLowerCase();
 if(/publicdomain\/zero|\bcc0\b|cc-zero/.test(text))return 'CC0-1.0';
 if(/publicdomain\/mark|\bpdm\b|public domain/.test(text))return 'PDM';
 const cc=/(?:licenses\/|cc[ -]?|^\s*)(by(?:[-_ ](?:nc|sa|nd))*)/.exec(text.replace(/attribution/g,'by'));
 if(cc&&/by/.test(cc[1])){const parts=cc[1].split(/[-_ ]/).filter(Boolean);const id='CC-'+['BY',...['NC','SA','ND'].filter(p=>parts.includes(p.toLowerCase()))].join('-');return LICENSES[id]?id:'CC-BY';}
 if(/\bofl\b|open font/.test(text))return 'OFL-1.1';
 if(/apache/.test(text))return 'Apache-2.0';
 if(/\bmit\b/.test(text))return 'MIT';
 if(/oga-by/.test(text))return 'OGA-BY';
 if(/\bgpl\b/.test(text))return 'GPL';
 return 'Unknown';
}

export function licenseRecord(id,extra={}){
 const known=LICENSES[id]||LICENSES.Unknown;
 return {id:LICENSES[id]?id:'Unknown',...known,...extra};
}

/** Human attribution line in Spanish, e.g. «"Título" de Autor, CC BY 4.0, vía Openverse». */
export function attributionLine({title,author,license,connectorName,sourceUrl}){
 const parts=[title?`«${title}»`:'Recurso',author?`de ${author}`:'',license?.name||'',connectorName?`vía ${connectorName}`:''].filter(Boolean);
 return parts.join(', ')+(sourceUrl?` (${sourceUrl})`:'');
}
