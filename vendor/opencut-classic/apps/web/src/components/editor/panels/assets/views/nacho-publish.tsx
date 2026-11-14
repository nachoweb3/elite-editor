"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clock, copyText, nachoApi } from "./nacho-api";

type Artifact = { revision?: number; width?: number; height?: number; duration?: number; encoder?: string };
export type PublishProject = {
	id: string;
	revision: number;
	reviewed?: boolean;
	media?: { duration: number };
	settings: Record<string, number | string | boolean | null>;
	clips: { enabled: boolean }[];
	artifacts: Record<string, unknown>;
};
type Props<P extends PublishProject> = {
	project: P;
	disabled: boolean;
	onUpdated: (project: P) => void;
	onError: (message: string) => void;
	onMessage: (message: string) => void;
	onJob: (type: string) => Promise<void>;
};

const FORMATS = [
	["youtube", "Horizontal 16:9 · YouTube"],
	["reels", "Vertical 9:16 · Reels"],
	["tiktok", "Vertical 9:16 · TikTok"],
	["shorts", "Vertical 9:16 · Shorts"],
	["youtube4k", "4K horizontal"],
] as const;

function useAction(onError: (message: string) => void) {
	const [busy, setBusy] = useState(false);
	return {
		busy,
		run: async (fn: () => Promise<void>) => {
			setBusy(true);
			onError("");
			try {
				await fn();
			} catch (e) {
				onError((e as Error).message);
			} finally {
				setBusy(false);
			}
		},
	};
}

/* ------------------------------- Review gate ------------------------------- */

// Rendering requires an explicitly approved proposal; this is the one place to approve it.
export function ReviewGate<P extends PublishProject>({
	project,
	disabled,
	onUpdated,
	onError,
	onMessage,
}: Omit<Props<P>, "onJob">) {
	const { busy, run } = useAction(onError);
	if (project.reviewed !== false) return null;
	return (
		<div className="space-y-2 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-xs">
			<p>
				La propuesta está <strong>pendiente de aprobar</strong>. Revisa el mapa y la
				transcripción; al aprobarla podrás generar la previsualización y el
				render final.
			</p>
			<Button
				size="sm"
				disabled={disabled || busy || !project.clips.some((c) => c.enabled)}
				onClick={() =>
					void run(async () => {
						onUpdated(
							await nachoApi<P>(`/projects/${project.id}/approve`, {
								revision: project.revision,
							}),
						);
						onMessage("Propuesta aprobada. Ya puedes renderizarla.");
					})
				}
			>
				Aprobar propuesta
			</Button>
		</div>
	);
}

/* ------------------------------ Final export ------------------------------ */

