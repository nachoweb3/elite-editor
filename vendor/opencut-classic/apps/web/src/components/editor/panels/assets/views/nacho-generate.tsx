"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
type Job = {
	id: string;
	kind: string;
	prompt: string;
	status: string;
	url?: string;
	error?: string;
};
type Settings = {
	configured: boolean;
	models: { id: string; name: string; kind: string }[];
};
async function request<T>(path: string, body?: unknown): Promise<T> {
	const headers: Record<string, string> = {};
	if (body !== undefined) {
		const session = await fetch("/nacho-api/session");
		headers["x-studio-token"] = (await session.json()).token;
		headers["Content-Type"] = "application/json";
	}
	const r = await fetch("/nacho-api/generative/" + path, {
		method: body === undefined ? "GET" : "POST",
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await r.json();
	if (!r.ok) throw Error(data.error || "Error del motor local");
	return data;
}
export function NachoGenerate() {
	const editor = useEditor(),
		[settings, setSettings] = useState<Settings>({
			configured: false,
			models: [],
		}),
		[jobs, setJobs] = useState<Job[]>([]),
		[key, setKey] = useState(""),
		[model, setModel] = useState("flux-schnell"),
		[ratio, setRatio] = useState("16:9"),
		[prompt, setPrompt] = useState(""),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[message, setMessage] = useState("");
	useEffect(() => {
		let alive = true;
		Promise.all([request<Settings>("settings"), request<Job[]>("jobs")])
			.then(([s, j]) => {
				if (alive) {
					setSettings(s);
					setJobs(j);
				}
			})
			.catch((e) => {
				if (alive) setError(e.message);
			});
		return () => {
			alive = false;
		};
	}, []);
	useEffect(() => {
		if (!jobs.some((j) => j.status === "pending")) return;
		let alive = true;
		const timer = setTimeout(async () => {
			try {
				const results = await Promise.all(
					jobs
						.filter((j) => j.status === "pending")
						.map((j) => request<Job>("refresh", { id: j.id })),
				);
				if (alive)
					setJobs((old) =>
						old.map((j) => results.find((r) => r.id === j.id) || j),
					);
			} catch (e) {
				if (alive) {
					setError((e as Error).message);
					setJobs((old) => [...old]);
				}
			}
		}, 5000);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [jobs]);
	async function act(fn: () => Promise<void>) {
		setBusy(true);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}
	async function add(job: Job) {
		const projectId = editor.project.getActive()?.metadata.id;
		if (!projectId || !job.url) return;
		const sceneId = editor.scenes.getActiveScene().id;
		setMessage("Descargando y preparando el recurso…");
		const response = await fetch(job.url);
		if (!response.ok) throw Error("No se pudo descargar el resultado");
		const blob = await response.blob();
		const file = new File(
			[blob],
			`IA-${job.id}.${job.kind === "video" ? "mp4" : "png"}`,
			{ type: blob.type },
		);
		const assets = await processMediaAssets({ files: [file] });
		if (
			editor.project.getActive()?.metadata.id !== projectId ||
			editor.scenes.getActiveScene().id !== sceneId
		)
			throw Error(
				"Has cambiado de proyecto o escena. Vuelve a añadir el recurso.",
			);
		if (!assets.length)
			throw Error("El navegador no pudo interpretar el archivo");
		for (const prepared of assets) {
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: prepared,
			});
			if (!asset) throw Error("No se pudo guardar el recurso");
			editor.timeline.insertElement({
				element: buildElementFromMedia({
					mediaId: asset.id,
					mediaType: asset.type,
					name: job.prompt.slice(0, 60),
					duration: mediaTimeFromSeconds({ seconds: asset.duration || 5 }),
					startTime: editor.playback.getCurrentTime(),
				}),
				placement: { mode: "auto" },
			});
		}
		setMessage(
			"Recurso añadido a Medios y a la timeline en la posición del cursor.",
		);
	}
	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm">
			<h2 className="font-semibold">Crear con IA</h2>
			<p className="text-xs text-muted-foreground">
				Imágenes y planos de apoyo dentro de tu montaje. Integración basada en
				Open Generative AI.
			</p>
			<details className="rounded border p-3" open={!settings.configured}>
				<summary>
					MuAPI · {settings.configured ? "Configurado" : "Configurar clave"}
				</summary>
				<Input
					className="mt-2"
					type="password"
					autoComplete="off"
					aria-label="Clave MuAPI"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder="Clave API de MuAPI"
				/>
				<Button
					className="mt-2"
					variant="outline"
					disabled={busy || !key}
					onClick={() =>
						void act(async () => {
							setSettings(await request("settings", { key }));
							setKey("");
						})
					}
				>
					Guardar clave local
				</Button>
				<p className="mt-2 text-xs text-muted-foreground">
					Se guarda en este ordenador; el navegador no recibe la clave guardada.
				</p>
			</details>
			<label>
				Modelo
				<select
					className="mt-1 w-full rounded border bg-background p-2"
					value={model}
					onChange={(e) => setModel(e.target.value)}
				>
					{settings.models.map((m) => (
						<option value={m.id} key={m.id}>
							{m.name} · {m.kind === "image" ? "imagen" : "vídeo 5 s"}
						</option>
					))}
				</select>
			</label>
			<label>
				Formato
				<select
					className="mt-1 w-full rounded border bg-background p-2"
					value={ratio}
					onChange={(e) => setRatio(e.target.value)}
				>
					<option>16:9</option>
					<option>9:16</option>
				</select>
			</label>
			<label>
				Describe el recurso
				<textarea
					className="mt-1 min-h-24 w-full rounded border bg-background p-2"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					maxLength={3000}
					placeholder="Un plano cinematográfico de servidores, luces azules, sin texto…"
				/>
			</label>
			<p className="text-xs text-muted-foreground">
				Al generar se envía esta descripción a MuAPI y se consumen créditos de
				tu cuenta según su tarifa. No se envía tu grabación.
			</p>
			<Button
				disabled={busy || !settings.configured || prompt.trim().length < 2}
				onClick={() =>
					void act(async () => {
						const job = await request<Job>("jobs", { model, prompt, ratio });
						setJobs((old) => [job, ...old]);
					})
				}
			>
				{busy ? "Procesando…" : "Generar con MuAPI"}
			</Button>
			{error ? (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-xs">
					{message}
				</p>
			) : null}
			<h3 className="font-medium">Historial de recursos</h3>
			{!jobs.length ? (
				<p className="text-xs text-muted-foreground">
					Tus generaciones aparecerán aquí.
				</p>
			) : null}
			{jobs.map((job) => (
				<article key={job.id} className="space-y-2 rounded border p-3">
					<p className="line-clamp-3 text-xs">{job.prompt}</p>
					<p className="text-xs">{job.status}</p>
					{job.error ? (
						<p className="text-xs text-red-400">{job.error}</p>
					) : null}
					{job.url ? (
						<>
							<Button disabled={busy} onClick={() => void act(() => add(job))}>
								Añadir a la timeline
							</Button>
							<a
								className="block text-xs underline"
								href={job.url}
								target="_blank"
								rel="noreferrer"
							>
								Ver archivo generado
							</a>
						</>
					) : null}
				</article>
			))}
		</div>
	);
}
