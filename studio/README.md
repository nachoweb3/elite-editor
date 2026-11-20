# Elite Editor Studio para Windows

Monta y exporta automáticamente, o revisa los cortes en la misma línea de tiempo. El estudio guarda los proyectos en este equipo y usa una cuenta local.

## Instalar

1. Instala [Node.js 24 o posterior](https://nodejs.org/) y [FFmpeg con ffprobe](https://ffmpeg.org/download.html). Abre una terminal nueva para que reconozca ambos comandos.
2. Descomprime el ZIP y ejecuta `INICIAR_ESTUDIO.cmd`. El lanzador instala las dependencias de npm la primera vez que lo abres. Mantén abierta la ventana mientras trabajas.
3. Abre el [estudio automático](http://127.0.0.1:5173/?workspace=automatic) y crea tu cuenta local.

Desde un clon del repositorio, entra primero en la carpeta `studio`. Para arrancar desde PowerShell, puedes usar estos comandos:

```powershell
npm ci
npm run setup
npm run dev
```

## Unir varias partes

Pulsa **Importar y montar → Elegir vídeo y montar**. Selecciona de 2 a 12 archivos MP4, MOV, MKV o WebM. El estudio propone el orden según el número al principio de cada nombre, por ejemplo `01-intro.mp4` y `02-entrevista.mp4`. Usa las flechas para corregirlo y pulsa **Unir y montar**. Con **Solo importar vídeo**, las partes unidas se abren en la línea de tiempo para editar a mano.

Si los flujos son compatibles, el estudio los copia sin recodificar. Si difieren, usa el encuadre de la primera parte. Los originales se conservan. Si un archivo contiene varias pistas de audio, sitúa la que quieres usar en primer lugar.

Las marcas numeradas de la línea de tiempo te llevan a las partes. En **Editar automáticamente** puedes partir de una receta, cambiar sus ajustes y elegir 16:9, 9:16 u orientación automática.

## Preparar Whisper para grabaciones con audio

La edición manual y el render funcionan con FFmpeg. El montaje automático de grabaciones con audio necesita Whisper. Instala Python 3.11 de 64 bits y ejecuta estos pasos desde la carpeta del estudio después de la primera ejecución:

```powershell
py -3.11 -m venv runtime\venv
.\runtime\venv\Scripts\python.exe -m pip install -r requirements.txt
npm run model:tiny
npm run doctor
```

El modelo `tiny` se descarga al ejecutar ese comando y después transcribe en tu equipo. El retoque facial usa el modelo Face Landmarker de MediaPipe, que se instala aparte en `models/face_landmarker.task`.

## Añadir vídeo de apoyo de Pexels

Consigue una clave en [Pexels](https://www.pexels.com/api/) y guárdala como `PEXELS_API_KEY` en un archivo `.env.local` dentro de la carpeta del estudio. Activa **Vídeo de apoyo de Pexels** en los ajustes de montaje. Puedes usar este control de forma independiente de los memes y de Ollama.

El estudio busca términos visuales del montaje, prioriza vídeos y puede usar una foto cuando no encuentra un vídeo pertinente. Conserva tu voz. Puedes revisar las inserciones y sus créditos en el panel de recursos.

## Guardar y publicar

Usa **Versiones** para guardar un punto de retorno. **Paquete .zip** conserva el montaje, el vídeo original y el audio que usa. Puedes abrir el paquete desde **Galería multimedia → Importar paquete**. Si el montaje referencia vídeos de otros proyectos, para mover el conjunto puedes unir las partes al importarlas o exportar el MP4.

En **Exportar vídeo** el preflight comprueba la revisión, resolución y codificador, y estima peso y tiempo. **Creador** descarga los shorts elegidos en un ZIP con MP4, subtítulos, miniaturas y texto de publicación. Los sonidos incluidos conservan sus licencias en `resources/`.
