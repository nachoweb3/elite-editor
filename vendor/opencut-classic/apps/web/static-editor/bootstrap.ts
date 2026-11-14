import('./main').catch((error:unknown)=>{
 const root=document.getElementById('root');
 if(root){root.textContent='No se pudo cargar Elite Editor. Recarga la página y prueba Chrome o Edge actualizado. '+(error instanceof Error?error.message:'');root.style.cssText='padding:2rem;color:white;background:#03040b;min-height:100vh';}
});
