"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clock, minutes, nachoApi } from "./nacho-api";

type Word = {
	start: number;
	end: number;
	word: string;
	estimated: boolean;
	kept: boolean;
};
type Segment = {
	index: number;
	start: number;
	end: number;
	text: string;
	state: "kept" | "partial" | "removed";
	words?: Word[];
};
type Stats = {
	original: number;
	montage: number;
	removedPercent: number;
	words: number;
	wordsPerMinute: number;
	speechPercent: number;
	longestPause: number;
	fillers: number;
};
type TranscriptView = {
	revision: number;
	manual: boolean;
	duration?: number;
	clips?: { start: number; end: number }[];
	segments: Segment[];
	stats?: Stats;
};
type Preview = {
	revision: number;
	items: { start: number; end: number; word?: string; gap?: number }[];
	seconds: number;
};
type Selection = { index: number; from: number; to: number };

/* ------------------------------- Proposal map ------------------------------ */

// The whole original recording as a strip: green is in the edit, dark is cut.
function ProposalMap({
	duration,
	clips,
	position,
	onSeek,
}: {
	duration: number;
	clips: { start: number; end: number }[];
	position: number | null;
	onSeek: (time: number) => void;
}) {
	if (!duration) return null;
	const x = (t: number) => (Math.max(0, Math.min(duration, t)) / duration) * 1000;
	return (
		<svg
			viewBox="0 0 1000 24"
			preserveAspectRatio="none"
			role="img"
			aria-label="Mapa del original: en verde lo que queda en el montaje"
			className="xeno-map h-7 w-full cursor-crosshair rounded-md bg-red-500/10"
			onClick={(e) => {
				const box = e.currentTarget.getBoundingClientRect();
				if (box.width) onSeek(((e.clientX - box.left) / box.width) * duration);
			}}
		>
			{clips.map((c) => (
				<rect
					key={`${c.start}-${c.end}`}
					x={x(c.start)}
					y={0}
					width={Math.max(1, x(c.end) - x(c.start))}
					height={24}
					className="fill-emerald-300/75"
				/>
			))}
			{position !== null ? (
				<rect x={x(position) - 1} y={0} width={3} height={24} className="fill-white" />
			) : null}
		</svg>
	);
}

function StatsLine({ stats }: { stats: Stats }) {
	const items = [
		`${minutes(stats.original)} → ${minutes(stats.montage)}`,
		`−${stats.removedPercent} %`,
		`${stats.wordsPerMinute} pal/min`,
		`voz ${stats.speechPercent} %`,
		`pausa máx. ${stats.longestPause.toFixed(1)} s`,
		`${stats.fillers} muletillas`,
	];
	return (
		<p className="flex flex-wrap gap-1 text-[11px]" aria-label="Estadísticas del montaje">
			{items.map((item) => (
				<span key={item} className="xeno-chip px-1.5 py-0.5 text-muted-foreground">
					{item}
				</span>
			))}
		</p>
	);
}

/* ------------------------------ Text editor ------------------------------- */

