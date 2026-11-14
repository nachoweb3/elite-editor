"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { nachoApi } from "./nacho-api";

export { clock, nachoApi } from "./nacho-api";
export { TranscriptEditor } from "./nacho-text-editor";

/* ------------------------------ Engine status ----------------------------- */

type Capabilities = {
	ffmpeg: boolean;
	transcription: { ready: boolean; modelName: string };
	faceTracking: boolean;
	nvenc: boolean;
	ollama: { running: boolean; installed: boolean; model: string };
	hints: string[];
};
const isCapabilities = (value: unknown): value is Capabilities =>
	!!value &&
	typeof (value as Capabilities).ffmpeg === "boolean" &&
	Array.isArray((value as Capabilities).hints);

function Chip({ ok, label, title }: { ok: boolean; label: string; title: string }) {
	return (
		<span
			title={title}
			className={`xeno-chip inline-flex items-center gap-1.5 px-2 py-0.5 ${
				ok
					? "border-emerald-400/40 text-emerald-300"
					: "border-amber-400/40 text-amber-300"
			}`}
		>
			<span aria-hidden className="xeno-dot" style={{ width: 6, height: 6, opacity: ok ? 1 : 0.5 }} />
			{label}
		</span>
	);
}

export function EngineStatus() {
	const [caps, setCaps] = useState<Capabilities | null>(null);
	const [failed, setFailed] = useState(false);
	const [checking, setChecking] = useState(false);
	async function check(fresh = false) {
		setChecking(true);
		try {
			const result = await nachoApi<unknown>(
				"/capabilities" + (fresh ? "?fresh=1" : ""),
			);
			if (isCapabilities(result)) {
				setCaps(result);
				setFailed(false);
			}
		} catch {
			setFailed(true);
		} finally {
			setChecking(false);
		}
	}
	useEffect(() => {
		void check();
	}, []);
	if (failed)
		return (
			<p className="rounded border border-amber-400/30 p-2 text-xs text-amber-300">
				El motor local no responde. Arranca Elite Editor con ELITE_EDITOR.cmd o
				npm run dev.
			</p>
		);
	if (!caps) return null;
	const ai = caps.ollama.running && caps.ollama.installed;
	return (
		<details className="xeno-card p-2 text-xs" aria-label="Estado del motor">
			<summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
				<span className="xeno-kicker mr-1">Motor</span>
				<Chip ok={caps.ffmpeg} label="FFmpeg" title="Análisis de silencios y render" />
				<Chip
					ok={caps.transcription.ready}
					label="Transcripción"
					title={`Whisper local · modelo ${caps.transcription.modelName}`}
				/>
				<Chip
					ok={ai}
					label={ai ? "IA local" : "Reglas locales"}
					title={
						ai
							? `Ollama · ${caps.ollama.model}`
							: "Las instrucciones se interpretan con reglas locales"
					}
				/>
				<Chip ok={caps.faceTracking} label="Retoque facial" title="MediaPipe" />
				{caps.nvenc ? <Chip ok label="NVENC" title="Codificación por GPU" /> : null}
			</summary>
			<div className="mt-2 space-y-2">
				{caps.hints.length ? (
					<ul className="list-disc space-y-1 pl-4 text-muted-foreground">
						{caps.hints.map((hint) => (
							<li key={hint}>{hint}</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground">Todo listo en este equipo.</p>
				)}
				<Button
					size="sm"
					variant="outline"
					disabled={checking}
					onClick={() => void check(true)}
				>
					{checking ? "Comprobando…" : "Volver a comprobar"}
				</Button>
			</div>
		</details>
	);
}

/* -------------------------------- Job status ------------------------------- */

export type Job = {
	id: string;
	type?: string;
	status: string;
	message: string;
	startedAt?: string;
	createdAt?: string;
	finishedAt?: string;
	progress?: { stage: string; fraction: number | null };
};
const STATUS_LABELS: Record<string, string> = {
	queued: "En cola",
	running: "En proceso",
	done: "Terminado",
	failed: "Error",
	cancelled: "Cancelado",
	interrupted: "Interrumpido",
};
const JOB_LABELS: Record<string, string> = {
	analyze: "Análisis",
	preview: "Previsualización",
	render: "Render final",
	"auto-review": "Montaje automático",
	autopilot: "Montaje automático",
	"prepare-source": "Original mejorado",
	stickman: "Conceptos stickman",
	rerender: "Vídeo con explicaciones",
	editor: "Exportación al editor",
	diffusion: "Exportación",
};
const elapsed = (from?: string, to?: string) => {
	if (!from) return "";
	const seconds = Math.max(
		0,
		Math.round(
			((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000,
		),
	);
	return seconds >= 60
		? `${Math.floor(seconds / 60)} min ${seconds % 60} s`
		: `${seconds} s`;
};

export function JobStatus({
	projectId,
	job,
	onChanged,
}: {
	projectId: string;
	job: Job;
	onChanged: () => void;
}) {
	const [log, setLog] = useState("");
	const [cancelling, setCancelling] = useState(false);
	const [problem, setProblem] = useState("");
	const live = ["queued", "running"].includes(job.status);
	const fraction = job.progress?.fraction;
	useEffect(() => {
		setLog("");
		setCancelling(false);
		setProblem("");
	}, [job.id]);
	return (
		<div className="xeno-scanlines relative overflow-hidden space-y-2 rounded-xl border border-white/10 bg-black/25 p-2.5 text-xs" aria-live="polite">
			<div className="flex items-center justify-between gap-2">
				<p className="flex items-center gap-2 font-medium">
					<span
						className={`xeno-dot ${job.status === "failed" ? "text-red-400" : job.status === "done" ? "text-emerald-300" : "text-sky-300"}`}
						data-live={live}
					/>
					{JOB_LABELS[job.type || ""] || "Trabajo"} ·{" "}
					<span
						className={
							job.status === "failed"
								? "text-red-400"
								: job.status === "done"
									? "text-emerald-300"
									: "text-muted-foreground"
						}
					>
						{STATUS_LABELS[job.status] || job.status}
					</span>
				</p>
				<span className="xeno-mono text-muted-foreground">
					{elapsed(job.startedAt, live ? undefined : job.finishedAt)}
				</span>
			</div>
			{live ? (
				<div
					role="progressbar"
					aria-label="Progreso del trabajo"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={
						typeof fraction === "number" ? Math.round(fraction * 100) : undefined
					}
					data-indeterminate={typeof fraction !== "number"}
					className="xeno-progress w-full"
				>
					<span
						style={
							typeof fraction === "number"
								? { width: `${Math.max(2, fraction * 100)}%` }
								: undefined
						}
					/>
				</div>
			) : null}
			<p role="status" className="break-words text-muted-foreground">
				{job.message}
				{live && typeof fraction === "number"
					? ` · ${Math.round(fraction * 100)} %`
					: ""}
			</p>
			{problem ? <p className="text-red-400">{problem}</p> : null}
			<div className="flex flex-wrap gap-2">
				{live ? (
					<Button
						size="sm"
						variant="outline"
						disabled={cancelling}
						onClick={() =>
							void (async () => {
								setCancelling(true);
								setProblem("");
								try {
									await nachoApi("/projects/" + projectId + "/cancel", {
										jobId: job.id,
									});
									onChanged();
								} catch (e) {
									setProblem((e as Error).message);
									setCancelling(false);
								}
							})()
						}
					>
						{cancelling ? "Cancelando…" : "Cancelar trabajo"}
					</Button>
				) : null}
				{job.status === "failed" || job.status === "interrupted" ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							void (async () => {
								if (log) {
									setLog("");
									return;
								}
								try {
									const result = await nachoApi<{ log: string }>(
										`/projects/${projectId}/log?job=${job.id}`,
									);
									setLog(result.log.split(/\r?\n/).slice(-40).join("\n"));
								} catch (e) {
									setProblem((e as Error).message);
								}
							})()
						}
					>
						{log ? "Ocultar registro" : "Ver registro"}
					</Button>
				) : null}
			</div>
			{log ? (
				<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px]">
					{log}
				</pre>
			) : null}
		</div>
	);
}
