import Link from "next/link";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";
import { SITE_URL } from "@/site/brand";
import { HeroDemo } from "@/components/landing/hero-demo";
import {
	MEME_STYLES,
	arrowSvg,
	badgeSvg,
	curvedArrowSvg,
	memeSvg,
	svgUrl,
} from "@/stickers/providers/elite-art";
import { emojiCatalogue } from "@/stickers/providers/emoji-data";
import { MEME_WORDS } from "@/stickers/providers/elite-pack";
import "./landing.css";

export const metadata: Metadata = {
	title: "Elite Editor · Edita tu vídeo como un documento",
	description:
		"Editor de vídeo local y gratuito: timeline completa, edición por texto, muletillas fuera, capítulos de YouTube y miniaturas. Sin nube, sin cuenta.",
	alternates: { canonical: SITE_URL },
	openGraph: {
		title: "Elite Editor",
		description: "Edita tu vídeo como un documento. Local, gratuito y sin nube.",
	},
};

/** Optional generated media (e.g. from Higgsfield). Drop files in public/landing/ and they appear. */
function landingMedia(file: string): string | null {
	try {
		return fs.existsSync(path.join(process.cwd(), "public", "landing", file))
			? `/landing/${file}`
			: null;
	} catch {
		return null;
	}
}

const style = (vars: Record<string, string>) => vars as CSSProperties;
const bars = Array.from({ length: 34 }, (_, i) => ({
	h: 28 + Math.round(Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.4)) * 72),
	d: `${(i % 9) * 0.18}s`,
}));
const MARQUEE = [
	"Edición por texto",
	"Muletillas fuera",
	"Pausas con aire",
	"Capítulos de YouTube",
	"Subtítulos de 1 a 5 palabras",
	"Miniaturas",
	"Memes y emoji",
	"Zoom con rombos",
	"Instrucciones en español",
	"IA local opcional",
	"Sin nube · sin cuenta",
];

