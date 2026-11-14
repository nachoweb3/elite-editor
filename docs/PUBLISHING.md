# Publicar el editor y la landing

El código vive en `nachoweb3/elite-editor`. La presentación pública vive en
`nachoweb3/elite-editor-landing`, publicada con GitHub Pages desde `main`.
Subir el primero no actualiza automáticamente el segundo.

Después de las pruebas y del commit del editor:

```powershell
node scripts/export-landing.mjs ../Elite-Editor-landing
node scripts/build-browser-editor.mjs ../Elite-Editor-landing/editor
```

El exportador reutiliza la página y los estilos del editor y genera HTML estático.
Los botones de inicio llevan a `./editor/#/projects`: el editor real se ejecuta
en el navegador, con navegación hash compatible con Pages y proyectos guardados
en IndexedDB/OPFS. Se reutilizan las pantallas, timeline, efectos y exportación
de OpenCut; una pequeña capa adapta los enlaces de Next al sitio estático.
Pages no ejecuta Node ni FFmpeg. Las herramientas que requieren el backend se
identifican en la interfaz; nunca se intenta contactar con localhost desde Pages.
Los sonidos incluidos se copian solo desde los packs CC0 del código, sin incluir
la biblioteca privada, claves, proyectos ni archivos importados del autor.
La maqueta del hero sigue siendo ilustrativa.

Revisar y subir los cambios del checkout de landing; esperar al despliegue Pages
y comprobar la etiqueta `elite-editor-revision` del HTML publicado. Los paquetes
standalone anteriores se identifican como versiones anteriores hasta reconstruirlos
y verificarlos; publicar el código no los actualiza.

## Estado de esta integración

- Recursos: búsqueda, importación, licencias, atribución y herramientas de creadores.
- Shorts, volumen y checklist conectados al backend; pruebas HTTP con proyecto aislado.
- Forge: LUT, SVG y fondos/overlays presentes. Sonidos y pack de creadores pendientes;
  sus botones se desactivan cuando el backend indica que no están disponibles.
- Belleza en directo: acabado GPU en una zona oval manual. No sigue el rostro ni
  cambia su geometría en directo. El procesamiento previo mantiene sus controles propios.
- La compilación del editor web se comprueba en CI. Validar también desde la URL
  pública: crear proyecto, añadir elementos, recargar y exportar una prueba corta.