export function TranscriptEditor<P extends { id: string; revision: number }>({
	project,
	disabled,
	onUpdated,
	onError,
	onMessage,
}: {
	project: P;
	disabled: boolean;
	onUpdated: (project: P) => void;
	onError: (message: string) => void;
	onMessage: (message: string) => void;
}) {
	const [view, setView] = useState<TranscriptView | null>(null);
	const [query, setQuery] = useState("");
	const [fillers, setFillers] = useState<Preview | null>(null);
	const [pauses, setPauses] = useState<Preview | null>(null);
	const [maxPause, setMaxPause] = useState(0.7);
	const [busy, setBusy] = useState(false);
	const [playing, setPlaying] = useState<number | null>(null);
	const [position, setPosition] = useState<number | null>(null);
	const [expanded, setExpanded] = useState<number | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
	const [find, setFind] = useState("");
	const [replace, setReplace] = useState("");
	const [remember, setRemember] = useState(false);
	const audio = useRef<HTMLAudioElement | null>(null);
	const stopAt = useRef(0);
	useEffect(() => {
		let alive = true;
		setFillers(null);
		setPauses(null);
		setSelection(null);
		setEditing(null);
		nachoApi<unknown>(`/projects/${project.id}/transcript`)
			.then((result) => {
				const data = result as TranscriptView;
				if (alive && data && Array.isArray(data.segments)) setView(data);
			})
			.catch(() => {
				if (alive) setView(null);
			});
		return () => {
			alive = false;
		};
	}, [project.id, project.revision]);
	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		const segments = view?.segments || [];
		return q ? segments.filter((s) => s.text.toLowerCase().includes(q)) : segments;
	}, [view, query]);
	if (!view) return null;
	if (!view.segments.length)
		return (
			<p className="text-xs text-muted-foreground">
				Sin transcripción todavía. Pulsa «Detectar silencios y transcribir» para
				editar el vídeo como un documento: buscar frases, quitarlas o
				recuperarlas.
			</p>
		);
	async function run(fn: () => Promise<void>) {
		setBusy(true);
		onError("");
		try {
			await fn();
		} catch (e) {
			onError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}
	const post = (path: string, data: Record<string, unknown>) =>
		nachoApi<P>(`/projects/${project.id}/${path}`, {
			...data,
			revision: project.revision,
		});
	function playFrom(start: number, end: number, index: number | null) {
		const element = audio.current;
		if (!element) return;
		if (index !== null && playing === index) {
			element.pause();
			return;
		}
		stopAt.current = end;
		element.currentTime = start;
		setPlaying(index);
		void element.play().catch(() => setPlaying(null));
	}
	const off = disabled || busy;
	const removed = view.segments.filter((s) => s.state === "removed").length;
	return (
		<div className="space-y-2">
			<audio
				ref={audio}
				preload="none"
				src={`/nacho-api/projects/${project.id}/media`}
				onTimeUpdate={(e) => {
					setPosition(e.currentTarget.currentTime);
					if (e.currentTarget.currentTime >= stopAt.current) e.currentTarget.pause();
				}}
				onPause={() => {
					setPlaying(null);
					setPosition(null);
				}}
				className="hidden"
			/>
			{view.stats ? <StatsLine stats={view.stats} /> : null}
			<ProposalMap
				duration={view.duration || 0}
				clips={view.clips || []}
				position={position}
				onSeek={(time) => playFrom(time, time + 6, null)}
			/>
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="text-muted-foreground">
					{view.segments.length} frases · {removed} fuera del montaje
				</span>
				{["srt", "vtt", "txt"].map((format) => (
					<a
						key={format}
						className="rounded border px-2 py-0.5 hover:bg-accent"
						href={`/nacho-api/projects/${project.id}/subtitles?format=${format}`}
						download
					>
						{format === "txt" ? "Texto" : format.toUpperCase()}
					</a>
				))}
			</div>

			<div className="space-y-2 rounded border border-sky-400/20 bg-sky-400/5 p-2 text-xs">
				<p className="font-medium">Muletillas y repeticiones</p>
				{fillers ? (
					fillers.items.length ? (
						<>
							<p>
								{fillers.items.length} encontradas · {fillers.seconds} s:{" "}
								<span className="text-muted-foreground">
									{fillers.items
										.slice(0, 8)
										.map((f) => `«${(f.word || "").trim()}» ${clock(f.start)}`)
										.join(", ")}
									{fillers.items.length > 8 ? "…" : ""}
								</span>
							</p>
							<div className="flex gap-2">
								<Button
									size="sm"
									disabled={off || fillers.revision !== project.revision}
									onClick={() =>
										void run(async () => {
											onUpdated(await post("fillers", {}));
											setFillers(null);
											onMessage(
												`${fillers.items.length} muletillas quitadas de la propuesta. Añádela a la timeline o deshaz el cambio.`,
											);
										})
									}
								>
									Quitar {fillers.items.length}
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setFillers(null)}>
									Descartar
								</Button>
							</div>
						</>
					) : (
						<p className="text-muted-foreground">
							No quedan muletillas («eh», «mmm»…) ni palabras repetidas.
						</p>
					)
				) : (
					<Button
						size="sm"
						variant="outline"
						disabled={off}
						onClick={() =>
							void run(async () =>
								setFillers(await nachoApi<Preview>(`/projects/${project.id}/fillers`)),
							)
						}
					>
						Buscar muletillas
					</Button>
				)}
			</div>

			<div className="space-y-2 rounded border border-violet-400/20 bg-violet-400/5 p-2 text-xs">
				<p className="font-medium">Ritmo · acortar pausas largas</p>
				<label className="block">
					Pausas de más de {maxPause.toFixed(1)} s se dejan en 0,25 s
					<input
						type="range"
						aria-label="Pausa máxima"
						className="w-full"
						min="0.3"
						max="2"
						step="0.1"
						value={maxPause}
						onChange={(e) => {
							setMaxPause(Number(e.target.value));
							setPauses(null);
						}}
					/>
				</label>
				{pauses ? (
					pauses.items.length ? (
						<div className="flex flex-wrap items-center gap-2">
							<span>
								{pauses.items.length} pausas · ahorras {pauses.seconds} s
							</span>
							<Button
								size="sm"
								disabled={off || pauses.revision !== project.revision}
								onClick={() =>
									void run(async () => {
										onUpdated(await post("pauses", { max: maxPause, keep: 0.25 }));
										setPauses(null);
										onMessage(
											`${pauses.items.length} pausas acortadas (${pauses.seconds} s menos). Puedes deshacer el cambio.`,
										);
									})
								}
							>
								Acortar {pauses.items.length}
							</Button>
						</div>
					) : (
						<p className="text-muted-foreground">
							No hay pausas más largas de {maxPause.toFixed(1)} s.
						</p>
					)
				) : (
					<Button
						size="sm"
						variant="outline"
						disabled={off}
						onClick={() =>
							void run(async () =>
								setPauses(
									await nachoApi<Preview>(
										`/projects/${project.id}/pauses?max=${maxPause}&keep=0.25`,
									),
								),
							)
						}
					>
						Buscar pausas largas
					</Button>
				)}
			</div>

			<details className="rounded border p-2 text-xs">
				<summary className="cursor-pointer font-medium">
					Corregir palabras · buscar y reemplazar
				</summary>
				<div className="mt-2 space-y-2">
					<Input
						aria-label="Texto a buscar"
						placeholder="Palabra mal transcrita, p. ej. «open cut»"
						value={find}
						onChange={(e) => setFind(e.target.value)}
					/>
					<Input
						aria-label="Reemplazar por"
						placeholder="Texto correcto, p. ej. «OpenCut»"
						value={replace}
						onChange={(e) => setReplace(e.target.value)}
					/>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={remember}
							onChange={(e) => setRemember(e.target.checked)}
						/>
						Recordar para futuras transcripciones
					</label>
					<Button
						size="sm"
						variant="outline"
						disabled={off || !find.trim()}
						onClick={() =>
							void run(async () => {
								const updated = await post("replace", { find, replace, remember });
								onUpdated(updated);
								onMessage(
									(updated as P & { lastInstruction?: { explanation: string } })
										.lastInstruction?.explanation || "Texto reemplazado.",
								);
								setFind("");
								setReplace("");
							})
						}
					>
						Reemplazar en toda la transcripción
					</Button>
				</div>
			</details>

			<Input
				aria-label="Buscar en la transcripción"
				placeholder="Buscar una frase…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<ol className="max-h-96 space-y-1 overflow-y-auto pr-1" aria-label="Transcripción">
				{visible.map((segment) => {
					const words = segment.words || [];
					const isOpen = expanded === segment.index && words.length > 0;
					const picked =
						selection && selection.index === segment.index
							? words.slice(selection.from, selection.to + 1)
							: [];
					const pickable =
						picked.length > 0 &&
						picked.every((w) => !w.estimated) &&
						picked.some((w) => w.kept);
					return (
						<li
							key={segment.index}
							className={`rounded px-1.5 py-1 text-xs hover:bg-accent/50 ${
								segment.state === "removed" ? "opacity-50" : ""
							}`}
						>
							<div className="flex items-start gap-2">
								<button
									type="button"
									className="mt-0.5 shrink-0 font-mono text-[10px] text-sky-300 hover:underline"
									aria-label={`Escuchar la frase en ${clock(segment.start)}`}
									onClick={() => playFrom(segment.start, segment.end, segment.index)}
								>
									{playing === segment.index ? "■" : "▶"} {clock(segment.start)}
								</button>
								{editing?.index === segment.index ? (
									<div className="flex flex-1 flex-col gap-1">
										<Input
											aria-label="Texto corregido"
											value={editing.text}
											onChange={(e) =>
												setEditing({ index: segment.index, text: e.target.value })
											}
										/>
										<div className="flex gap-1">
											<Button
												size="sm"
												disabled={off || !editing.text.trim()}
												onClick={() =>
													void run(async () => {
														onUpdated(
															await post("text", {
																index: segment.index,
																text: editing.text,
															}),
														);
														setEditing(null);
														onMessage("Frase corregida. Los subtítulos usarán el nuevo texto.");
													})
												}
											>
												Guardar texto
											</Button>
											<Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
												Cancelar
											</Button>
										</div>
									</div>
								) : (
									<button
										type="button"
										className={`flex-1 text-left ${segment.state === "removed" ? "line-through" : ""}`}
										title="Ver palabras para quitar solo una parte"
										aria-expanded={isOpen}
										onClick={() => {
											setExpanded(isOpen ? null : segment.index);
											setSelection(null);
										}}
									>
										{segment.text}
										{segment.state === "partial" ? (
											<span
												className="ml-1 text-amber-300"
												title="Parte de la frase está fuera del montaje"
											>
												◐
											</span>
										) : null}
									</button>
								)}
								{editing?.index !== segment.index ? (
									<div className="flex shrink-0 gap-1">
										<button
											type="button"
											disabled={off}
											className="rounded border px-1.5 text-[10px] hover:bg-accent disabled:opacity-40"
											aria-label={`Corregir el texto: ${segment.text}`}
											onClick={() => setEditing({ index: segment.index, text: segment.text })}
										>
											✎
										</button>
										{segment.state !== "removed" ? (
											<button
												type="button"
												disabled={off}
												className="rounded border px-1.5 text-[10px] hover:bg-red-500/20 disabled:opacity-40"
												aria-label={`Quitar la frase: ${segment.text}`}
												onClick={() =>
													void run(async () =>
														onUpdated(await post("cut", { start: segment.start, end: segment.end })),
													)
												}
											>
												Quitar
											</button>
										) : null}
										{segment.state !== "kept" && !view.manual ? (
											<button
												type="button"
												disabled={off}
												className="rounded border px-1.5 text-[10px] hover:bg-emerald-500/20 disabled:opacity-40"
												aria-label={`Recuperar la frase: ${segment.text}`}
												onClick={() =>
													void run(async () =>
														onUpdated(
															await post("restore", { start: segment.start, end: segment.end }),
														),
													)
												}
											>
												Recuperar
											</button>
										) : null}
									</div>
								) : null}
							</div>
							{isOpen ? (
								<div className="mt-1 space-y-1 pl-12">
									<p className="flex flex-wrap gap-0.5" aria-label="Palabras de la frase">
										{words.map((w, i) => {
											const selected =
												selection?.index === segment.index &&
												i >= selection.from &&
												i <= selection.to;
											return (
												<button
													key={`${w.start}-${i}`}
													type="button"
													aria-pressed={selected}
													className={`rounded px-0.5 ${selected ? "bg-red-500/40" : "hover:bg-accent"} ${w.kept ? "" : "line-through opacity-50"}`}
													title={`${clock(w.start)}${w.estimated ? " · tiempo estimado" : ""}`}
													onClick={() =>
														setSelection((current) => {
															if (current?.index !== segment.index) return { index: segment.index, from: i, to: i };
															if (current.from === i && current.to === i) return null;
															return {
																index: segment.index,
																from: Math.min(current.from, i),
																to: Math.max(current.from, i),
															};
														})
													}
												>
													{w.word}
												</button>
											);
										})}
									</p>
									<p className="text-[10px] text-muted-foreground">
										Pulsa la primera y la última palabra para marcar un tramo.
									</p>
									{picked.length ? (
										<Button
											size="sm"
											variant="outline"
											disabled={off || !pickable}
											onClick={() =>
												void run(async () => {
													onUpdated(
														await post("cut", {
															start: picked[0].start,
															end: picked.at(-1)!.end,
														}),
													);
													setSelection(null);
												})
											}
										>
											{pickable
												? `Quitar ${picked.length} ${picked.length === 1 ? "palabra" : "palabras"}`
												: "Tiempos estimados: corrige o quita la frase entera"}
										</Button>
									) : null}
								</div>
							) : null}
						</li>
					);
				})}
				{!visible.length ? (
					<li className="text-xs text-muted-foreground">Ninguna frase coincide.</li>
				) : null}
			</ol>
		</div>
	);
}
