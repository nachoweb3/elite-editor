"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clock, nachoApi } from "./nacho-api";

export type CreatorProject = {
	id: string;
	revision: number;
	settings: Record<string, number | string | boolean | null>;
};
type Settings = Record<string, number | string | boolean | null | undefined>;
type Props<P extends CreatorProject> = {
	project: P;
	disabled: boolean;
	onUpdated: (project: P) => void;
	onMessage: (message: string) => void;
	// Finishing settings staged in the assistant (the same state "Guardar retoque" saves).
	settings: Settings;
	onSetting: (patch: Record<string, number | string | boolean>) => void;
	onSave: () => void;
};

type Level = "ok" | "warn" | "error";
const LEVEL_CLASS: Record<Level, string> = {
	ok: "border-emerald-400/40 text-emerald-300",
	warn: "border-amber-400/40 text-amber-300",
	error: "border-red-400/40 text-red-300",
};
const LEVEL_ICON: Record<Level, string> = { ok: "✓", warn: "!", error: "✕" };
const LEVEL_TEXT: Record<Level, string> = {
	ok: "Correcto",
	warn: "Aviso",
	error: "Error",
};
const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;
// Engine statuses are ok / warn / error; tolerate near synonyms rather than break the light.
const levelOf = (status: string): Level =>
	/^(ok|good|pass)/i.test(status)
		? "ok"
		: /^(err|bad|fail)/i.test(status)
			? "error"
			: "warn";

function LevelMark({ level, label }: { level: Level; label?: string }) {
	return (
		<span
			data-level={level}
			className={`xeno-chip inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 ${LEVEL_CLASS[level]}`}
		>
			<span aria-hidden>{LEVEL_ICON[level]}</span>
			{label ?? LEVEL_TEXT[level]}
		</span>
	);
}

// Per-block busy/error state with a guard so answers for a previous project are dropped.
function useCall(projectId: string) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const generation = useRef(0);
	useEffect(() => {
		generation.current++;
		setBusy(false);
		setError("");
	}, [projectId]);
	async function run(fn: (current: () => boolean) => Promise<void>) {
		const mine = generation.current;
		setBusy(true);
		setError("");
		try {
			await fn(() => mine === generation.current);
		} catch (e) {
			if (mine === generation.current) setError((e as Error).message);
		} finally {
			if (mine === generation.current) setBusy(false);
		}
	}
	return { busy, error, run };
}

/* ------------------------------ Shorts clips ------------------------------ */

type Candidate = {
	start: number;
	end: number;
	duration: number;
	score: number;
	reasons: string[];
	text: string;
	title: string;
};
const RANGES = [
	["15-30", "15 a 30 s"],
	["30-60", "30 a 60 s"],
	["60-90", "60 a 90 s"],
] as const;
// The engine scores 0-1 or 0-100: show both as a percentage.
const percent = (score: number) =>
	Math.round(
		Math.max(0, Math.min(1, score > 1 ? score / 100 : score || 0)) * 100,
	);