export default async function Home() {
	const heroVideo = landingMedia("hero.mp4");
	const heroPoster = landingMedia("hero-poster.jpg");
	const creatorsImage = landingMedia("creators.jpg");
	const backdrop = landingMedia("backdrop.jpg");

	const art = {
		burst: svgUrl(memeSvg("burst", "¡WOW!")),
		subscribe: svgUrl(badgeSvg({ label: "SUSCRÍBETE", background: "#ff1f3d", emoji: "🔔" })),
		neon: svgUrl(memeSvg("neon", "SIN NUBE")),
		tape: svgUrl(memeSvg("tape", "PARTE 2")),
		arrow: svgUrl(curvedArrowSvg("#5effc8", false)),
		classic: svgUrl(memeSvg("impact", "OMG")),
		glitch: svgUrl(memeSvg("glitch", "EPIC")),
		live: svgUrl(badgeSvg({ label: "EN DIRECTO", background: "#dc2626", dot: "#fff" })),
		check: svgUrl(arrowSvg(0, "#ffd43b")),
		bubble: svgUrl(memeSvg("bubble", "¿EN SERIO?")),
	};
	const emojiCount = emojiCatalogue().length;
	const memeCount = MEME_WORDS.length * Object.keys(MEME_STYLES).length;

	return (
		<main className="lp">
			{/* ------------------------------ Nav ------------------------------ */}
			<header className="lp-nav">
				<div className="lp-wrap lp-nav-in">
					<Link href="/" className="lp-brand">
						<img src="/elite-mark.svg" width="32" height="32" alt="" />
						Elite Editor
					</Link>
					<nav className="lp-links" aria-label="Secciones">
						<a href="#funciones">Funciones</a>
						<a href="#creadores">Creadores</a>
						<a href="#como">Cómo funciona</a>
						<a href="#local">Privacidad</a>
						<a href="#faq">Preguntas</a>
					</nav>
					<Link href="/projects" className="lp-btn lp-btn-primary">
						Empezar
					</Link>
				</div>
			</header>

			{/* ------------------------------ Hero ----------------------------- */}
			<section className="lp-hero">
				<div className="lp-portal" aria-hidden />
				<div className="lp-grid-bg" aria-hidden />
				{heroVideo ? (
					<video
						className="lp-hero-video"
						src={heroVideo}
						poster={heroPoster ?? undefined}
						autoPlay
						muted
						loop
						playsInline
						aria-hidden
					/>
				) : null}
				<div className="lp-wrap lp-hero-grid">
					<div>
						<p className="lp-kicker">Estudio de vídeo local · gratuito · sin nube</p>
						<h1 className="lp-h1">
							Edita tu vídeo
							<br />
							como un <span className="holo">documento.</span>
						</h1>
						<p className="lp-lead">
							Lee la transcripción, quita muletillas y pausas con un clic, publica con
							capítulos y miniatura. Una timeline completa, un asistente que revisas
							antes de aplicar y todo ocurre en tu equipo.
						</p>
						<div className="lp-cta">
							<Link href="/projects" className="lp-btn lp-btn-primary">
								Empezar a editar →
							</Link>
							<a href="#como" className="lp-btn lp-btn-ghost">
								Ver cómo funciona
							</a>
						</div>
						<div className="lp-trust">
							<span className="lp-chip">◆ Código abierto · MIT</span>
							<span className="lp-chip">◆ Sin cuenta</span>
							<span className="lp-chip">◆ Windows · alfa</span>
							<span className="lp-chip">◆ FFmpeg · Whisper · Ollama opcionales</span>
						</div>
					</div>
					<HeroDemo>
						<img className="lp-float" alt="" src={art.burst} style={style({ "--s": "150px", "--r": "-8deg", "--d": "0s", top: "-9%", right: "-3%" })} />
						<img className="lp-float" alt="" src={art.subscribe} style={style({ "--s": "190px", "--r": "-4deg", "--d": "1.1s", bottom: "-8%", left: "-4%" })} />
						<img className="lp-float" alt="" src={art.tape} style={style({ "--s": "150px", "--r": "5deg", "--d": "2s", top: "-8%", left: "6%" })} />
						<img className="lp-float" alt="" src={art.neon} style={style({ "--s": "170px", "--r": "4deg", "--d": "0.5s", bottom: "10%", right: "-6%" })} />
					</HeroDemo>
				</div>
			</section>

			{/* ----------------------------- Marquee --------------------------- */}
			<div className="lp-marquee" aria-hidden>
				<div className="lp-marquee-track">
					{[...MARQUEE, ...MARQUEE].map((item, i) => (
						<span key={i}>{item}</span>
					))}
				</div>
			</div>

			{/* ------------------------------ Bento ---------------------------- */}
			<section id="funciones" className="lp-section">
				<div className="lp-wrap">
					<p className="lp-kicker">Lo que cambia</p>
					<h2 className="lp-h2">Menos arrastrar,<br />más contar tu historia</h2>
					<p className="lp-lead">
						Editas sobre texto, ritmo y plantillas, y sigues teniendo una timeline de
						verdad cuando quieres tocar cada fotograma.
					</p>
					<div className="lp-bento">
						<article className="lp-cell xeno-card lp-reveal w7">
							<p className="lp-kicker">01 · Texto</p>
							<h3>Edición por texto</h3>
							<p>
								Escucha cada frase, quítala o recupérala, corrige un nombre en toda la
								transcripción y corta palabras sueltas. Todo se puede deshacer.
							</p>
							<div className="art lp-mini" aria-hidden>
								<div>▶ 0:00 Hola <span className="cut">eh</span> bienvenidos al editor</div>
								<div>▶ 0:05 hoy vamos a <span className="cut">vamos a</span> probar <span className="cut">mmm</span> la edición</div>
								<div className="ok">✓ 3 muletillas quitadas · 2,8 s menos</div>
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w5">
							<p className="lp-kicker">02 · Ritmo</p>
							<h3>Pausas con aire</h3>
							<p>Acorta los silencios largos y deja un respiro natural de 0,25 s. Tú eliges el umbral.</p>
							<div className="art lp-bars" aria-hidden>
								{bars.map((b, i) => (
									<i key={i} style={style({ "--h": `${b.h}%`, "--d": b.d })} />
								))}
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w4">
							<p className="lp-kicker">03 · Instrucciones</p>
							<h3>Háblale en español</h3>
							<p>Reglas locales exactas, sin nube. Con Ollama, la IA ayuda con lo ambiguo.</p>
							<div className="art lp-mini" aria-hidden>
								<div>«quita del 1:05 al 1:30»</div>
								<div className="ok">→ recorte 1:05 – 1:30</div>
								<div>«subtítulos estilo viral»</div>
								<div className="ok">→ estilo: viral</div>
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w4">
							<p className="lp-kicker">04 · Publicar</p>
							<h3>Del montaje a YouTube</h3>
							<p>Capítulos, títulos, descripción, hashtags, miniatura y formato 16:9, 9:16 o 4K.</p>
							<div className="art lp-frames" aria-hidden>
								<div style={{ width: "5.6rem", height: "3.15rem" }}>16:9</div>
								<div style={{ width: "1.9rem", height: "3.4rem" }}>9:16</div>
								<div style={{ width: "4.2rem", height: "2.36rem" }}>4K</div>
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w4">
							<p className="lp-kicker">05 · Stickers</p>
							<h3>Memes y emoji</h3>
							<p>
								{memeCount} memes en {Object.keys(MEME_STYLES).length} estilos, {emojiCount} emoji con
								búsqueda en español, flechas, bocadillos y llamadas. Crea los tuyos con
								cualquier texto.
							</p>
							<div className="art lp-sticker-row" aria-hidden>
								<img src={art.classic} alt="" />
								<img src={art.glitch} alt="" />
								<img src={art.live} alt="" />
								<img src={art.bubble} alt="" />
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w6">
							<p className="lp-kicker">06 · Acabado</p>
							<h3>Color, efectos y movimiento</h3>
							<p>
								Efectos por GPU, belleza en directo, zoom con rombos y movimientos de
								cámara en un clic, entradas y salidas animadas con keyframes editables.
							</p>
							<div className="art lp-lut" aria-hidden>
								<i style={style({ "--g": "linear-gradient(135deg,#2a6df4,#ffb347 55%,#e23d6e)" })} />
								<i style={style({ "--g": "linear-gradient(135deg,#222,#bbb)" })} />
								<i style={style({ "--g": "linear-gradient(135deg,#6b4a2a,#d9b680)" })} />
								<i style={style({ "--g": "linear-gradient(135deg,#1f9bff,#9be7ff)" })} />
							</div>
						</article>
						<article className="lp-cell xeno-card lp-reveal w6">
							<p className="lp-kicker">07 · Control</p>
							<h3>Trabajos con progreso real</h3>
							<p>
								Porcentaje en vivo, botón Cancelar que detiene FFmpeg al instante, estado
								del motor y un <code>doctor</code> que te dice qué falta instalar.
							</p>
							<div className="art lp-mini" aria-hidden>
								<div>◆ Análisis · en proceso · 62 %</div>
								<div className="ok">● FFmpeg · ● Transcripción · ● IA local · ● NVENC</div>
							</div>
						</article>
					</div>
				</div>
			</section>

			{/* ----------------------------- Creators -------------------------- */}
			<section id="creadores" className="lp-section">
				<div className="lp-wrap lp-creators">
					<div>
						<p className="lp-kicker">Para creadores de contenido</p>
						<h2 className="lp-h2">Pensado para<br />publicar más rápido</h2>
						<p className="lp-lead">
							Lo que repites en cada vídeo, resuelto: limpiar el ritmo, subtitular,
							poner capítulos y preparar el texto de publicación.
						</p>
						<ul className="lp-list">
							<li>
								<span>
									Capítulos de YouTube automáticos
									<small>Empiezan en 0:00, con tres capítulos o más y diez segundos como mínimo.</small>
								</span>
							</li>
							<li>
								<span>
									Títulos, descripción y hashtags
									<small>Con la IA local de Ollama o con reglas si no la tienes. Cada bloque se copia con un clic.</small>
								</span>
							</li>
							<li>
								<span>
									Subtítulos de 1 a 5 palabras
									<small>Dinámicos para Shorts y Reels, y descarga en SRT, VTT o texto.</small>
								</span>
							</li>
							<li>
								<span>
									Miniatura desde cualquier fotograma
									<small>Con texto y el formato de tu proyecto.</small>
								</span>
							</li>
						</ul>
						<div className="lp-cta">
							<Link href="/projects" className="lp-btn lp-btn-primary">
								Probar con mi vídeo →
							</Link>
						</div>
					</div>
					<div className="lp-demo-stage">
						{creatorsImage ? (
							<img
								src={creatorsImage}
								alt=""
								style={{ width: "100%", borderRadius: 16, border: "1px solid rgb(150 160 255 / .2)", boxShadow: "0 40px 100px -40px #000" }}
							/>
						) : (
							<div className="xeno-card" style={{ padding: "1.6rem" }}>
								<p className="lp-kicker">Kit de publicación</p>
								<div className="lp-mini" style={{ marginTop: ".8rem", fontSize: ".84rem" }}>
									<div><span className="ok">0:00</span> Bienvenidos al editor</div>
									<div><span className="ok">0:40</span> Edición por texto, paso a paso</div>
									<div><span className="ok">1:55</span> Quitar muletillas en un clic</div>
									<div><span className="ok">3:10</span> Capítulos y miniatura</div>
									<div style={{ marginTop: ".8rem", color: "#8e9ac0" }}>#edicion #youtube #tutorial</div>
								</div>
								<div className="lp-sticker-row" style={{ marginTop: "1.2rem" }} aria-hidden>
									<img src={art.subscribe} alt="" />
									<img src={art.arrow} alt="" style={{ height: "3rem" }} />
								</div>
								<hr style={{ margin: "1.4rem 0 1.1rem", border: 0, borderTop: "1px solid rgb(150 160 255 / .16)" }} />
								<p className="lp-kicker">Formatos de salida</p>
								<div className="lp-frames" style={{ marginTop: ".9rem" }} aria-hidden>
									<div style={{ width: "7rem", height: "3.94rem" }}>YouTube 16:9</div>
									<div style={{ width: "2.2rem", height: "3.9rem" }}>Shorts</div>
									<div style={{ width: "2.2rem", height: "3.9rem" }}>Reels</div>
									<div style={{ width: "2.2rem", height: "3.9rem" }}>TikTok</div>
									<div style={{ width: "5rem", height: "2.8rem" }}>4K</div>
								</div>
								<p className="lp-kicker" style={{ marginTop: "1.4rem" }}>Subtítulos para vídeo corto</p>
								<div className="lp-sticker-row" style={{ marginTop: ".7rem" }} aria-hidden>
									<img src={art.classic} alt="" style={{ height: "2.6rem" }} />
									<img src={art.glitch} alt="" style={{ height: "2.6rem" }} />
									<img src={art.tape} alt="" style={{ height: "2.6rem" }} />
								</div>
							</div>
						)}
					</div>
				</div>
			</section>

			{/* ------------------------------ Steps ---------------------------- */}
			<section id="como" className="lp-section">
				<div className="lp-wrap">
					<p className="lp-kicker">Cómo funciona</p>
					<h2 className="lp-h2">De la grabación<br />a publicar</h2>
					<div className="lp-steps">
						{[
							["Importa", "Crea un proyecto y vincula tu grabación original en el asistente, o arrastra tus clips a la timeline."],
							["Analiza", "Detecta silencios y transcribe en tu equipo. Revisas la propuesta antes de aceptar nada."],
							["Edita por texto", "Quita frases, muletillas y repeticiones, acorta pausas y corrige palabras mal transcritas."],
							["Publica", "Aprueba, elige formato, renderiza y copia títulos, capítulos y miniatura."],
						].map(([title, text]) => (
							<article key={title} className="lp-step xeno-card lp-reveal">
								<h3>{title}</h3>
								<p>{text}</p>
							</article>
						))}
					</div>
				</div>
			</section>

			{/* ------------------------------ Local ---------------------------- */}
			<section id="local" className="lp-section">
				<div className="lp-wrap lp-local">
					<div>
						<p className="lp-kicker">Privacidad</p>
						<h2 className="lp-h2">Tus vídeos<br />no salen de tu PC</h2>
						<p className="lp-lead">
							Sin cuenta, sin suscripción y sin subir nada. El motor corre en
							127.0.0.1, los proyectos viven en tu navegador y la IA es local. Lo
							externo (descargar un modelo, generar con tu propia clave) es siempre
							opcional y explícito.
						</p>
						<ul className="lp-list">
							<li><span>Proyectos y medios en el navegador; originales del asistente en disco.</span></li>
							<li><span>Transcripción con Whisper local y asistente con Ollama, ambos opcionales.</span></li>
							<li><span>Mantén copia de tu trabajo: la sincronización en la nube no existe todavía.</span></li>
						</ul>
					</div>
					<div className="lp-net" aria-hidden>
						<svg viewBox="0 0 400 300">
							<circle className="ring" cx="200" cy="150" r="118" />
							<circle className="ring" cx="200" cy="150" r="82" style={{ animationDirection: "reverse" }} />
							<circle className="pulse" cx="200" cy="150" r="90" />
							<circle className="pulse" cx="200" cy="150" r="90" style={{ animationDelay: "1.8s" }} />
							<rect x="150" y="118" width="100" height="64" rx="10" fill="#0b0e24" stroke="#5effc8" strokeWidth="2" />
							<rect x="158" y="126" width="84" height="44" rx="4" fill="#12163a" />
							<path d="M176 200 H224 M200 182 V200" stroke="#5effc8" strokeWidth="3" strokeLinecap="round" />
							<text x="200" y="154" textAnchor="middle" fill="#5effc8" fontSize="11" fontFamily="monospace" letterSpacing="2">TU PC</text>
							<g className="lp-cloud-x" fill="none" strokeWidth="2.5" strokeLinecap="round">
								<path d="M312 62c-14 0-14-20 0-20 3-12 22-12 25 0 14-1 14 20 0 20z" />
								<path d="M318 70l20 20M338 70l-20 20" />
							</g>
							<text x="326" y="112" textAnchor="middle" fill="#ff5c8a" fontSize="10" fontFamily="monospace" letterSpacing="1.5">SIN NUBE</text>
						</svg>
					</div>
				</div>
			</section>

			{/* ------------------------------- FAQ ----------------------------- */}
			<section id="faq" className="lp-section">
				<div className="lp-wrap">
					<p className="lp-kicker">Preguntas</p>
					<h2 className="lp-h2">Lo que suele<br />preguntarse</h2>
					<div className="lp-faq">
						{[
							["¿Es gratis?", "Sí. Sin cuenta ni suscripción. Las contribuciones propias de Elite Editor son MIT; las dependencias conservan sus licencias. Generar con servicios externos es opcional y usa tu propia clave."],
							["¿Qué necesito instalar?", "Node.js 22+ y FFmpeg. Python con Whisper (transcripción) y Ollama (instrucciones con IA) son opcionales: sin ellos puedes montar a mano y usar las reglas locales."],
							["¿Dónde se guardan mis proyectos?", "Los proyectos de la timeline y sus medios, en el almacenamiento de tu navegador; los originales del asistente, en disco. No borres los datos del sitio sin una copia."],
							["¿Funciona en macOS o Linux?", "Windows es la plataforma de desarrollo. Las demás todavía no se han probado en una release."],
							["¿Es un producto terminado?", "No: es una alfa temprana. Las exportaciones muy largas y la fiabilidad ante cierres inesperados aún necesitan más pruebas. Empieza con un clip corto."],
							["¿De dónde sale la timeline?", "Elite Editor se basa en OpenCut Classic y en otras herramientas abiertas. No es una versión oficial de OpenCut."],
						].map(([q, a]) => (
							<details key={q}>
								<summary>{q}</summary>
								<p>{a}</p>
							</details>
						))}
					</div>
				</div>
			</section>

			{/* ------------------------------ Final CTA ------------------------ */}
			<section className="lp-final">
				{backdrop ? (
					<img src={backdrop} alt="" className="lp-hero-video" style={{ opacity: 0.22 }} />
				) : null}
				<div className="lp-wrap">
					<span className="xeno-orbit" style={{ margin: "0 auto 1.6rem", width: 56, height: 56 }} aria-hidden />
					<p className="lp-kicker">Acceso anticipado · editor gratuito</p>
					<h2 className="lp-h2">Tu próximo vídeo,<br /><span className="xeno-holo-text">en menos pasos</span></h2>
					<p className="lp-lead" style={{ margin: "0 auto" }}>
						Empieza con un clip corto, prueba la edición por texto y dime qué falta.
					</p>
					<div className="lp-cta" style={{ justifyContent: "center" }}>
						<Link href="/projects" className="lp-btn lp-btn-primary">Crear mi primer proyecto →</Link>
						<Link href="/guide" className="lp-btn lp-btn-ghost">Guía de primeros pasos</Link>
					</div>
				</div>
			</section>

			<footer className="lp-wrap lp-foot">
				<span>Elite Editor · Acceso anticipado · Creado gratis por @nacho_web3</span>
				<span>
					Construido sobre{" "}
					<a href="https://github.com/OpenCut-app/opencut-classic">OpenCut</a> y{" "}
					<a href="https://github.com/Anil-matcha/Open-Generative-AI">Open Generative AI</a>.
				</span>
			</footer>
		</main>
	);
}
