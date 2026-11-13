import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/site/brand";

export const metadata: Metadata = {
	alternates: {
		canonical: SITE_URL,
	},
};

export default async function Home() {
	return (
		<main className="min-h-screen bg-[#0b0d13] text-white">
			<nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
				<Link
					href="/"
					className="flex items-center gap-3 text-xl font-semibold tracking-tight"
				>
					<img src="/elite-mark.svg" width="36" height="36" alt="" />
					Elite Editor
				</Link>
				<span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
					Acceso anticipado · Editor gratuito
				</span>
			</nav>
			<section className="mx-auto max-w-6xl px-6 pb-20 pt-20">
				<p className="mb-6 text-xs font-medium uppercase tracking-[.25em] text-emerald-200">
					De la grabación a tu historia
				</p>
				<h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
					Tu creatividad.
					<br />
					<span className="text-emerald-200">Todo el control.</span>
				</h1>
				<p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-400">
					Monta con una timeline completa. Deja que la IA te ayude con los
					cortes, los subtítulos y los recursos. Ajusta cada detalle a tu
					manera.
				</p>
				<Link
					href="/projects"
					className="mt-9 inline-flex rounded-xl bg-emerald-200 px-7 py-4 font-semibold text-slate-950 hover:bg-emerald-100"
				>
					Empezar a editar →
				</Link>
				<p className="mt-4 text-xs text-slate-500">
					Sin registro en esta versión local. La generación externa requiere tu
					clave y los créditos del proveedor.
				</p>
				<div className="mt-20 grid gap-5 md:grid-cols-3">
					{[
						[
							"01",
							"Monta a tu manera",
							"Clips, pistas, textos, efectos y keyframes en un mismo espacio de trabajo.",
						],
						[
							"02",
							"Un asistente en tu timeline",
							"Detecta silencios, prepara cortes y subtítulos, y sigue editándolos tú.",
						],
						[
							"03",
							"Cuida el acabado",
							"Prepara el original con retoque y voz limpia y aplícalo conservando el montaje.",
						],
					].map(([n, title, text]) => (
						<article
							key={n}
							className="rounded-2xl border border-white/10 bg-white/[.025] p-7"
						>
							<span className="text-xs text-emerald-200">{n}</span>
							<h2 className="mb-3 mt-6 text-lg font-medium">{title}</h2>
							<p className="text-sm leading-relaxed text-slate-400">{text}</p>
						</article>
					))}
				</div>
			</section>
			<footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-white/10 px-6 py-7 text-xs text-slate-500">
				<span>Elite Editor · Acceso anticipado</span>
				<span>
					Construido sobre{" "}
					<a
						className="underline"
						href="https://github.com/OpenCut-app/opencut-classic"
					>
						OpenCut
					</a>{" "}
					y{" "}
					<a
						className="underline"
						href="https://github.com/Anil-matcha/Open-Generative-AI"
					>
						Open Generative AI
					</a>
					.
				</span>
			</footer>
		</main>
	);
}
