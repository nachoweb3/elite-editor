"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import {
	buildElementFromMedia,
	buildTextElement,
} from "@/timeline/element-utils";
import { TracksSnapshotCommand } from "@/commands/timeline/tracks-snapshot";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { VideoElement, TextElement } from "@/timeline";
import {
	EngineStatus,
	JobStatus,
	TranscriptEditor,
	nachoApi,
	type Job,
} from "./nacho-assistant-parts";
import {
	ExportPanel,
	PublishPanel,
	ReviewGate,
	ThumbnailPanel,
} from "./nacho-publish";
import { CreatorTools, LutPicker } from "./nacho-creator";

type Project = {
	id: string;
	name: string;
	reviewed?: boolean;
	media?: { duration: number };
	blank?: boolean;
	revision: number;
	settings: Record<string, number | string | boolean>;
	clips: { enabled: boolean; start: number; end: number }[];
	jobs: Job[];
	transcriptSegments?: number;
	lastInstruction?: { prompt: string; explanation: string; engine?: string };
	stickmen?: {
		enabled: boolean;
		mode: "overlay" | "cut";
		warning?: string;
		note?: string;
		items: {
			id: string;
			concept: string;
			caption: string;
			at: number;
			duration: number;
		}[];
	};
	artifacts: Record<string, unknown> & {
		enhancedSource?: { key: string; revision: number };
	};
};
type Manifest = {
	revision: number;
	sourceUrl: string;
	sourceDuration: number;
	clips: { name: string; start: number; end: number; at: number }[];
	captions: { start: number; end: number; text: string }[];
	limitations: string[];
};
const seconds = (value: number) => mediaTimeFromSeconds({ seconds: value });
type PromptPlan = {
	planId: string;
	explanation: string;
	changes: {
		key: string;
		label: string;
		before: unknown;
		after: unknown;
		extra: boolean;
	}[];
	cuts: { seconds: number; pieces: number; extra: boolean };
	engine?: "rules" | "ollama";
	fallbackReason?: string;
	projectId: string;
	revision: number;
	prompt: string;
};
const api = nachoApi;
const faceControls = [
	["faceSmooth", "Suavidad de piel"],
	["faceLight", "Luz del rostro"],
	["faceUnderEyes", "Ojeras"],
	["faceEyes", "Detalle de ojos"],
	["faceTeeth", "Blanqueado dental"],
	["faceJaw", "Contorno facial"],
	["faceWrinkles", "Suavizar arrugas y líneas"],
	["faceTexture", "Detalle de piel"],
	["faceWarmth", "Temperatura de piel · fría / cálida"],
	["faceLipColor", "Intensidad del color de labios"],
	["faceEyeSize", "Tamaño de ojos · reducir / ampliar"],
	["faceNoseSize", "Tamaño de nariz · reducir / ampliar"],
	["faceMouthSize", "Tamaño de boca · reducir / ampliar"],
	["faceWidth", "Anchura facial · estrechar / ampliar"],
] as const;

