# Guía introductoria de Elite Editor

La guía también está dentro del editor: pulsa **Guía de primeros pasos** en Mis proyectos, o abre http://127.0.0.1:5181/guide.

## 1. Antes de empezar

Sigue la instalación del README y arranca con `npm run dev` o `ELITE_EDITOR.cmd`. Mantén la terminal abierta. Si solo quieres editar manualmente, no necesitas modelos de IA ni claves. Para transcripción y retoque, sigue la preparación opcional de Python/modelos; para instrucciones, prepara Ollama.

Empieza con un clip de entre 30 segundos y dos minutos. Haz una exportación de prueba antes de trabajar con una grabación importante de 30 minutos.

## 2. Crea tu proyecto

En Mis proyectos, crea uno nuevo y dale un nombre. Puedes usar un lienzo vacío y añadir tus archivos desde Medios. Arrastra los vídeos a la timeline. La biblioteca de medios y la timeline son distintas: importar un archivo no significa que ya esté incluido en el montaje.

## 3. Decide entre montaje manual y asistido

**Manual:** recorta los extremos, divide y reordena clips; añade textos y pistas de audio. Usa Deshacer cuando quieras revertir una acción.

**Asistido:** abre Asistente IA, sube o selecciona tu grabación original y pulsa Detectar silencios y transcribir. Después puedes pedir Montaje automático + previsualización. Espera a que termine y lee los avisos: si falta un modelo, el sistema puede entregar una propuesta básica o indicar que no pudo transcribir.

## 4. Revisa antes de incorporar

Comprueba que no se pierden palabras ni explicaciones. Añadir cortes y subtítulos a la timeline agrega el montaje al final y permite seguir editándolo. Pulsarlo otra vez añade otra copia; no actualiza la anterior. Una operación Deshacer revierte la incorporación.

Enviar mis cortes al motor admite una pista principal formada por el original vinculado, a velocidad normal y sin huecos. Las capas, textos y efectos manuales no se sincronizan de vuelta al motor. Si tu montaje es más complejo, exporta desde la timeline.

## 5. Edita con instrucciones

Prueba «elimina los primeros 5 segundos» o «sube un poco el contraste». Mejorar instrucción ayuda a redactar. Ver qué cambiaría muestra valores y recortes. Aplica después de revisar. La propuesta caduca a los cinco minutos y también deja de ser válida si cambia el proyecto.

Aplicar una instrucción modifica la propuesta del motor, no todas tus capas del editor. Añade los cortes revisados cuando corresponda. El asistente no puede ejecutar cualquier función que imagines: las peticiones no soportadas deben mostrar un aviso.

## 6. Mejora rostro y voz

Guarda los controles de retoque/limpieza, prepara el original mejorado y aplica esa fuente a la timeline. El proceso conserva tiempos y capas de los clips vinculados. Puedes volver al original para comparar. Comprueba especialmente piel, ojos, dientes y bordes del rostro en movimiento; sube los controles con moderación.

## 7. Usa stickman cuando aporte algo

Con la transcripción preparada, abre Explicar con stickman y detecta conceptos. Lee cada titular y pie; quita las fichas que no representen lo que dices.

- **Superponer:** mantiene la duración del montaje y la voz original.
- **Intercalar:** añade tiempo; el clip intercalado tiene silencio si no lleva voz propia.

Genera y revisa el vídeo. Biblioteca permite importar el render terminado como un clip único. Las ilustraciones aún no se transfieren como capas independientes. Revisa el ritmo después de intercalar.

## 8. Audio, efectos y fondos

**Zoom con rombos:** selecciona un clip de vídeo o imagen y abre **Zoom ◆**. Coloca el cabezal al inicio y pulsa Guardar encuadre aquí. Avanza, aumenta el zoom, elige una zona y afina X/Y. Guarda el segundo rombo. Los botones ◆ permiten saltar entre encuadres y Quitar rombo actual elimina los keyframes de encuadre en ese punto. El selector de zonas es una cuadrícula del lienzo, no un rectángulo dibujado sobre la imagen. Los keyframes nativos conservan el recorrido en el proyecto; comprueba el movimiento y ajusta sus curvas en el inspector.

