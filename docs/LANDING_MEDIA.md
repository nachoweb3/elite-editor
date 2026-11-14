# Material generado para la landing (Higgsfield u otro)

La landing (`vendor/opencut-classic/apps/web/src/app/page.tsx`) funciona sin ningún archivo externo: la maqueta del editor, los stickers y las animaciones se generan con código. Si colocas archivos con estos nombres en `vendor/opencut-classic/apps/web/public/landing/`, la página los usa automáticamente (se detectan al renderizar; no hace falta tocar código):

| Archivo | Dónde aparece | Formato recomendado |
|---|---|---|
| `hero.mp4` | Fondo del hero, detrás del título, al 28 % de opacidad y con degradado hacia abajo | 1920×1080, 6–10 s en bucle, H.264, sin audio, menos de 6 MB |
| `hero-poster.jpg` | Imagen mientras carga `hero.mp4` | 1920×1080, JPG, menos de 300 KB |
| `creators.jpg` | Sustituye la tarjeta «Kit de publicación» de la sección de creadores | 1600×1000, JPG, menos de 400 KB |
| `backdrop.jpg` | Fondo de la llamada final a la acción | 2400×1200, JPG, menos de 500 KB |

Si un archivo no existe, la página usa su versión generada por código. Los archivos de `public/landing/` no deben contener personas reales identificables sin permiso, logotipos de terceros ni texto incrustado (la maquetación ya pone el texto).

## Prompts sugeridos

Escribe los prompts en inglés si el generador rinde mejor así. Mantén la paleta de la marca: menta `#5effc8`, cian `#38e8ff`, violeta `#a78bfa` sobre fondo índigo casi negro `#03040b`.

- **hero.mp4** — «Slow cinematic loop, abstract holographic video editing interface floating in a dark indigo void, glowing mint and violet timeline clips drifting like aurora ribbons, soft particles, shallow depth of field, no text, no logos, seamless loop».
- **creators.jpg** — «Dark workspace of a video creator seen from above, glowing ultrawide monitor showing a colourful timeline, mint and violet rim lighting, cables and microphone out of focus, cinematic, no readable text, no faces».
- **backdrop.jpg** — «Wide aurora in indigo, mint and violet over a perspective grid horizon, subtle film grain, minimal, lots of empty space in the centre, no text».

## Licencias

Conserva el nombre de la herramienta de generación, la fecha y el prompt en un archivo `public/landing/CREDITS.txt`, y revisa las condiciones de uso comercial del servicio con el que generes los archivos antes de publicarlos.