export function NachoAssistant() {
	const editor = useEditor();
	const activeId = useEditor((e) => e.project.getActive()?.metadata.id);
	const [projects, setProjects] = useState<Project[]>([]),
		[selected, setSelected] = useState(""),
		[project, setProject] = useState<Project | null>(null);
	const [working, setWorking] = useState(false),
		[error, setError] = useState(""),
		[message, setMessage] = useState(""),
		[prompt, setPrompt] = useState("");
	const [face, setFace] = useState<Record<string, number | string | boolean>>(
			{},
		),
		[showPreview, setShowPreview] = useState(false);
	const generation = useRef(0);
	// Polls immediately (e.g. right after queueing or cancelling a job) without resetting the panel.
	const wake = useRef<() => void>(() => {});
	const [plan, setPlan] = useState<PromptPlan | null>(null);
	// Short-form videos read better with fewer words per caption; remembered per browser.
	const [captionWords, setCaptionWords] = useState(5);
	useEffect(() => {
		try {
			const saved = Number(localStorage.getItem("elite-caption-words"));
			if ([1, 2, 3, 5].includes(saved)) setCaptionWords(saved);
		} catch {}
	}, []);
	const planIsCurrent =
		plan &&
		plan.projectId === project?.id &&
		plan.revision === project?.revision &&
		plan.prompt === prompt;
	useEffect(() => {
		try {
			setSelected(
				activeId ? localStorage.getItem("nacho-source:" + activeId) || "" : "",
			);
		} catch {
			setSelected("");
		}
	}, [activeId]);
	useEffect(() => {
		let alive = true;
		api<Project[]>("/projects")
			.then((items) => {
				if (alive) setProjects(items.filter((p) => !p.blank));
			})
			.catch((e) => {
				if (alive) setError(e.message);
			});
		return () => {
			alive = false;
		};
	}, []);
	useEffect(() => {
		generation.current++;
		setProject(null);
		setShowPreview(false);
		setMessage("");
		setError("");
		if (!selected) return;
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				const p = await api<Project>("/projects/" + selected + "?lite=1");
				if (alive) {
					setProject(p);
					// Fast while the engine works, relaxed when idle.
					const live = p.jobs?.some((j) =>
						["queued", "running"].includes(j.status),
					);
					timer = setTimeout(poll, live ? 1200 : 6000);
				}
			} catch (e) {
				if (alive) {
					setError((e as Error).message);
					timer = setTimeout(poll, 5000);
				}
			}
		}
		wake.current = () => {
			clearTimeout(timer);
			void poll();
		};
		void poll();
		return () => {
			alive = false;
			clearTimeout(timer);
			wake.current = () => {};
		};
	}, [selected, activeId]);
	useEffect(() => {
		if (project) setFace(project.settings);
	}, [project?.id, project?.revision]);
	const running =
		project?.jobs.some((j) => ["queued", "running"].includes(j.status)) ??
		false;
	const disabled = working || running;
	async function act(fn: () => Promise<void>) {
		setWorking(true);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setWorking(false);
		}
	}
	async function job(type: string) {
		if (!project) return;
		await api("/projects/" + project.id + "/job", { type });
		wake.current();
		setShowPreview(false);
		setMessage("Trabajo enviado. El progreso aparece aquí.");
	}
	async function previewPlan() {
		if (!project) return;
		const epoch = generation.current;
		setPlan(null);
		const result = await api<PromptPlan>("/projects/" + project.id + "/plan", {
			prompt,
			revision: project.revision,
		});
		if (epoch !== generation.current) return;
		setPlan({
			...result,
			projectId: project.id,
			revision: project.revision,
			prompt,
		});
	}
	async function upload(file: File) {
		const session = await api<{ token: string }>("/session");
		const r = await fetch(
			"/nacho-api/upload?kind=video&name=" + encodeURIComponent(file.name),
			{
				method: "POST",
				headers: { "x-studio-token": session.token },
				body: file,
			},
		);
		const p = await r.json();
		if (!r.ok) throw Error(p.error);
		setProjects((old) => [p, ...old]);
		setSelected(p.id);
		if (activeId) {
			try {
				localStorage.setItem("nacho-source:" + activeId, p.id);
			} catch {}
		}
	}
	// Saves every staged finishing control (retouch, voice, look, loudness target) in one go.
	async function saveFinish() {
		if (!project) return;
		const epoch = generation.current;
		const updated = await api<Project>("/projects/" + project.id + "/portrait", {
			revision: project.revision,
			settings: face,
		});
		if (epoch !== generation.current) return;
		setProject(updated);
		setShowPreview(false);
		setMessage(
			"Ajustes guardados. Prepara el original mejorado para aplicarlos a tu timeline.",
		);
	}
	async function updateStickman(data: Record<string, unknown>) {
		if (!project) return;
		const epoch = generation.current;
		const updated = await api<Project>(
			"/projects/" + project.id + "/stickman",
			{ ...data, revision: project.revision },
		);
		if (epoch !== generation.current) return;
		setProject(updated);
		setShowPreview(false);
	}
	async function importCuts() {
		if (!project || !activeId) return;
		const projectId = activeId,
			epoch = generation.current,
			sceneId = editor.scenes.getActiveScene().id;
		const manifest = await api<Manifest>(
			"/projects/" +
				project.id +
				"/opencut" +
				(captionWords !== 5 ? `?words=${captionWords}` : ""),
		);
		const marker = `nacho-${project.id}.mp4`;
		let asset = editor.media.getAssets().find((a) => a.name === marker);
		if (!asset) {
			setMessage("Preparando el original para la timeline…");
			const response = await fetch(manifest.sourceUrl);
			if (!response.ok) throw Error("No se pudo leer el original");
			const blob = await response.blob();
			const files = await processMediaAssets({
				files: [new File([blob], marker, { type: blob.type })],
			});
			if (
				generation.current !== epoch ||
				editor.project.getActive()?.metadata.id !== projectId
			)
				throw Error("Has cambiado de proyecto. Vuelve a aplicar la propuesta.");
			const prepared = files.find((a) => a.type === "video");
			if (!prepared)
				throw Error("Formato de vídeo no compatible con este navegador");
			asset =
				(await editor.media.addMediaAsset({ projectId, asset: prepared })) ??
				undefined;
			if (!asset)
				throw Error("No hay espacio para guardar el vídeo en el navegador");
		}
		if (
			generation.current !== epoch ||
			editor.project.getActive()?.metadata.id !== projectId ||
			editor.scenes.getActiveScene().id !== sceneId
		)
			throw Error(
				"Has cambiado de proyecto o escena. Vuelve a aplicar la propuesta.",
			);
		const before = editor.scenes.getActiveScene().tracks;
		// Append to preserve all existing manual work; one native undo removes this import.
		const offset = Math.max(
			0,
			...[before.main, ...before.overlay, ...before.audio].flatMap((t) =>
				t.elements.map(
					(e) =>
						mediaTimeToSeconds({ time: e.startTime }) +
						mediaTimeToSeconds({ time: e.duration }),
				),
			),
		);
		const elements = manifest.clips.map(
			(c) =>
				({
					...buildElementFromMedia({
						mediaId: asset!.id,
						mediaType: "video",
						name: c.name,
						duration: seconds(manifest.sourceDuration),
						startTime: seconds(offset + c.at),
					}),
					id: crypto.randomUUID(),
					duration: seconds(c.end - c.start),
					trimStart: seconds(c.start),
					trimEnd: seconds(manifest.sourceDuration - c.end),
				}) as VideoElement,
		);
		const height =
				editor.project.getActive()?.settings.canvasSize.height || 1080,
			width = editor.project.getActive()?.settings.canvasSize.width || 1920;
		// Text size is relative to canvas height (1 unit = height / 90 px). Fit each cue
		// within ~90 % of the width so long lines never spill off a vertical canvas.
		const captionSize = (text: string) =>
			Math.round(
				Math.max(
					2.2,
					Math.min(6, (0.9 * width * 90) / (Math.max(8, text.length) * 0.56 * height)),
				) * 10,
			) / 10;
		const captions = manifest.captions.map(
			(c) =>
				({
					...buildTextElement({
						raw: {
							name: c.text,
							duration: seconds(c.end - c.start),
							params: {
								content: c.text,
								fontSize: captionSize(c.text),
								fontWeight: "bold",
								"background.enabled": true,
								"background.color": "#111827",
								"background.paddingX": 16,
								"background.paddingY": 8,
								"background.cornerRadius": 8,
								// Canvas Y grows downwards: honour the project's caption position.
								"transform.positionY":
									(project.settings.subtitlePosition === "top" ? -1 : 1) *
									height *
									0.38,
							},
						},
						startTime: seconds(offset + c.start),
					}),
					id: crypto.randomUUID(),
				}) as TextElement,
		);
		editor.command.execute({
			command: new TracksSnapshotCommand({
				before,
				after: {
					...before,
					main: {
						...before.main,
						elements: [...before.main.elements, ...elements],
					},
					overlay: captions.length
						? [
								{
									id: crypto.randomUUID(),
									type: "text",
									name: "Subtítulos IA",
									hidden: false,
									elements: captions,
								},
								...before.overlay,
							]
						: before.overlay,
				},
			}),
		});
		setMessage(
			`${elements.length} cortes y ${captions.length} subtítulos añadidos al final. Puedes moverlos, recortarlos y deshacer. ${manifest.limitations.join(" ")}`,
		);
	}
	async function saveCuts() {
		if (!project) return;
		const tracks = editor.scenes.getActiveScene().tracks,
			assets = editor.media.getAssets();
		const elements = [...tracks.main.elements].sort(
			(a, b) => a.startTime - b.startTime,
		);
		if (!elements.length) throw Error("La pista principal está vacía");
		let at = 0;
		const clips = elements.map((e) => {
			if (
				e.type !== "video" ||
				!isLinkedSource(assets.find((a) => a.id === e.mediaId)?.name) ||
				(e.retime && e.retime.rate !== 1)
			)
				throw Error(
					"Para enviar cortes al motor usa solo el original vinculado, a velocidad normal, en la pista principal",
				);
			const start = mediaTimeToSeconds({ time: e.trimStart }),
				duration = mediaTimeToSeconds({ time: e.duration });
			if (Math.abs(mediaTimeToSeconds({ time: e.startTime }) - at) > 0.002)
				throw Error(
					"El motor necesita cortes consecutivos, sin huecos ni solapes",
				);
			at += duration;
			return {
				id: e.id,
				start,
				end: start + duration,
				enabled: true,
				reason: "Edición manual en OpenCut",
			};
		});
		const updated = await api<Project>("/projects/" + project.id + "/manual", {
			revision: project.revision,
			clips: clips.map((c) => ({ ...c, sourceId: project.id })),
			settings: project.settings,
		});
		setProject(updated);
		setShowPreview(false);
		setMessage(
			"Cortes guardados en el motor. La previsualización procesada usa estos cortes; los textos, efectos y pistas adicionales de OpenCut se exportan con su botón Exportar.",
		);
	}

	function isLinkedSource(name?: string) {
		return (
			!!project &&
			(name === `nacho-${project.id}.mp4` ||
				!!name?.startsWith(`nacho-${project.id}-enhanced-`))
		);
	}
	async function applySource(enhanced: boolean) {
		if (!project || !activeId) return;
		const projectId = activeId,
			sceneId = editor.scenes.getActiveScene().id,
			epoch = generation.current;
		const artifact = project.artifacts.enhancedSource;
		if (enhanced && (!artifact || artifact.revision !== project.revision))
			throw Error("Prepara primero el original con los ajustes guardados");
		const marker = enhanced
			? `nacho-${project.id}-enhanced-${artifact!.key}.mp4`
			: `nacho-${project.id}.mp4`;
		const hasLinked = () =>
			[
				editor.scenes.getActiveScene().tracks.main,
				...editor.scenes.getActiveScene().tracks.overlay,
				...editor.scenes.getActiveScene().tracks.audio,
			].some((t) =>
				t.elements.some(
					(e) =>
						"mediaId" in e &&
						isLinkedSource(
							editor.media.getAssets().find((a) => a.id === e.mediaId)?.name,
						),
				),
			);
		if (!hasLinked())
			throw Error("Añade primero los cortes de esta grabación a la timeline");
		let asset = editor.media.getAssets().find((a) => a.name === marker);
		if (!asset) {
			setMessage("Preparando el vídeo para la timeline…");
			const url = enhanced
				? `/nacho-api/projects/${project.id}/artifact?type=enhancedSource`
				: `/nacho-api/projects/${project.id}/media`;
			const response = await fetch(url);
			if (!response.ok) throw Error("No se pudo leer el vídeo");
			const blob = await response.blob();
			const files = await processMediaAssets({
				files: [new File([blob], marker, { type: blob.type })],
			});
			if (
				generation.current !== epoch ||
				editor.project.getActive()?.metadata.id !== projectId ||
				editor.scenes.getActiveScene().id !== sceneId
			)
				throw Error(
					"Has cambiado de proyecto o escena; vuelve a aplicar la mejora",
				);
			const prepared = files.find((f) => f.type === "video");
			if (!prepared) throw Error("El navegador no puede leer este vídeo");
			asset =
				(await editor.media.addMediaAsset({ projectId, asset: prepared })) ??
				undefined;
			if (!asset) throw Error("No se pudo guardar el vídeo en el navegador");
		}
		if (
			generation.current !== epoch ||
			editor.project.getActive()?.metadata.id !== projectId ||
			editor.scenes.getActiveScene().id !== sceneId
		)
			throw Error(
				"Has cambiado de proyecto o escena; vuelve a aplicar la mejora",
			);
		const tracks = editor.scenes.getActiveScene().tracks;
		const updates = [tracks.main, ...tracks.overlay, ...tracks.audio].flatMap(
			(t) =>
				t.elements.flatMap((e) =>
					"mediaId" in e &&
					isLinkedSource(
						editor.media.getAssets().find((a) => a.id === e.mediaId)?.name,
					) &&
					e.mediaId !== asset!.id
						? [
								{
									trackId: t.id,
									elementId: e.id,
									patch: { mediaId: asset!.id },
								},
							]
						: [],
				),
		);
		if (!updates.length) {
			setMessage("La fuente seleccionada ya está aplicada.");
			return;
		}
		editor.timeline.updateElements({ updates });
		setMessage(
			`${updates.length} clips usan ${enhanced ? "el vídeo retocado y su audio procesado" : "el original"}. Se conservan cortes, textos, efectos y capas. Exporta la timeline con Exportar. Puedes deshacer este cambio.`,
		);
	}
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
			<div className="flex items-center gap-3">
				<span
					className="xeno-orbit"
					data-busy={working || running}
					aria-hidden
				/>
				<div className="min-w-0">
					<p className="xeno-kicker">Sistema local · sin nube</p>
					<h2 className="xeno-holo-text text-base font-semibold tracking-wide">
						Asistente IA
					</h2>
					<p className="text-muted-foreground text-xs">
						Analiza, monta, limpia y publica desde este editor.
					</p>
				</div>
			</div>
			<EngineStatus />
			<label className="flex flex-col gap-2">
				Grabación original
				<select
					aria-label="Grabación original"
					className="rounded border bg-background p-2"
					disabled={working}
					value={selected}
					onChange={(e) => {
						setSelected(e.target.value);
						if (activeId)
							try {
								localStorage.setItem(
									"nacho-source:" + activeId,
									e.target.value,
								);
							} catch {}
					}}
				>
					<option value="">Selecciona tu vídeo…</option>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</label>
			<label className="flex flex-col gap-2 text-xs">
				O sube un MP4
				<Input
					aria-label="Subir grabación"
					type="file"
					accept="video/mp4,video/webm,video/quicktime"
					disabled={working}
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) void act(() => upload(file));
						e.target.value = "";
					}}
				/>
			</label>
			{error ? (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-xs text-muted-foreground">
					{message}
				</p>
			) : null}
			{project ? (
				<>
					<section className="xeno-card space-y-2 p-3">
						<h3 className="xeno-heading" data-index="01">Analizar y proponer</h3>
						<Button
							disabled={disabled}
							onClick={() => void act(() => job("analyze"))}
						>
							Detectar silencios y transcribir
						</Button>
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() => void act(() => job("auto-review"))}
						>
							Montaje automático + previsualización
						</Button>
						{project.jobs.at(-1) ? (
							<JobStatus
								projectId={project.id}
								job={project.jobs.at(-1)!}
								onChanged={() => wake.current()}
							/>
						) : null}
						<ReviewGate
							project={project}
							disabled={disabled}
							onUpdated={setProject}
							onError={setError}
							onMessage={setMessage}
						/>
					</section>
					<section className="xeno-card space-y-2 p-3">
						<h3 className="xeno-heading" data-index="02">Llevar a la timeline</h3>
						<p className="text-xs text-muted-foreground">
							{project.clips.filter((c) => c.enabled).length} cortes activos. Se
							añaden al final y se pueden deshacer.
						</p>
						<label className="flex items-center justify-between gap-2 text-xs">
							Palabras por subtítulo
							<select
								aria-label="Palabras por subtítulo"
								className="rounded border bg-background p-1.5"
								value={captionWords}
								onChange={(e) => {
									const value = Number(e.target.value);
									setCaptionWords(value);
									try {
										localStorage.setItem("elite-caption-words", String(value));
									} catch {}
								}}
							>
								<option value={5}>Frases · hasta 5</option>
								<option value={3}>Ágil · 3</option>
								<option value={2}>Dinámico · 2</option>
								<option value={1}>Palabra a palabra · 1</option>
							</select>
						</label>
						<Button disabled={disabled} onClick={() => void act(importCuts)}>
							Añadir cortes y subtítulos a la timeline
						</Button>
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() => void act(saveCuts)}
						>
							Enviar mis cortes al motor
						</Button>
					</section>
					<section className="xeno-card space-y-2 p-3">
						<h3 className="xeno-heading" data-index="03">Editar por texto</h3>
						<p className="text-xs text-muted-foreground">
							Lee la transcripción, escucha cada frase y quítala o recupérala de
							la propuesta. Después añádela a la timeline.
						</p>
						<TranscriptEditor
							project={project}
							disabled={disabled}
							onUpdated={(updated) => {
								setProject(updated);
								setShowPreview(false);
							}}
							onError={setError}
							onMessage={setMessage}
						/>
					</section>
					<section className="xeno-card space-y-2 p-3">
						<h3 className="xeno-heading" data-index="04">Instrucciones</h3>
						<Input
							aria-label="Instrucción de edición"
							placeholder="Por ejemplo: elimina los primeros 5 segundos"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !disabled && prompt.trim().length >= 3)
									void act(previewPlan);
							}}
						/>
						<div className="flex flex-wrap gap-1" aria-label="Ejemplos de instrucciones">
							{[
								"Quita los primeros 5 segundos",
								"Sube un poco el contraste",
								"Formato vertical para TikTok",
								"Subtítulos estilo viral",
								"Ilumina mi cara",
								"Hazlo más dinámico",
							].map((example) => (
								<button
									key={example}
									type="button"
									className="xeno-chip px-2 py-0.5 text-muted-foreground"
									onClick={() => {
										setPrompt(example);
										setPlan(null);
									}}
								>
									{example}
								</button>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							Describe ajustes de voz, luz, color, formato o cortes del original.
							Pulsa Intro para ver la propuesta antes de aplicarla.
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								disabled={disabled || prompt.trim().length < 3}
								onClick={() =>
									void act(async () => {
										const epoch = generation.current;
										const result = await api<{
											instruction: string;
											notes: string;
										}>("/projects/" + project.id + "/enhance", {
											prompt,
											revision: project.revision,
										});
										if (epoch !== generation.current) return;
										setPrompt(result.instruction);
										setPlan(null);
										setMessage(result.notes);
									})
								}
							>
								Mejorar instrucción
							</Button>
							<Button
								variant="outline"
								disabled={disabled || prompt.trim().length < 3}
								onClick={() => void act(previewPlan)}
							>
								Ver qué cambiaría
							</Button>
						</div>
						{planIsCurrent && plan ? (
							<div
								className="space-y-2 rounded border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs"
								aria-live="polite"
							>
								<p className="flex flex-wrap items-center gap-2">
									<span
										className={`rounded-full border px-2 py-0.5 text-[10px] ${plan.engine === "rules" ? "border-sky-400/40 text-sky-300" : "border-violet-400/40 text-violet-300"}`}
									>
										{plan.engine === "rules"
											? "Reglas locales · exactas"
											: "IA local (Ollama)"}
									</span>
									<span>{plan.explanation}</span>
								</p>
								{plan.fallbackReason ? (
									<p className="text-amber-300">{plan.fallbackReason}</p>
								) : null}
								<ul className="space-y-1">
									{plan.changes.map((change) => (
										<li key={change.key}>
											{change.label}: {String(change.before)} →{" "}
											{String(change.after)}
											{change.extra
												? " · Revisa: no lo pediste explícitamente"
												: ""}
										</li>
									))}
								</ul>
								<p>
									Recorte: {plan.cuts.seconds} s en {plan.cuts.pieces}{" "}
									intervalos.
									{plan.cuts.extra
										? " Revisa este recorte: no lo pediste explícitamente."
										: ""}
								</p>
								<p>
									Se actualizará la propuesta del motor. La timeline se conserva
									hasta que añadas los cortes.
								</p>
							</div>
						) : null}
						<Button
							variant="outline"
							disabled={disabled || !planIsCurrent}
							onClick={() =>
								void act(async () => {
									if (!planIsCurrent || !plan) return;
									const epoch = generation.current;
									const updated = await api<Project>(
										"/projects/" + project.id + "/prompt",
										{ prompt, revision: project.revision, planId: plan.planId },
									);
									if (epoch !== generation.current) return;
									setProject(updated);
									setPlan(null);
									setMessage(
										"Propuesta actualizada. Añádela a la timeline para editarla.",
									);
								})
							}
						>
							Aplicar a la propuesta IA
						</Button>
						{project.lastInstruction ? (
							<div className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed p-2 text-xs">
								<span className="text-muted-foreground">
									Último cambio: {project.lastInstruction.explanation}
								</span>
								<Button
									size="sm"
									variant="ghost"
									disabled={disabled}
									onClick={() =>
										void act(async () => {
											const epoch = generation.current;
											const updated = await api<Project>(
												"/projects/" + project.id + "/undo",
												{},
											);
											if (epoch !== generation.current) return;
											setProject(updated);
											setPlan(null);
											setShowPreview(false);
											setMessage("Cambio deshecho en la propuesta.");
										})
									}
								>
									Deshacer
								</Button>
							</div>
						) : null}
					</section>
					<section className="xeno-card space-y-3 p-3">
						<h3 className="xeno-heading" data-index="05">Explicar con stickman</h3>
						<p className="text-xs text-muted-foreground">
							Busca conceptos en la transcripción y crea ilustraciones animadas
							localmente. Revisa las ideas antes de renderizar.
						</p>
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() => void act(() => job("stickman"))}
						>
							Detectar conceptos
						</Button>
						{project.stickmen ? (
							<>
								{project.stickmen.warning ? (
									<p className="text-xs text-amber-300">
										{project.stickmen.warning}
									</p>
								) : null}
								{project.stickmen.note ? (
									<p className="text-xs text-muted-foreground">
										{project.stickmen.note}
									</p>
								) : null}
								<label className="flex items-center gap-2 text-xs">
									<input
										type="checkbox"
										disabled={disabled || !project.stickmen.items.length}
										checked={project.stickmen.enabled}
										onChange={(e) =>
											void act(() =>
												updateStickman({
													action: "enable",
													enabled: e.target.checked,
												}),
											)
										}
									/>
									Incluir explicaciones
								</label>
								<label className="flex flex-col gap-2 text-xs">
									Cómo aparecen
									<select
										className="rounded border bg-background p-2"
										disabled={disabled}
										value={project.stickmen.mode}
										onChange={(e) =>
											void act(() =>
												updateStickman({
													action: "mode",
													mode: e.target.value,
												}),
											)
										}
									>
										<option value="overlay">
											Sobre el vídeo · conserva duración y voz
										</option>
										<option value="cut">Intercalar · alarga el montaje</option>
									</select>
								</label>
								{project.stickmen.mode === "cut" ? (
									<p className="text-xs text-amber-300">
										Los clips intercalados tendrán silencio si no tienen voz
										propia. Revisa el ritmo en la previa.
									</p>
								) : null}
								<ul className="space-y-2">
									{project.stickmen.items.map((item) => (
										<li key={item.id} className="rounded border p-2 text-xs">
											<p className="font-medium">{item.concept}</p>
											<p className="text-muted-foreground">{item.caption}</p>
											<p>
												Original: {item.at.toFixed(1)} s · {item.duration} s
											</p>
											<Button
												variant="ghost"
												size="sm"
												disabled={disabled}
												aria-label={"Quitar explicación: " + item.concept}
												onClick={() =>
													void act(() =>
														updateStickman({
															action: "remove",
															itemId: item.id,
														}),
													)
												}
											>
												Quitar
											</Button>
										</li>
									))}
								</ul>
								<Button
									disabled={
										disabled ||
										!project.stickmen.enabled ||
										!project.stickmen.items.length
									}
									onClick={() => void act(() => job("rerender"))}
								>
									Generar vídeo con explicaciones
								</Button>
								<p className="text-xs text-muted-foreground">
									Se compone en el render del motor. Desde Biblioteca puedes
									importar el vídeo terminado; estas ilustraciones aún no se
									transfieren como capas editables.
								</p>
							</>
						) : null}
					</section>
					<section className="xeno-card space-y-3 p-3">
						<h3 className="xeno-heading" data-index="06">Acabado de vídeo, voz y belleza</h3>
						<p className="text-xs text-muted-foreground">
							Ajusta manualmente, guarda y prepara el original mejorado. Después
							aplícalo a tu timeline. Compara con el original; no se modifica tu
							archivo de entrada.
						</p>
						<div className="flex flex-wrap gap-2">
							{[
								["Natural", 0.16, 0.1, 0.08, 0],
								["Luz suave", 0.2, 0.25, 0.15, 0],
								["Piel suave", 0.35, 0.12, 0.15, 0.25],
								["Detalle", 0.08, 0.08, 0.05, 0],
							].map(([label, smooth, light, under, wrinkles]) => (
								<Button
									key={label}
									variant="outline"
									size="sm"
									disabled={disabled}
									onClick={() =>
										setFace((v) => ({
											...v,
											faceRetouch: true,
											...Object.fromEntries(faceControls.map(([k]) => [k, 0])),
											faceSmooth: Number(smooth),
											faceLight: Number(light),
											faceUnderEyes: Number(under),
											faceWrinkles: Number(wrinkles),
											faceTexture: label === "Detalle" ? 0.25 : 0,
										}))
									}
								>
									{label}
								</Button>
							))}
						</div>
						<label className="flex gap-2">
							<input
								type="checkbox"
								checked={face.faceRetouch === true}
								onChange={(e) =>
									setFace((v) => ({ ...v, faceRetouch: e.target.checked }))
								}
							/>
							Activar retoque
						</label>
						<label className="flex gap-2">
							<input
								type="checkbox"
								checked={face.cleanAudio === true}
								onChange={(e) =>
									setFace((v) => ({ ...v, cleanAudio: e.target.checked }))
								}
							/>
							Limpiar ruido y normalizar voz
						</label>
						<details className="xeno-card space-y-3 p-3" open>
							<summary className="cursor-pointer text-xs font-medium">
								Limpieza manual de vídeo y audio
							</summary>
							{(
								[
									["videoDenoise", "Reducir ruido de vídeo", 0, 1, 0.05, 0],
									["videoSharpen", "Nitidez de vídeo", 0, 1, 0.05, 0],
									[
										"audioNoiseReduction",
										"Reducción de ruido de voz · dB",
										0,
										30,
										1,
										12,
									],
									[
										"audioHighpass",
										"Filtro de graves · Hz (0 desactiva)",
										0,
										200,
										5,
										75,
									],
								] as const
							).map(([key, label, min, max, step, fallback]) => (
								<label key={key} className="block text-xs">
									{label} ·{" "}
									{Number(face[key] ?? fallback).toFixed(max === 1 ? 2 : 0)}
									<input
										type="range"
										aria-label={label}
										className="w-full"
										min={min}
										max={max}
										step={step}
										value={Number(face[key] ?? fallback)}
										onChange={(e) =>
											setFace((v) => ({ ...v, [key]: Number(e.target.value) }))
										}
									/>
								</label>
							))}
							<label className="flex gap-2 text-xs">
								<input
									type="checkbox"
									checked={face.audioNormalize !== false}
									onChange={(e) =>
										setFace((v) => ({ ...v, audioNormalize: e.target.checked }))
									}
								/>
								Normalizar voz a{" "}
								{String(face.audioTargetLufs ?? -16).replace("-", "−")} LUFS
							</label>
							<p className="text-xs text-muted-foreground">
								Los controles de voz requieren activar Limpiar ruido y
								normalizar voz. La reducción de ruido de vídeo es un filtro
								clásico; no reconstruye detalle perdido con IA. Mucha reducción
								puede suavizar texturas y movimiento.
							</p>
						</details>
						<p className="text-xs font-medium">
							Belleza · cero mantiene el rasgo original
						</p>
						{faceControls.map(([key, label]) => (
							<label key={key} className="block text-xs">
								{label} · {Math.round(Number(face[key] || 0) * 100)} %
								<input
									className="w-full"
									type="range"
									min={
										[
											"faceEyeSize",
											"faceNoseSize",
											"faceMouthSize",
											"faceWidth",
											"faceWarmth",
										].includes(key)
											? "-1"
											: "0"
									}
									max="1"
									step="0.01"
									value={Number(face[key] || 0)}
									onChange={(e) =>
										setFace((v) => ({ ...v, [key]: Number(e.target.value) }))
									}
								/>
							</label>
						))}
						<LutPicker
							value={String(face.lut ?? "")}
							disabled={disabled}
							onChange={(stem) => setFace((v) => ({ ...v, lut: stem }))}
						/>
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() => void act(saveFinish)}
						>
							Guardar retoque
						</Button>
						<Button
							disabled={disabled}
							onClick={() => void act(() => job("prepare-source"))}
						>
							Preparar original mejorado
						</Button>
						<Button
							disabled={
								disabled ||
								!project.artifacts.enhancedSource ||
								project.artifacts.enhancedSource.revision !== project.revision
							}
							onClick={() => void act(() => applySource(true))}
						>
							Aplicar mejora a mi timeline
						</Button>
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() => void act(() => applySource(false))}
						>
							Volver al original en la timeline
						</Button>
						<p className="text-xs text-muted-foreground">
							Guarda los ajustes, prepara y aplica. Se procesa el original
							completo y se conserva tu montaje. Cambiar los controles requiere
							preparar otra versión; no es un filtro en tiempo real.
						</p>
					</section>
					<section className="xeno-card space-y-2 p-3">
						<h3 className="xeno-heading" data-index="07">Previsualización procesada</h3>
						<Button
							disabled={disabled}
							onClick={() => void act(() => job("preview"))}
						>
							Generar previsualización
						</Button>
						{project.artifacts.preview ? (
							<Button
								variant="outline"
								onClick={() => setShowPreview((v) => !v)}
							>
								Ver / ocultar resultado
							</Button>
						) : null}
						{showPreview && project.artifacts.preview ? (
							<video
								className="w-full rounded"
								controls
								src={`/nacho-api/projects/${project.id}/artifact?type=preview&r=${project.revision}`}
							/>
						) : null}
						<p className="text-xs text-muted-foreground">
							Muestra el montaje del motor. Para exportar la timeline completa
							con tus capas manuales utiliza Exportar de OpenCut.
						</p>
					</section>
					<section className="xeno-card space-y-3 p-3">
						<h3 className="xeno-heading" data-index="08">Exportar y publicar</h3>
						<ExportPanel
							project={project}
							disabled={disabled}
							onUpdated={setProject}
							onError={setError}
							onMessage={setMessage}
							onJob={job}
						/>
						<details className="rounded border p-2">
							<summary className="cursor-pointer text-xs font-medium">
								Miniatura
							</summary>
							<div className="mt-2">
								<ThumbnailPanel
									project={project}
									disabled={disabled}
									onUpdated={setProject}
									onError={setError}
									onMessage={setMessage}
								/>
							</div>
						</details>
						<details className="rounded border p-2" open>
							<summary className="cursor-pointer text-xs font-medium">
								Títulos, descripción y capítulos
							</summary>
							<div className="mt-2">
								<PublishPanel project={project} disabled={disabled} onError={setError} />
							</div>
						</details>
					</section>
					<section className="xeno-card space-y-3 p-3">
						<h3 className="xeno-heading" data-index="09">Creadores</h3>
						<CreatorTools
							project={project}
							disabled={disabled}
							settings={face}
							onSetting={(patch) => setFace((v) => ({ ...v, ...patch }))}
							onSave={() => void act(saveFinish)}
							onUpdated={(updated) => {
								setProject(updated);
								setShowPreview(false);
							}}
							onMessage={setMessage}
						/>
					</section>
				</>
			) : null}
		</div>
	);
}