export function ExportPanel<P extends PublishProject>(props: Props<P>) {
	const { project, disabled, onUpdated, onError, onMessage, onJob } = props;
	const { busy, run } = useAction(onError);
	const result = project.artifacts.export as Artifact | undefined;
	const fresh = result && result.revision === project.revision;
	const base = `/nacho-api/projects/${project.id}/artifact?type=export`;
	return (
		<div className="space-y-2">
			<label className="flex flex-col gap-1 text-xs">
				Formato de salida
				<select
					aria-label="Formato de salida"
					className="rounded border bg-background p-2"
					disabled={disabled || busy}
					value={String(project.settings.profile || "reels")}
					onChange={(e) =>
						void run(async () => {
							onUpdated(
								await nachoApi<P>(`/projects/${project.id}/format`, {
									revision: project.revision,
									profile: e.target.value,
								}),
							);
							onMessage("Formato actualizado. Vuelve a renderizar para aplicarlo.");
						})
					}
				>
					{FORMATS.map(([id, label]) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</select>
			</label>
			<Button
				disabled={disabled || busy || project.reviewed === false}
				onClick={() => void run(() => onJob("render"))}
			>
				Render final en calidad máxima
			</Button>
			{result ? (
				<div className="space-y-1 rounded border p-2 text-xs">
					<p>
						{fresh ? "Último render" : "Render de una versión anterior"} ·{" "}
						{result.width}×{result.height} · {clock(result.duration || 0)} ·{" "}
						{result.encoder}
					</p>
					<div className="flex flex-wrap gap-2">
						<a className="rounded border px-2 py-1 hover:bg-accent" href={`${base}&download=1`} download>
							Descargar MP4
						</a>
						<a className="rounded border px-2 py-1 hover:bg-accent" href={`${base}&format=srt&download=1`} download>
							SRT
						</a>
						<a className="rounded border px-2 py-1 hover:bg-accent" href={`${base}&format=ass&download=1`} download>
							ASS
						</a>
					</div>
				</div>
			) : null}
			<p className="text-xs text-muted-foreground">
				El render del motor incluye cortes, subtítulos, retoque, voz limpia y
				música. Para exportar también tus capas manuales usa Exportar de la
				timeline.
			</p>
		</div>
	);
}

/* -------------------------------- Thumbnail ------------------------------- */

export function ThumbnailPanel<P extends PublishProject>({
	project,
	disabled,
	onUpdated,
	onError,
	onMessage,
}: Omit<Props<P>, "onJob">) {
	const duration = project.media?.duration || 0;
	const [time, setTime] = useState(Math.min(1, duration / 2));
	const [title, setTitle] = useState(String(project.settings.title || ""));
	const { busy, run } = useAction(onError);
	const video = useRef<HTMLVideoElement | null>(null);
	useEffect(() => {
		if (video.current && Number.isFinite(time)) video.current.currentTime = time;
	}, [time]);
	const made = project.artifacts.thumbnail as unknown;
	if (!duration) return null;
	return (
		<div className="space-y-2 text-xs">
			<video
				ref={video}
				className="w-full rounded bg-black"
				src={`/nacho-api/projects/${project.id}/media`}
				preload="metadata"
				muted
				aria-label="Fotograma elegido para la miniatura"
			/>
			<label className="block">
				Fotograma · {clock(time)}
				<input
					type="range"
					aria-label="Momento de la miniatura"
					className="w-full"
					min={0}
					max={duration}
					step={0.1}
					value={time}
					onChange={(e) => setTime(Number(e.target.value))}
				/>
			</label>
			<Input
				aria-label="Texto de la miniatura"
				placeholder="Texto grande sobre la imagen (opcional)"
				maxLength={120}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
			/>
			<Button
				size="sm"
				disabled={disabled || busy}
				onClick={() =>
					void run(async () => {
						onUpdated(
							await nachoApi<P>(`/projects/${project.id}/thumbnail`, { time, title }),
						);
						onMessage("Miniatura creada con el formato del proyecto.");
					})
				}
			>
				Crear miniatura
			</Button>
			{made ? (
				<div className="space-y-1">
					<img
						className="max-h-64 rounded border"
						alt="Miniatura generada"
						src={`/nacho-api/projects/${project.id}/artifact?type=thumbnail&r=${project.revision}-${encodeURIComponent(title)}-${time}`}
					/>
					<a
						className="inline-block rounded border px-2 py-1 hover:bg-accent"
						href={`/nacho-api/projects/${project.id}/artifact?type=thumbnail&download=1`}
						download
					>
						Descargar JPG
					</a>
				</div>
			) : null}
		</div>
	);
}

/* ----------------------------- Publishing kit ----------------------------- */

type Kit = {
	engine: "rules" | "ollama";
	titles: string[];
	description: string;
	hashtags: string[];
	chapterText: string;
	note?: string;
	revision: number;
};

function CopyBlock({ label, text }: { label: string; text: string }) {
	const [copied, setCopied] = useState(false);
	if (!text) return null;
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium">{label}</span>
				<button
					type="button"
					className="rounded border px-1.5 text-[10px] hover:bg-accent"
					aria-label={`Copiar ${label.toLowerCase()}`}
					onClick={() =>
						void copyText(text).then((ok) => {
							setCopied(ok);
							setTimeout(() => setCopied(false), 1500);
						})
					}
				>
					{copied ? "Copiado ✓" : "Copiar"}
				</button>
			</div>
			<p className="whitespace-pre-wrap rounded bg-black/30 p-2">{text}</p>
		</div>
	);
}

export function PublishPanel<P extends PublishProject>({
	project,
	disabled,
	onError,
}: Pick<Props<P>, "project" | "disabled" | "onError">) {
	const [kit, setKit] = useState<Kit | null>(null);
	const { busy, run } = useAction(onError);
	useEffect(() => setKit(null), [project.id]);
	const load = (fresh: boolean) =>
		run(async () =>
			setKit(
				await nachoApi<Kit>(`/projects/${project.id}/publish${fresh ? "?fresh=1" : ""}`),
			),
		);
	return (
		<div className="space-y-2 text-xs">
			<div className="flex flex-wrap gap-2">
				<Button size="sm" disabled={disabled || busy} onClick={() => void load(false)}>
					{busy ? "Preparando…" : "Preparar publicación"}
				</Button>
				{kit ? (
					<Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void load(true)}>
						Regenerar
					</Button>
				) : null}
			</div>
			{kit ? (
				<div className="space-y-3 rounded border p-2">
					<p className="flex flex-wrap items-center gap-2">
						<span
							className={`rounded-full border px-2 py-0.5 text-[10px] ${kit.engine === "rules" ? "border-sky-400/40 text-sky-300" : "border-violet-400/40 text-violet-300"}`}
						>
							{kit.engine === "rules" ? "Borrador con reglas locales" : "Redactado por la IA local"}
						</span>
						{kit.revision !== project.revision ? (
							<span className="text-amber-300">El montaje cambió: regenera.</span>
						) : null}
					</p>
					{kit.note ? <p className="text-muted-foreground">{kit.note}</p> : null}
					{kit.titles.map((title, i) => (
						<CopyBlock key={title} label={`Título ${i + 1}`} text={title} />
					))}
					<CopyBlock label="Descripción" text={kit.description} />
					<CopyBlock label="Capítulos" text={kit.chapterText} />
					<CopyBlock label="Hashtags" text={kit.hashtags.join(" ")} />
				</div>
			) : (
				<p className="text-muted-foreground">
					Genera títulos, descripción, hashtags y capítulos con marcas de tiempo
					del montaje actual, listos para pegar en YouTube.
				</p>
			)}
		</div>
	);
}
