# Publicar el editor y la landing

El código vive en `nachoweb3/elite-editor`. La presentación pública vive en
`nachoweb3/elite-editor-landing`, publicada con GitHub Pages desde `main`.
Subir el primero no actualiza automáticamente el segundo.

Después de las pruebas y del commit del editor:

```powershell
node scripts/export-landing.mjs ../Elite-Editor-landing
```

El exportador reutiliza la página y los estilos del editor y genera HTML estático.
Los enlaces a proyectos llevan a la sección de acceso, que explica el arranque
local y enlaza a `http://127.0.0.1:5181/projects`. Pages no ejecuta Node, FFmpeg ni
los modelos locales. La maqueta del hero es ilustrativa, no una sesión del editor.

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
- Validación DOM simulada y FFmpeg real; no equivale a verificar reproducción y
  exportación del editor completo en un navegador.