function ShortsBlock<P extends CreatorProject>({
	project,
	disabled,
	onUpdated,
	onMessage,
}: Props<P>) {
	const { busy, error, run } = useCall(project.id);
	const [range, setRange] = useState("30-60");
	const [found, setFound] = useState<{
		revision: number;
		candidates: Candidate[];
	} | null>(null);
	useEffect(() => setFound(null), [project.id]);
	const stale = !!found && found.revision !== project.revision;
	return (
		<div className="space-y-2 text-xs">
			<p className="text-muted-foreground">
				Busca los momentos con más gancho de tu grabación para convertirlos en
				un vídeo corto. Al elegir un clip se actualiza la propuesta del motor
				con ese tramo; después añádela a la timeline.
			</p>
			<label className="flex items-center justify-between gap-2">
				Duración del clip
				<select
					aria-label="Duración del clip"
					className="rounded border bg-background p-1.5"
					disabled={disabled || busy}
					value={range}
					onChange={(e) => {
						setRange(e.target.value);
						setFound(null);
					}}
				>
					{RANGES.map(([id, label]) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</select>
			</label>
			<Button
				size="sm"
				disabled={disabled || busy}
				onClick={() =>
					void run(async (current) => {
						const [min, max] = range.split("-").map(Number);
						const result = await nachoApi<{
							revision: number;
							candidates?: Candidate[];
						}>(`/projects/${project.id}/shorts?min=${min}&max=${max}`);
						if (current())
							setFound({
								revision: result.revision,
								candidates: result.candidates ?? [],
							});
					})
				}
			>
				{busy && !found ? "Buscando…" : "Buscar clips para Shorts"}
			</Button>
			{error ? (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			) : null}
			{stale ? (
				<p role="status" className="text-amber-300">
					El montaje cambió desde esta búsqueda: vuelve a buscar clips.
				</p>
			) : null}
			{found && !found.candidates.length ? (
				<p role="status" className="text-muted-foreground">
					No se han encontrado momentos con esa duración. Prueba otro rango o
					analiza primero la grabación.
				</p>
			) : null}
			{found?.candidates.length ? (
				<ol aria-label="Clips candidatos" className="space-y-2">
					{found.candidates.map((c, i) => (
						<li
							key={`${c.start}-${c.end}`}
							className="xeno-card space-y-1 p-2"
							data-candidate={i}
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="xeno-mono font-medium">
									{clock(c.start)} – {clock(c.end)} · {Math.round(c.duration)} s
								</p>
								<span className="xeno-mono text-muted-foreground">
									Puntuación {percent(c.score)}
								</span>
							</div>
							<div
								role="meter"
								aria-label="Puntuación del clip"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={percent(c.score)}
								className="xeno-progress w-full"
							>
								<span style={{ width: `${Math.max(2, percent(c.score))}%` }} />
							</div>
							{c.title ? <p className="font-medium">{c.title}</p> : null}
							{c.text ? (
								<p className="line-clamp-3 text-muted-foreground">{c.text}</p>
							) : null}
							{c.reasons?.length ? (
								<ul className="flex flex-wrap gap-1" aria-label="Por qué destaca">
									{c.reasons.map((reason) => (
										<li
											key={reason}
											className="xeno-chip px-2 py-0.5 text-muted-foreground"
										>
											{reason}
										</li>
									))}
								</ul>
							) : null}
							<Button
								size="sm"
								disabled={disabled || busy || stale}
								aria-label={"Usar este clip: " + (c.title || clock(c.start))}
								onClick={() =>
									void run(async (current) => {
										const updated = await nachoApi<P>(
											`/projects/${project.id}/shorts`,
											{
												start: c.start,
												end: c.end,
												revision: project.revision,
											},
										);
										if (!current()) return;
										onUpdated(updated);
										setFound(null);
										onMessage(
											`Clip de ${clock(c.start)} a ${clock(c.end)} aplicado a la propuesta. Revisa la previsualización y añádelo a la timeline.`,
										);
									})
								}
							>
								Usar este clip
							</Button>
						</li>
					))}
				</ol>
			) : null}
		</div>
	);
}

/* -------------------------------- Loudness -------------------------------- */

type Loudness = {
	source: string;
	fresh: boolean;
	integrated: number;
	truePeak: number;
	lra: number;
	platforms: {
		id: string;
		name: string;
		target: number;
		delta: number;
		status: string;
		advice: string;
	}[];
};
export const LOUDNESS_TARGETS = [
	[-14, "YouTube · −14 LUFS"],
	[-16, "Podcast y voz · −16 LUFS"],
	[-23, "TV · −23 LUFS"],
] as const;
const SOURCES: Record<string, string> = {
	export: "el render final",
	render: "el render final",
	preview: "la previsualización",
};
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function LoudnessBlock<P extends CreatorProject>({
	project,
	disabled,
	settings,
	onSetting,
	onSave,
}: Props<P>) {
	const { busy, error, run } = useCall(project.id);
	const [result, setResult] = useState<Loudness | null>(null);
	useEffect(() => setResult(null), [project.id]);
	const raw = Number(settings.audioTargetLufs ?? -16);
	const target = Number.isFinite(raw) ? Math.max(-24, Math.min(-9, raw)) : -16;
	const saved = Number(project.settings.audioTargetLufs ?? -16);
	const dirty = saved !== target;
	const custom = !LOUDNESS_TARGETS.some(([lufs]) => lufs === target);
	return (
		<div className="space-y-2 text-xs">
			<p className="text-muted-foreground">
				Mide el volumen del último render y compáralo con lo que recomienda cada
				plataforma. Necesitas haber generado antes la previsualización o el
				render final.
			</p>
			<label className="flex flex-col gap-1">
				Objetivo de volumen
				<select
					aria-label="Objetivo de volumen"
					className="rounded border bg-background p-1.5"
					disabled={disabled}
					value={target}
					onChange={(e) => onSetting({ audioTargetLufs: Number(e.target.value) })}
				>
					{LOUDNESS_TARGETS.map(([lufs, label]) => (
						<option key={lufs} value={lufs}>
							{label}
						</option>
					))}
					{custom ? (
						<option value={target}>Personalizado · {target} LUFS</option>
					) : null}
				</select>
			</label>
			{dirty ? (
				<div className="flex flex-wrap items-center gap-2 text-amber-300">
					<span>Objetivo sin guardar.</span>
					<Button
						size="sm"
						variant="outline"
						disabled={disabled}
						onClick={onSave}
					>
						Guardar objetivo
					</Button>
				</div>
			) : (
				<p className="text-muted-foreground">
					Es el volumen al que se normaliza la voz. Se guarda con el resto de
					ajustes de acabado.
				</p>
			)}
			<Button
				size="sm"
				disabled={disabled || busy}
				onClick={() =>
					void run(async (current) => {
						const measured = await nachoApi<Loudness>(
							`/projects/${project.id}/loudness`,
						);
						if (current()) setResult(measured);
					})
				}
			>
				{busy ? "Midiendo…" : "Medir volumen"}
			</Button>
			{error ? (
				<p role="alert" className="text-red-400">
					{error} Genera primero la previsualización o el render final.
				</p>
			) : null}
			{result ? (
				<div className="space-y-2" aria-label="Resultado de la medición">
					<dl className="grid grid-cols-3 gap-2 text-center">
						{[
							["Volumen", result.integrated, "LUFS"],
							["Pico real", result.truePeak, "dBTP"],
							["Rango", result.lra, "LU"],
						].map(([label, value, unit]) => (
							<div key={String(label)} className="xeno-card p-2">
								<dt className="xeno-kicker">{label}</dt>
								<dd className="xeno-mono text-sm">
									{Number(value).toFixed(1)} {unit}
								</dd>
							</div>
						))}
					</dl>
					<p className="text-muted-foreground">
						Medido sobre {SOURCES[result.source] || result.source || "el último render"}.
					</p>
					{!result.fresh ? (
						<p className="text-amber-300">
							Es de una versión anterior: vuelve a renderizar para medir los
							cambios.
						</p>
					) : null}
					<ul aria-label="Volumen por plataforma" className="space-y-1">
						{(result.platforms ?? []).map((p) => {
							const level = levelOf(p.status);
							return (
								<li
									key={p.id}
									data-platform={p.id}
									data-level={level}
									className="space-y-0.5 rounded border p-2"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="font-medium">{p.name}</span>
										<LevelMark
											level={level}
											label={
												level === "ok"
													? "En objetivo"
													: level === "warn"
														? "Ajustable"
														: "Fuera de rango"
											}
										/>
									</div>
									<p className="xeno-mono text-muted-foreground">
										Objetivo {p.target} LUFS · diferencia {signed(p.delta)} dB
									</p>
									{p.advice ? <p>{p.advice}</p> : null}
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
		</div>
	);
}

/* -------------------------------- Checklist -------------------------------- */

type Check = {
	platform: string;
	revision: number;
	items: { id: string; level: Level; title: string; detail: string }[];
	summary: { ok: number; warn: number; error: number };
};
export const PLATFORMS = [
	["youtube", "YouTube"],
	["shorts", "YouTube Shorts"],
	["reels", "Instagram Reels"],
	["tiktok", "TikTok"],
] as const;

function ChecklistBlock<P extends CreatorProject>({
	project,
	disabled,
}: Props<P>) {
	const { busy, error, run } = useCall(project.id);
	const profile = String(project.settings.profile || "");
	const [platform, setPlatform] = useState<string>(
		PLATFORMS.some(([id]) => id === profile) ? profile : "youtube",
	);
	const [check, setCheck] = useState<Check | null>(null);
	useEffect(() => setCheck(null), [project.id]);
	const name = PLATFORMS.find(([id]) => id === platform)?.[1] ?? platform;
	const load = (id: string) =>
		run(async (current) => {
			const revision = project.revision;
			const result = await nachoApi<Omit<Check, "revision">>(
				`/projects/${project.id}/checklist?platform=${id}`,
			);
			if (current()) setCheck({ ...result, revision });
		});
	return (
		<div className="space-y-2 text-xs">
			<p className="text-muted-foreground">
				Comprueba formato, duración, subtítulos, volumen y zonas seguras antes
				de subir el vídeo.
			</p>
			<label className="flex items-center justify-between gap-2">
				Plataforma
				<select
					aria-label="Plataforma de publicación"
					className="rounded border bg-background p-1.5"
					disabled={disabled || busy}
					value={platform}
					onChange={(e) => {
						setPlatform(e.target.value);
						if (check) void load(e.target.value);
					}}
				>
					{PLATFORMS.map(([id, label]) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</select>
			</label>
			<Button
				size="sm"
				disabled={disabled || busy}
				onClick={() => void load(platform)}
			>
				{busy ? "Revisando…" : "Revisar proyecto"}
			</Button>
			{error ? (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			) : null}
			{check ? (
				<div className="space-y-2" aria-label="Resultado de la revisión">
					<p
						className="flex flex-wrap items-center gap-1"
						aria-label="Resumen de la revisión"
					>
						<LevelMark
							level="ok"
							label={plural(check.summary.ok, "correcto", "correctos")}
						/>
						<LevelMark
							level="warn"
							label={plural(check.summary.warn, "aviso", "avisos")}
						/>
						<LevelMark
							level="error"
							label={plural(check.summary.error, "error", "errores")}
						/>
					</p>
					<p role="status">
						{check.summary.error
							? "Corrige los errores antes de publicar."
							: check.summary.warn
								? "Se puede publicar, pero revisa los avisos."
								: `Todo listo para publicar en ${name}.`}
					</p>
					{check.revision !== project.revision ? (
						<p className="text-amber-300">
							El proyecto cambió desde esta revisión: vuelve a revisar.
						</p>
					) : null}
					<ul aria-label="Puntos de la revisión" className="space-y-1">
						{check.items.map((item) => (
							<li
								key={item.id}
								data-level={item.level}
								className="flex items-start gap-2 rounded border p-2"
							>
								<span
									aria-hidden
									className={`xeno-chip grid size-5 shrink-0 place-items-center ${LEVEL_CLASS[item.level] ?? LEVEL_CLASS.warn}`}
								>
									{LEVEL_ICON[item.level] ?? "!"}
								</span>
								<div className="min-w-0">
									<p className="font-medium">
										<span className="sr-only">
											{LEVEL_TEXT[item.level] ?? "Aviso"}:{" "}
										</span>
										{item.title}
									</p>
									{item.detail ? (
										<p className="text-muted-foreground">{item.detail}</p>
									) : null}
								</div>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

/* ---------------------------------- Tools --------------------------------- */

export function CreatorTools<P extends CreatorProject>(props: Props<P>) {
	return (
		<div className="space-y-2" aria-label="Herramientas para creadores">
			<details className="rounded border p-2" data-tool="shorts">
				<summary className="cursor-pointer text-xs font-medium">
					Clips para Shorts
				</summary>
				<div className="mt-2">
					<ShortsBlock {...props} />
				</div>
			</details>
			<details className="rounded border p-2" data-tool="volumen">
				<summary className="cursor-pointer text-xs font-medium">Volumen</summary>
				<div className="mt-2">
					<LoudnessBlock {...props} />
				</div>
			</details>
			<details className="rounded border p-2" data-tool="revision">
				<summary className="cursor-pointer text-xs font-medium">
					Revisión antes de publicar
				</summary>
				<div className="mt-2">
					<ChecklistBlock {...props} />
				</div>
			</details>
		</div>
	);
}

/* ------------------------------- Colour looks ------------------------------ */

type Lut = { stem: string; title: string; description: string; preview?: string };

// A look is a LUT from the library; "" keeps the original colour.
export function LutPicker({
	value,
	onChange,
	disabled,
}: {
	value: string;
	onChange: (stem: string) => void;
	disabled?: boolean;
}) {
	const group = useId();
	const [luts, setLuts] = useState<Lut[] | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let alive = true;
		nachoApi<{ luts?: Lut[] }>("/library/luts")
			.then((r) => {
				if (alive) setLuts(Array.isArray(r.luts) ? r.luts : []);
			})
			.catch(() => {
				if (alive) setFailed(true);
			});
		return () => {
			alive = false;
		};
	}, []);
	const option =
		"block rounded border border-border p-1 text-center text-[10px] peer-checked:border-emerald-400/70 peer-checked:ring-1 peer-checked:ring-emerald-400/60 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50";
	const known = !value || !!luts?.some((l) => l.stem === value);
	return (
		<fieldset className="space-y-2 text-xs" disabled={disabled}>
			<legend className="font-medium">Look de color (LUT)</legend>
			<div
				role="radiogroup"
				aria-label="Look de color (LUT)"
				className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2"
			>
				<label className="relative block cursor-pointer">
					<input
						type="radio"
						name={group}
						value=""
						className="peer sr-only"
						checked={!value}
						onChange={() => onChange("")}
					/>
					<span className={option + " grid aspect-video place-items-center"}>
						Sin look
					</span>
				</label>
				{(luts ?? []).map((lut) => (
					<label
						key={lut.stem}
						className="relative block cursor-pointer"
						title={lut.description}
					>
						<input
							type="radio"
							name={group}
							value={lut.stem}
							className="peer sr-only"
							checked={value === lut.stem}
							onChange={() => onChange(lut.stem)}
						/>
						<span className={option}>
							<img
								src={`/nacho-api/library/lut-preview/${encodeURIComponent(lut.stem)}`}
								alt=""
								loading="lazy"
								decoding="async"
								className="aspect-video w-full rounded object-cover"
							/>
							<span className="mt-1 block truncate">{lut.title}</span>
						</span>
					</label>
				))}
			</div>
			{!known ? (
				<p className="text-amber-300">
					El look guardado («{value}») ya no está en la biblioteca.
				</p>
			) : null}
			{failed ? (
				<p className="text-muted-foreground">
					No se pudieron cargar los looks: arranca el motor local.
				</p>
			) : luts && !luts.length ? (
				<p className="text-muted-foreground">
					Aún no hay looks. Genera el pack de LUTs en Recursos · ASSET FORGE.
				</p>
			) : null}
			<p className="text-muted-foreground">
				El look se aplica al preparar el original mejorado y en el render. Pulsa
				Guardar retoque para fijarlo.
			</p>
		</fieldset>
	);
}
