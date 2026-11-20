# Elite Editor

![Elite Editor](docs/brand/elite-editor.svg)

**Un editor de vídeo local y gratuito con timeline real y un asistente IA cuyas decisiones puedes revisar.**

## Estudio automático para Windows

La beta reúne el montaje automático, la unión de grabaciones por partes y la revisión manual en la misma línea de tiempo. [Descarga el ZIP de Windows](https://github.com/nachoweb3/elite-editor/releases/tag/v0.3.0-beta.2) o [compila desde el código del estudio](studio/README.md). El estudio guarda los proyectos en tu equipo y usa una cuenta local.

El editor basado en OpenCut que se describe a continuación funciona de forma independiente y se puede usar sin cuenta. La generación externa opcional utiliza tu clave y los créditos de tu proveedor.

## Instalar y abrir

Necesitas Git, Node.js 22+ y FFmpeg/ffprobe en PATH. Desde PowerShell:

```powershell
git clone https://github.com/nachoweb3/elite-editor.git
cd elite-editor
npm ci
npm exec --yes --package=bun@1.2.18 -- bun install --cwd vendor/opencut-classic --frozen-lockfile
npm run setup
npm run dev
```

Abre http://127.0.0.1:5181/projects. Después puedes usar `ELITE_EDITOR.cmd`. No cierres la terminal mientras editas. La preparación no descarga modelos ni incluye tus claves o grabaciones.

## Qué incluye

- Timeline de OpenCut adaptada: medios, capas, textos, recortes y keyframes.
- Zoom animado con rombos, selección de zona del lienzo y posición X/Y, más **movimientos automáticos en un clic** (acercamiento/alejamiento lento, paneos y *punch-in* en el cabezal). Veinte estilos de texto editables organizados por uso.
- Asistente integrado: propuesta de cortes, subtítulos editables e instrucciones con revisión antes/después.
- **Edición por texto:** lee la transcripción, escucha cada frase, quítala o recupérala, busca en ella y descarga los subtítulos en SRT, VTT o texto sin renderizar.
- **Quitar muletillas y repeticiones** («eh», «mmm», «que que», «vamos a vamos a») con vista previa de cuántas son y cuántos segundos ahorras.
- **Instrucciones sin Ollama:** un intérprete local en español e inglés entiende cortes exactos («quita del 1:05 al 1:30», «los últimos 10 segundos») y ajustes («sube un poco el contraste», «blanco y negro», «subtítulos arriba», «quita las ojeras»). Con Ollama, los cortes explícitos siguen usando reglas exactas y, si el modelo propone un plan inválido, las reglas lo sustituyen.
- **Trabajos con progreso real y botón Cancelar:** porcentaje en vivo de análisis, transcripción y render; cancelar detiene FFmpeg/Python al instante.
- **Estado del motor** en el asistente: qué funciona en tu equipo (FFmpeg, transcripción, IA local, retoque, NVENC) y cómo arreglar lo que falta. `npm run doctor` muestra lo mismo en la terminal.
- **Mapa del montaje y estadísticas:** franja del original con lo que queda (clic para escuchar), duración antes/después, palabras por minuto, porcentaje de voz y pausa más larga.
- **Edición palabra a palabra y corrección de texto:** abre una frase, marca palabras sueltas y quítalas; corrige errores de transcripción en línea o con buscar y reemplazar (con opción de recordarlo para futuras transcripciones).
- **Ritmo:** acorta automáticamente las pausas largas dejando un respiro natural.
- **Exportar y publicar:** aprueba la propuesta, elige formato (YouTube, Reels, TikTok, Shorts, 4K), haz el render final y descarga MP4/SRT/ASS; crea una miniatura con el fotograma y texto que elijas; genera títulos, descripción, hashtags y capítulos de YouTube listos para copiar (reglas locales o IA local).
- **Subtítulos para vídeo corto:** al llevarlos a la timeline elige de 1 a 5 palabras por subtítulo.
- **Interfaz Xeno:** diseño propio de cristal y neón con esquinas HUD, auroras, cabezal luminoso y botones de energía. Usa fuentes del sistema (sin descargas) y respeta «reducir movimiento».
- Análisis local opcional con Whisper, FFmpeg y Ollama; retoque facial con MediaPipe y voz limpia.
- Limpieza manual de vídeo/voz y 14 controles de belleza, incluidos tamaños de ojos, nariz y boca en ambos sentidos. Procesamiento previo sobre una copia, con cuatro presets de partida.
- Diez efectos GPU, incluido chroma key; nueve animaciones de entrada/salida (con «Ambas» y curva suave) que parten de la posición real del clip, y 188 audios CC0 preinstalados.
- Audio con categorías, búsqueda por autor/colección, orden por duración y favoritos locales.
- Explicaciones stickman que puedes revisar, quitar y componer en el render.
- Biblioteca con tu identidad de proyecto, universo animado y firma @nacho_web3.

## Primera edición

Lee la [guía introductoria completa](docs/GETTING_STARTED.es.md), también disponible en **Guía de primeros pasos** dentro de Mis proyectos.

Crea un proyecto y carga tu vídeo en Medios. Para editar manualmente, trabaja en la timeline. Para recibir ayuda, vincula la grabación en Asistente IA, analiza y revisa antes de añadir los cortes. Las instrucciones siguen el flujo **Mejorar instrucción → Ver qué cambiaría → Aplicar a la propuesta IA**. La propuesta y la timeline son estados diferentes: aplicar una instrucción no sustituye tus capas manuales.

Los modelos se instalan aparte. La [guía principal](README.md#optional-local-ai) explica cómo preparar Python, Whisper, Ollama y el modelo facial. La edición manual no necesita claves de IA. Sin Python el render sigue funcionando: el retoque facial se omite con un aviso.

### Ajustes avanzados

En `config/studio.json`:

- `promptEngine`: `"auto"` (por defecto: reglas exactas para cortes explícitos, Ollama para lo demás y reglas si Ollama falla), `"ollama"` o `"rules"` (nunca llama al modelo).
- `fillers`: muletillas adicionales que quieras detectar, por ejemplo `["o sea", "en plan", "vale"]`. Por defecto solo se detectan sonidos de duda que nunca son contenido.

Variables de entorno: `ELITE_OLLAMA_URL` (por defecto `http://127.0.0.1:11434`) y `ELITE_OLLAMA_MODEL` para usar otro modelo de Ollama.

## Límites claros

Esta alfa todavía no ofrece una sincronización completa entre todas las capas de OpenCut y el motor FFmpeg. Stickman y movimientos de cámara del motor aparecen en el vídeo procesado; no se convierten todavía en capas/keyframes nativos. Las entradas/salidas no son disoluciones entre clips solapados. Chroma key no equivale a segmentación automática de personas.

Los proyectos de timeline se guardan en el navegador y los originales del asistente en disco. No borres los datos del sitio sin copia de tu trabajo. Falta ampliar las pruebas de exportación en navegador con grabaciones largas y material real. El servidor actual es local, no una plataforma SaaS multiusuario.

## Participa

Queremos que la edición local gratuita sea útil por sí misma. Los servicios remotos son una posible extensión futura; **no hay sistema de pagos**. Puedes ayudarnos con una estrella, errores reproducibles, traducciones y contribuciones pequeñas que incluyan pruebas. Consulta la [hoja de ruta](docs/ROADMAP.md), [arquitectura](docs/ARCHITECTURE.md) y [licencias y atribuciones](THIRD_PARTY_NOTICES.md).

**Created totally free by @nacho_web3. Innovation is our flag.**
