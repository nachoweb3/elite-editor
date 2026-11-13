import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {load,save,validateTimeline} from './core.mjs';
const fail=message=>{throw new Error(message);};
const digest=text=>createHash('sha256').update(text).digest('hex');
function literal(n){
 if(ts.isParenthesizedExpression(n))return literal(n.expression);
 if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return ts.isNumericLiteral(n)?Number(n.text):n.text;
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken&&ts.isNumericLiteral(n.operand))return -Number(n.operand.text);
 return fail('El proyecto contiene una expresión dinámica. Expórtalo desde el editor visual.');
}
function node(n){
 if(ts.isParenthesizedExpression(n))return node(n.expression);
 if(!ts.isJsxElement(n)&&!ts.isJsxSelfClosingElement(n))return fail('Se necesita una composición JSX estática para sincronizar.');
 const opening=ts.isJsxElement(n)?n.openingElement:n,props={};
 if(!ts.isIdentifier(opening.tagName))return fail('Componente personalizado no compatible con sincronización.');
 for(const a of opening.attributes.properties){if(!ts.isJsxAttribute(a))return fail('Propiedades dinámicas no compatibles.');const key=a.name.text;if(Object.hasOwn(props,key))return fail('Propiedad duplicada: '+key);props[key]=!a.initializer?true:ts.isStringLiteral(a.initializer)?a.initializer.text:ts.isJsxExpression(a.initializer)&&a.initializer.expression?literal(a.initializer.expression):fail('Propiedad no compatible');}
 const children=[];if(ts.isJsxElement(n))for(const c of n.children){if(ts.isJsxText(c)){if(c.text.trim())children.push(c.text.trim());}else if(ts.isJsxExpression(c)){if(c.expression)children.push(literal(c.expression));}else children.push(node(c));}
 return {tag:opening.tagName.text,props,children};
}
export function parseComposition(text){
 if(text.length>4_000_000)return fail('Proyecto demasiado grande para sincronizar');
 const file=ts.createSourceFile('index.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(file.parseDiagnostics.length)return fail('El proyecto contiene errores de sintaxis');
 if(file.statements.length!==1)return fail('Solo se sincroniza la composición estática generada por el estudio.');
 const fn=file.statements[0];if(!ts.isFunctionDeclaration(fn)||!fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)||fn.body?.statements.length!==1||!ts.isReturnStatement(fn.body.statements[0]))return fail('Estructura de proyecto no compatible');
 const tree=node(fn.body.statements[0].expression);if(tree.tag!=='stage'||tree.children.length!==1||tree.children[0].tag!=='scene')return fail('Solo se admite una escena por montaje');
 return tree;
}
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function sameProps(a,b,allowed=[]){return stable(Object.fromEntries(Object.entries(a).filter(([k])=>!allowed.includes(k))))===stable(Object.fromEntries(Object.entries(b).filter(([k])=>!allowed.includes(k))));}
function sourceAt(time,clips){let offset=0;for(const c of clips){const length=c.end-c.start;if(time>=offset-1e-6&&time<offset+length)return c.start+time-offset;offset+=length;}return null;}
export function syncPlan(p,baseline,edited){
 const before=parseComposition(baseline),after=parseComposition(edited),scene=after.children[0],oldScene=before.children[0];
 if(!sameProps(before.props,after.props)||!sameProps(oldScene.props,scene.props))return fail('Se han cambiado la escena o el encuadre. Conserva esos cambios en el editor visual.');
 const originals=new Map(oldScene.children.map(n=>[n.props.id,n])),seen=new Set(),videos=[],captions=[],resources=[];
 const template=oldScene.children.find(n=>n.tag==='video'&&String(n.props.id).startsWith('clip-'));
 for(const n of scene.children){if(!n||typeof n!=='object'||!n.props?.id||seen.has(n.props.id))return fail('Cada elemento necesita un identificador único');seen.add(n.props.id);const id=n.props.id,original=originals.get(id);
  if(n.tag==='video'&&(String(id).startsWith('clip-')||!original)){
   const ref=original||template;if(!ref||!sameProps(ref.props,n.props,['id','name','start','end','sourceIn','sourceOut'])||stable(n.children)!==stable(ref.children))return fail('Un clip tiene efectos, velocidad, fuente o encuadre que no se pueden recuperar.');
   const {start,end,sourceIn,sourceOut}=n.props;if(![start,end,sourceIn,sourceOut].every(Number.isFinite)||Math.abs((end-start)-(sourceOut-sourceIn))>.002)return fail('Los clips deben tener velocidad normal y tiempos explícitos');videos.push(n);
  }else if(original&&n.tag==='text'&&String(id).startsWith('subtitle-')){
   if(!sameProps(original.props,n.props,['name','start','end'])||stable(n.children.filter(c=>typeof c==='object'))!==stable(original.children.filter(c=>typeof c==='object')))return fail('Se ha cambiado el estilo de un subtítulo; ese estilo requiere exportar desde el editor visual.');
   const text=n.children.filter(c=>typeof c==='string').join(' ');if(!text||text.length>5000)return fail('Texto de subtítulo vacío o demasiado largo');captions.push({start:n.props.start,end:n.props.end,text});
  }else{if(!original||stable(original)!==stable(n))return fail('Hay una capa nueva o modificada que el panel aún no admite.');if(String(id).startsWith('resource-'))resources.push(Number(id.slice(9)));}
 }
 if(!seen.has('brand'))return fail('La eliminación de la marca debe hacerse desde el editor visual.');
 videos.sort((a,b)=>a.props.start-b.props.start);let duration=0;
 const clips=videos.map((n,i)=>{if(Math.abs(n.props.start-duration)>.002)return fail('Hay huecos o clips superpuestos. La recuperación admite cortes consecutivos.');duration=n.props.end;return {id:String(i),start:n.props.sourceIn,end:n.props.sourceOut,enabled:true,reason:'Recuperado del editor visual'};});
 validateTimeline(clips,p.media.duration);
 const transcript=[];for(const c of captions){if(![c.start,c.end].every(Number.isFinite)||c.start<0||c.end<=c.start||c.end>duration+.002)return fail('Un subtítulo queda fuera del montaje');const words=c.text.trim().split(/\s+/),step=(c.end-c.start)/words.length;
  for(const [i,word] of words.entries()){const a=c.start+i*step,b=a+step;let offset=0;for(const clip of clips){const length=clip.end-clip.start,lo=Math.max(a,offset),hi=Math.min(b,offset+length);if(hi>lo+.005){const start=clip.start+lo-offset,end=clip.start+hi-offset;transcript.push({start,end,text:word,words:[{start,end,word,estimated:true}]});}offset+=length;}}
 }
 const automatic=structuredClone(p.automatic);if(automatic?.direction){automatic.direction.media=resources.map(i=>{const m=automatic.direction.media[i];if(!m)return fail('No se encuentra un recurso original');const at=sourceAt(m.outputTime,clips);if(at===null)return fail('Un recurso queda fuera del nuevo montaje');return {...m,at};});automatic.direction.events=[];}
 return {clips,transcript,automatic,duration};
}
export async function importDiffusion(id,revision){
 const p=await load(id);if(revision!==p.revision||p.diffusion?.revision!==p.revision)return fail('El panel cambió desde que preparaste el editor. Prepara un proyecto de la revisión actual para evitar sobrescribir cambios.');
 const dir=p.diffusion.dir,file=path.join(dir,'index.tsx'),baseline=await fs.readFile(path.join(dir,'nacho-baseline.tsx'),'utf8').catch(()=>fail('Este proyecto es anterior a la sincronización. Prepara de nuevo el editor visual.'));
 const edited=await fs.readFile(file,'utf8');if(digest(edited)===digest(baseline))return fail('No hay cambios guardados que recuperar. Guarda primero tu edición visual.');const plan=syncPlan(p,baseline,edited);const latest=await load(id);if(latest.revision!==revision||latest.jobs.some(j=>['running','queued'].includes(j.status)))return fail('El proyecto está cambiando. Inténtalo cuando termine.');
 if(digest(await fs.readFile(file,'utf8'))!==digest(edited))return fail('El editor está guardando cambios. Vuelve a sincronizar.');
 latest.history=[...(latest.history||[]),{settings:latest.settings,clips:latest.clips,transcript:latest.transcript,automatic:structuredClone(latest.automatic)}].slice(-20);
 latest.originalTranscript??=structuredClone(latest.transcript);latest.clips=plan.clips;latest.transcript=plan.transcript;if(plan.automatic)latest.automatic=plan.automatic;
 latest.settings={...latest.settings,transition:0};latest.reviewed=true;latest.artifacts={};latest.revision++;latest.diffusion={...latest.diffusion,importedAt:new Date().toISOString(),importedHash:digest(edited)};latest.lastInstruction={prompt:'Recuperar edición visual',explanation:'Cortes y textos recuperados. Los tiempos por palabra se han estimado dentro de cada subtítulo. Puedes deshacer la importación.'};await save(latest);return latest;
}