**Estudio de textos:** en Texto tienes 20 estilos organizados en títulos, rótulos, tutorial, citas y subtítulos manuales. Escribe contenido, elige duración y añade el estilo al cabezal. Aplicar estilo cambia la apariencia de textos seleccionados conservando contenido, posición, duración y animaciones. Los controles del inspector permiten seguir personalizando el resultado. Las fuentes dependen del equipo.

**Belleza y limpieza manual:** en Asistente IA → Acabado de vídeo, voz y belleza tienes reducción de ruido de vídeo, nitidez, reducción de ruido de voz, filtro de graves y normalización. Los controles de voz requieren activar la limpieza de audio. Guarda, prepara el original mejorado y aplícalo a la timeline; no son filtros faciales en tiempo real.

Belleza ofrece 14 controles: suavidad, luz, ojeras, ojos, dientes, mandíbula, suavizado de líneas, detalle de piel, temperatura, intensidad de labios, tamaño de ojos/nariz/boca y anchura facial. Los tamaños admiten valores negativos y positivos; cero mantiene el rasgo. El suavizado de arrugas es una reducción local de líneas y textura, no una eliminación semántica garantizada. Se sigue un rostro; revisa giros y oclusiones. Cuatro presets ayudan a empezar y dejan neutros los cambios de tamaño.

Escucha los recursos incluidos antes de añadirlos. Coloca el cabezal donde quieras comenzar el sonido y ajusta volumen/duración. Comprueba que la música no tape la voz.

Filtra por categoría o tipo, ordena por nombre/duración y marca ★ para guardar favoritos en este navegador. La búsqueda incluye nombre, colección y autor. Si no aparece nada, quita los filtros o Favoritos.

Selecciona el clip al aplicar efectos. Las entradas/salidas animan un clip; no son disoluciones reales entre dos clips. Chroma key quita un color uniforme y requiere ajustar tolerancia/bordes. No equivale a segmentación IA de una persona.

Los movimientos de cámara del motor anterior están en sus renders; todavía no pasan a keyframes nativos de OpenCut.

## 9. Exporta y comprueba

Reproduce el principio, algunos cortes y el final. Revisa voz, subtítulos, música, encuadre y duración. Exportar desde OpenCut incluye tus capas manuales. Un render del motor corresponde a su propia propuesta y ajustes.

Abre el archivo final fuera del editor y comprueba sonido e imagen. Una exportación MP4 es el vídeo terminado; no conserva una timeline editable.

## 10. Vuelve sin perder el trabajo

Mantén el mismo navegador y http://127.0.0.1:5181. Los proyectos de timeline y medios se guardan en datos del navegador; los proyectos del asistente y originales se guardan en disco. No limpies los datos del sitio ni cambies de perfil esperando encontrar automáticamente los mismos proyectos. Conserva tus originales y exportaciones; la sincronización en la nube no está implementada.

## Si algo no funciona

| Problema | Primer paso |
|---|---|
| La página no abre | Revisa la terminal del launcher y que ambos servicios estén listos. No abras varias copias en los mismos puertos. |
| Faltan sonidos | Instala FFmpeg/ffprobe en PATH y vuelve a ejecutar `npm run setup`. |
| No transcribe | Ejecuta `npm run doctor`; comprueba Python y el modelo instalado. |
| Las instrucciones no responden | Comprueba Ollama en ejecución y el modelo indicado en el README. |
| El retoque falla | Comprueba el modelo Face Landmarker y las dependencias Python. |
| Un resultado IA no aparece en la timeline | Revisa si aún es una propuesta del motor pendiente de importar o una mejora de fuente pendiente de aplicar. |
| Falla una generación externa | Revisa su estado/historial del proveedor antes de repetirla para evitar cargos duplicados. |
| Falla la exportación | Prueba un tramo corto, conserva el original y comunica pasos reproducibles, navegador y GPU. |

Publica errores sin claves, datos personales ni vídeos confidenciales. Este proyecto está en alfa y necesita pruebas en más equipos.
