import Link from "next/link";

const steps = [
	[
		"01",
		"Abre tu espacio",
		"En Mis proyectos, crea un proyecto nuevo. Puedes empezar con una timeline vacía o importar tu vídeo desde Medios. Ponle un nombre que puedas reconocer después.",
	],
	[
		"02",
		"Elige cómo quieres editar",
		"Para editar tú, arrastra el vídeo a la timeline y recorta, divide o reordena clips. Para recibir una propuesta, abre Asistente IA y sube o selecciona la grabación original. Los modelos locales se preparan una sola vez siguiendo la guía de instalación.",
	],
	[
		"03",
		"Analiza y revisa",
		"Detectar silencios y transcribir prepara el análisis. Montaje automático + previsualización propone una edición. Lee los avisos y mira el resultado antes de aceptarlo: una propuesta automática puede necesitar correcciones.",
	],
	[
		"04",
		"Hazlo tuyo",
		"Añadir cortes y subtítulos a la timeline incorpora clips editables al final del montaje. Ajusta cortes, añade textos, audio y efectos. Puedes deshacer la importación. Evita pulsarlo varias veces si no quieres repetir el montaje.",
	],
	[
		"05",
		"Revisa y exporta",
		"Reproduce el principio, varios cortes y el final. Comprueba voz, música, subtítulos y encuadre. Exporta desde el editor para incluir tus capas de timeline. Guarda el archivo final y comprueba que se reproduce correctamente.",
	],
];

export default function GuidePage() {
	return (
		<main className="min-h-screen bg-[#05080d] text-slate-100">
			<div className="mx-auto max-w-4xl space-y-12 px-6 py-12">
				<nav className="flex flex-wrap items-center justify-between gap-4 text-sm">
					<Link href="/projects" className="text-emerald-300 hover:underline">
						← Mis proyectos
					</Link>
					<span className="text-slate-400">Elite Editor · Primeros pasos</span>
				</nav>
				<header className="space-y-5">
					<p className="text-xs uppercase tracking-[.25em] text-emerald-300">
						De tu grabación a tu primer montaje
					</p>
					<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
						Tu primer vídeo,
						<br />
						paso a paso.
					</h1>
					<p className="max-w-2xl text-lg leading-relaxed text-slate-300">
						Empieza con un clip corto para conocer el editor. Después aplica el
						mismo recorrido a tu grabación larga. La edición local es gratuita;
						no necesitas una cuenta ni una clave para editar manualmente.
					</p>
					<Link
						href="/projects"
						className="inline-flex rounded-lg bg-emerald-300 px-5 py-3 font-medium text-slate-950"
					>
						Crear mi primer proyecto
					</Link>
				</header>
				<section aria-label="Pasos de edición" className="space-y-4">
					{steps.map(([number, title, text]) => (
						<article
							key={number}
							className="flex gap-5 rounded-2xl border border-white/10 bg-white/[.03] p-6"
						>
							<span className="text-xl font-medium text-emerald-300">
								{number}
							</span>
							<div className="space-y-2">
								<h2 className="text-xl font-semibold">{title}</h2>
								<p className="leading-relaxed text-slate-300">{text}</p>
							</div>
						</article>
					))}
				</section>
				<section className="space-y-4">
					<h2 className="text-2xl font-semibold">Cuando quieras ir más allá</h2>
					<details className="rounded-xl border border-white/10 p-5">
						<summary className="cursor-pointer font-medium">
							Editar escribiendo una instrucción
						</summary>
						<p className="mt-3 leading-relaxed text-slate-300">
							En Asistente IA, escribe algo concreto: «elimina los primeros 5
							segundos» o «sube un poco el contraste». Puedes mejorar la
							redacción. Pulsa Ver qué cambiaría, revisa los ajustes y después
							Aplicar a la propuesta IA. Esto modifica la propuesta del motor;
							no sustituye automáticamente tus capas de timeline.
						</p>
					</details>
					<details className="rounded-xl border border-white/10 p-5">
						<summary className="cursor-pointer font-medium">
							Mejorar rostro y limpiar la voz
						</summary>
						<p className="mt-3 leading-relaxed text-slate-300">
							Guarda tus controles de retoque y audio, pulsa Preparar original
							mejorado y espera a que termine. Aplicar mejora a mi timeline
							cambia la fuente de los clips vinculados conservando sus cortes.
							Volver al original en la timeline permite comparar. El retoque
							facial requiere el modelo opcional y se procesa antes de
							aplicarlo.
						</p>
					</details>
					<details className="rounded-xl border border-white/10 p-5">
						<summary className="cursor-pointer font-medium">
							Añadir explicaciones con stickman
						</summary>
						<p className="mt-3 leading-relaxed text-slate-300">
							Primero transcribe la grabación. En Explicar con stickman, pulsa
							Detectar conceptos, revisa los titulares y quita los que no
							ayuden. Puedes superponer las explicaciones o intercalarlas
							alargando el vídeo. Intercalar produce silencio si el clip no
							tiene voz propia. Genera el vídeo y revisa el resultado; desde
							Biblioteca puedes importar el render terminado como un clip. Estas
							explicaciones todavía no son capas editables independientes.
						</p>
					</details>
					<details className="rounded-xl border border-white/10 p-5">
						<summary className="cursor-pointer font-medium">
							Música, efectos y fondo verde
						</summary>
						<p className="mt-3 leading-relaxed text-slate-300">
							Escucha los recursos del panel de audio y añade los que encajen.
							Baja la música para que se entienda la voz. Selecciona un clip
							para aplicar efectos o animaciones de entrada/salida. Quitar fondo
							ofrece chroma key para un color uniforme: no recorta
							automáticamente a una persona sobre cualquier fondo. Revisa bordes
							y transparencia.
						</p>
					</details>
					<details className="rounded-xl border border-white/10 p-5">
						<summary className="cursor-pointer font-medium">
							Crear imágenes o vídeos con IA externa
						</summary>
						<p className="mt-3 leading-relaxed text-slate-300">
							Crear con IA es opcional y utiliza tu clave y créditos del
							proveedor. No hace falta para editar ni para usar el audio
							incluido. Comprueba el estado de una generación antes de repetirla
							si aparece un error, porque el proveedor podría haber recibido la
							solicitud.
						</p>
					</details>
				</section>
				<section className="space-y-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6">
					<h2 className="text-xl font-semibold">Antes de cerrar tu proyecto</h2>
					<p className="leading-relaxed text-slate-300">
						Tu montaje y sus medios se guardan en este navegador. Los originales
						del asistente se guardan en el ordenador. Mantén el mismo navegador
						y la misma dirección para volver a tu trabajo; no borres los datos
						del sitio sin copia. El MP4 exportado es un vídeo terminado, no una
						copia editable del proyecto.
					</p>
					<p className="leading-relaxed text-slate-300">
						Si algo falla, conserva el original y anota qué estabas haciendo.
						Esta versión es una alfa: prueba la exportación con un tramo corto
						antes de confiarle un montaje largo. No compartas claves ni
						grabaciones privadas al pedir ayuda.
					</p>
				</section>
				<footer className="flex flex-wrap justify-between gap-4 border-t border-white/10 pt-6 text-sm text-slate-400">
					<span>Created totally free by @nacho_web3</span>
					<span>Innovation is our flag</span>
				</footer>
			</div>
		</main>
	);
}
