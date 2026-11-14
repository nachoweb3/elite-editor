"use client";

import { useEffect, useState } from "react";

type Word = { w: string; cut?: boolean };
const WORDS: Word[] = [
	{ w: "Hola" },
	{ w: "eh", cut: true },
	{ w: "bienvenidos" },
	{ w: "al" },
	{ w: "editor" },
	{ w: "hoy" },
	{ w: "vamos" },
	{ w: "a" },
	{ w: "vamos", cut: true },
	{ w: "a", cut: true },
	{ w: "probar" },
	{ w: "mmm", cut: true },
	{ w: "la" },
	{ w: "edición" },
	{ w: "por" },
	{ w: "texto" },
];
const CLIPS = [22, 14, 24, 18, 14];
const WAVE = Array.from({ length: 64 }, (_, i) => 22 + Math.round(Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)) * 70));
const STAGES = [
	{ time: "12,0 s", note: "Grabación original" },
	{ time: "11,1 s", note: "3 muletillas fuera" },
	{ time: "9,2 s", note: "−23 % · pausas acortadas" },
	{ time: "9,2 s", note: "Capítulos listos para YouTube" },
];

/** Illustrative mock of the editor: it replays the assistant workflow on a loop. */
export function HeroDemo({ children }: { children?: React.ReactNode }) {
	const [stage, setStage] = useState(0);
	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setStage(3);
			return;
		}
		const timer = setInterval(() => setStage((s) => (s + 1) % 4), 2600);
		return () => clearInterval(timer);
	}, []);
	const gap = stage >= 2 ? "0.5cqw" : "2.2cqw";
	return (
		<div className="lp-demo-stage">
			{children}
			<div className="lp-demo" role="img" aria-label="Maqueta animada de Elite Editor: la transcripción tacha muletillas, se acortan las pausas y aparecen los capítulos">
				<div className="lp-bar" aria-hidden>
					<span className="lp-dot" />
					<span className="lp-dot" />
					<span className="lp-dot" />
					<b>Elite Editor — mi primer vídeo</b>
					<span className="live">
						<span className="xeno-dot" data-live="true" style={{ width: "1.2cqw", height: "1.2cqw" }} />
						LOCAL
					</span>
				</div>
				<div className="lp-body" aria-hidden>
					<div className="lp-rail">
						<i />
						<i className="on" />
						<i />
						<i />
						<i />
					</div>
					<div className="lp-panel">
						<h4>Editar por texto</h4>
						<p className="lp-text">
							{WORDS.map((word, i) => (
								<span key={i} data-cut={stage >= 1 && !!word.cut}>
									{word.w}
								</span>
							))}
						</p>
						<div className="lp-pills">
							<span className="lp-pill" data-on={stage >= 1}>
								Muletillas
							</span>
							<span className="lp-pill" data-on={stage >= 2}>
								Pausas
							</span>
							<span className="lp-pill" data-on={stage >= 3}>
								Capítulos
							</span>
						</div>
						<div className="lp-chapters" data-on={stage >= 3}>
							<div>
								<b>0:00</b>Bienvenidos al editor
							</div>
							<div>
								<b>0:04</b>Probamos la edición por texto
							</div>
						</div>
					</div>
					<div>
						<div className="lp-preview">
							<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
								<circle cx="124" cy="26" r="15" fill="#ffd9a0" opacity=".9" />
								<path d="M0 66 L28 44 L52 62 L84 34 L118 64 L160 40 V90 H0Z" fill="#0a1f44" opacity=".9" />
								<path d="M0 78 L36 58 L70 74 L106 52 L160 76 V90 H0Z" fill="#06142e" />
							</svg>
							<div className="lp-stat">
								{STAGES[stage].time} · {STAGES[stage].note}
							</div>
							<div className="lp-caption">hoy vamos a probar la edición por texto</div>
						</div>
					</div>
				</div>
				<div className="lp-timeline" aria-hidden>
					<div className="lp-ruler">
						<span>0:00</span>
						<span>0:03</span>
						<span>0:06</span>
						<span>0:09</span>
					</div>
					<div className="lp-track" style={{ "--g": gap } as React.CSSProperties}>
						{CLIPS.map((w, i) => (
							<div key={i} className="lp-clip" style={{ "--w": w } as React.CSSProperties} />
						))}
					</div>
					<div className="lp-track cap" style={{ "--g": gap } as React.CSSProperties}>
						{CLIPS.map((w, i) => (
							<div key={i} className="lp-clip" style={{ "--w": w } as React.CSSProperties} />
						))}
					</div>
					<div className="lp-wave">
						{WAVE.map((h, i) => (
							<i key={i} style={{ "--h": `${h}%` } as React.CSSProperties} />
						))}
					</div>
					<span className="lp-playhead" />
				</div>
			</div>
			<p className="lp-note">Maqueta ilustrativa del flujo del asistente</p>
		</div>
	);
}
