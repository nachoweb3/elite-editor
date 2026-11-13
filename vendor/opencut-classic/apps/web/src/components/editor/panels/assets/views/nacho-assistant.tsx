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

type Project = {
	id: string;
	name: string;
	blank?: boolean;
	revision: number;
	settings: Record<string, number | string | boolean>;
	clips: { enabled: boolean; start: number; end: number }[];
	jobs: { id: string; status: string; message: string }[];
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
	projectId: string;
	revision: number;
	prompt: string;
};
async function api<T>(path: string, data?: unknown): Promise<T> {
	const headers: Record<string, string> = {};
	if (data !== undefined) {
		const session = await fetch("/nacho-api/session");
		if (!session.ok) throw Error("El motor local no responde");
		headers["x-studio-token"] = (await session.json()).token;
		headers["Content-Type"] = "application/json";
	}
	const response = await fetch("/nacho-api" + path, {
		method: data === undefined ? "GET" : "POST",
		headers,
		body: data === undefined ? undefined : JSON.stringify(data),
	});
	const result = await response.json();
	if (!response.ok)
		throw Error(result.error || "No se pudo completar la operación");
	return result;
}
const faceControls = [
	["faceSmooth", "Suavidad de piel"],
	["faceLight", "Luz del rostro"],
	["faceUnderEyes", "Ojeras"],
	["faceEyes", "Detalle de ojos"],
	["faceTeeth", "Blanqueado dental"],
	["faceJaw", "Contorno facial"],
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
	const [plan, setPlan] = useState<PromptPlan | null>(null);
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
				const p = await api<Project>("/projects/" + selected);
				if (alive) {
					setProject(p);
					timer = setTimeout(poll, 2000);
				}
			} catch (e) {
				if (alive) {
					setError((e as Error).message);
					timer = setTimeout(poll, 5000);
				}
			}
		}
		void poll();
		return () => {
			alive = false;
			clearTimeout(timer);
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
		setProject(await api("/projects/" + project.id));
		setShowPreview(false);
		setMessage("Trabajo enviado. El progreso aparece aquí.");
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
			"/projects/" + project.id + "/opencut",
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
			editor.project.getActive()?.settings.canvasSize.height || 1080;
		const captions = manifest.captions.map(
			(c) =>
				({
					...buildTextElement({
						raw: {
							name: c.text,
							duration: seconds(c.end - c.start),
							params: {
								content: c.text,
								"transform.positionY": -height * 0.38,
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
			<div>
				<h2 className="font-semibold">Asistente IA · Elite Editor</h2>
				<p className="text-muted-foreground text-xs">
					Analiza, monta y retoca desde este editor.
				</p>
			</div>
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
					<section className="space-y-2 rounded border p-3">
						<h3 className="font-medium">1. Analizar y proponer cortes</h3>
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
							<p role="status" className="break-words text-xs">
								{project.jobs.at(-1)!.status} · {project.jobs.at(-1)!.message}
							</p>
						) : null}
					</section>
					<section className="space-y-2 rounded border p-3">
						<h3 className="font-medium">2. Editar en la timeline</h3>
						<p className="text-xs text-muted-foreground">
							{project.clips.filter((c) => c.enabled).length} cortes activos. Se
							añaden al final y se pueden deshacer.
						</p>
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
					<section className="space-y-2 rounded border p-3">
						<h3 className="font-medium">
							Editar la propuesta con instrucciones
						</h3>
						<Input
							aria-label="Instrucción de edición"
							placeholder="Por ejemplo: elimina los primeros 5 segundos"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Describe ajustes de voz, luz, color o cortes del original. Revisa
							la propuesta antes de aplicarla.
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
								onClick={() =>
									void act(async () => {
										const epoch = generation.current;
										setPlan(null);
										const result = await api<PromptPlan>(
											"/projects/" + project.id + "/plan",
											{ prompt, revision: project.revision },
										);
										if (epoch !== generation.current) return;
										setPlan({
											...result,
											projectId: project.id,
											revision: project.revision,
											prompt,
										});
									})
								}
							>
								Ver qué cambiaría
							</Button>
						</div>
						{planIsCurrent && plan ? (
							<div
								className="space-y-2 rounded border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs"
								aria-live="polite"
							>
								<p>{plan.explanation}</p>
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
					</section>
					<section className="space-y-3 rounded border p-3">
						<h3 className="font-medium">Explicar con stickman</h3>
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
					<section className="space-y-3 rounded border p-3">
						<h3 className="font-medium">Retoque facial</h3>
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
						{faceControls.map(([key, label]) => (
							<label key={key} className="block text-xs">
								{label} · {Math.round(Number(face[key] || 0) * 100)} %
								<input
									className="w-full"
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={Number(face[key] || 0)}
									onChange={(e) =>
										setFace((v) => ({ ...v, [key]: Number(e.target.value) }))
									}
								/>
							</label>
						))}
						<Button
							variant="outline"
							disabled={disabled}
							onClick={() =>
								void act(async () => {
									setProject(
										await api("/projects/" + project.id + "/portrait", {
											revision: project.revision,
											settings: face,
										}),
									);
									setShowPreview(false);
									setMessage(
										"Ajustes guardados. Prepara el original mejorado para aplicarlos a tu timeline.",
									);
								})
							}
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
					<section className="space-y-2 rounded border p-3">
						<h3 className="font-medium">Previsualización procesada</h3>
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
				</>
			) : null}
		</div>
	);
}
