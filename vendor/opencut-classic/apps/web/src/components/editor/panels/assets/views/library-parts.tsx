"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyText, nachoApi } from "./nacho-api";

/* --------------------------------- Types ---------------------------------- */

export type License = {
	id: string;
	name: string;
	url: string;
	attribution: boolean;
	commercial: boolean;
	derivatives: boolean;
	shareAlike: boolean;
	redistribution: boolean;
	notes: string;
};
export type LocalItem = {
	id: string;
	hash: string;
	kind: string;
	category: string;
	title: string;
	tags: string[];
	size: number;
	width: number;
	height: number;
	duration: number;
	hasAlpha: boolean;
	ext: string;
	license: License;
	attribution: string;
	sources: {
		connector: string;
		sourceUrl: string;
		author: string;
		fetchedAt: string;
	}[];
	generated: boolean;
	external: boolean;
	addedAt: string | number;
	url: string;
};
export type RemoteItem = {
	key: string;
	connector: string;
	connectorName: string;
	sourceId: string;
	kind: string;
	title: string;
	author: string;
	authorUrl: string;
	sourceUrl: string;
	previewUrl: string;
	audioUrl: string;
	fontUrl: string;
	width: number;
	height: number;
	duration: number;
	format: string;
	size: number;
	tags: string[];
	license: License;
	attribution: string;
	canDownload: boolean;
	note: string;
	owned: string | null;
	requiresAck?: string;
};
export type Connector = {
	id: string;
	name: string;
	tier: "primary" | "secondary";
	mode: "api" | "manual";
	homepage: string;
	kinds: string[];
	formats: string[];
	auth: { type: "none" | "key"; keyName?: string; signup?: string; note?: string };
	configured: boolean;
	attribution: "none" | "recommended" | "required" | "per-item";
	license: { summary: string; ids?: string[] };
	restrictions: string[];
	limits: {
		perMinute?: number;
		perHour?: number;
		perDay?: number;
		perMonth?: number;
		note?: string;
	};
	credit?: string;
	requiresAck?: string;
	manual?: { importHint: string; licenseHint: string; url: string };
};
export type ForgePack = {
	id: string;
	available?: boolean;
	title: string;
	description: string;
	count: number;
	generated: boolean;
};
export type LibraryStatus = {
	connectors: Connector[];
	stats: {
		items: number;
		bytes: number;
		generated: number;
		byKind?: Record<string, number>;
		byConnector?: Record<string, number>;
	};
	forge: { packs: ForgePack[] };
};

/* --------------------------------- Helpers -------------------------------- */

// Remote data is untrusted: only plain http(s) links ever reach an href or src.
export const safeHref = (url?: string | null) =>
	url && /^https?:\/\//i.test(url) ? url : undefined;
// Remote thumbnails always go through the local proxy; never hotlinked.
export const thumbUrl = (previewUrl: string) =>
	"/nacho-api/library/thumb?url=" + encodeURIComponent(previewUrl);
export const fileUrl = (id: string) =>
	"/nacho-api/library/file/" + encodeURIComponent(id);
export const megabytes = (bytes: number) =>
	(Math.max(0, bytes) / (1024 * 1024)).toFixed(
		bytes >= 10 * 1024 * 1024 ? 0 : 1,
	);
const fileSize = (bytes: number) =>
	bytes >= 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
const length = (seconds: number) =>
	seconds >= 60
		? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")} min`
		: `${seconds.toFixed(1)} s`;

export const KINDS = [
	["all", "Todo"],
	["image", "Imágenes"],
	["video", "Vídeo"],
	["audio", "Audio"],
	["font", "Fuentes"],
	["texture", "Texturas"],
	["lut", "LUTs"],
	["lottie", "Lottie"],
] as const;
export const KIND_LABELS: Record<string, string> = Object.fromEntries(KINDS);
// Mirrors the categories the engine assigns (server/library/classify.mjs).
export const CATEGORIES = [
	"Efecto de sonido",
	"Música",
	"Ambiente",
	"Foto",
	"Ilustración",
	"Icono",
	"Sticker",
	"Meme",
	"GIF",
	"Overlay",
	"Overlay en vídeo",
	"Fondo",
	"Textura",
	"Vídeo de recurso (B-roll)",
	"Vídeo vertical",
	"Fondo animado",
	"Tipografía",
	"Tipografía manuscrita",
	"LUT de color",
	"Animación Lottie",
	"Modelo 3D",
	"Plantilla para creadores",
	"Guía de zonas seguras",
	"Otro",
];
export const IMPORT_LICENSES = [
	"CC0-1.0",
	"CC-BY",
	"CC-BY-SA",
	"CC-BY-NC",
	"OFL-1.1",
	"Pexels",
	"Pixabay",
	"Mixkit",
	"Lottie-Simple",
	"OGA-BY",
	"Third-party",
	"Personal",
	"Unknown",
];

export type Tone = "ok" | "warn" | "bad";
export function licenseTone(license?: Partial<License> | null): Tone {
	if (!license || license.commercial === false) return "bad";
	return license.attribution ? "warn" : "ok";
}
const TONE_CLASS: Record<Tone, string> = {
	ok: "border-emerald-400/40 text-emerald-300",
	warn: "border-amber-400/40 text-amber-300",
	bad: "border-red-400/40 text-red-300",
};

export function LicenseBadge({ license }: { license?: License | null }) {
	const tone = licenseTone(license);
	const label = license?.id || license?.name || "Sin licencia";
	const suffix =
		tone === "bad" ? " · no comercial" : tone === "warn" ? " · atribución" : "";
	const note = [
		license?.name,
		license?.attribution ? "Exige atribución." : "No exige atribución.",
		license?.commercial === false ? "No permite uso comercial." : "",
		license?.derivatives === false ? "No permite obras derivadas." : "",
		license?.shareAlike ? "Las obras derivadas deben compartirse igual." : "",
		license?.redistribution === false ? "No se puede redistribuir." : "",
		license?.notes,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<span
			data-tone={tone}
			data-license={label}
			title={note}
			className={`xeno-chip inline-flex max-w-full items-center gap-1 truncate px-2 py-0.5 ${TONE_CLASS[tone]}`}
		>
			<span aria-hidden className="xeno-dot" style={{ width: 6, height: 6 }} />
			<span className="truncate">
				{label}
				{suffix}
			</span>
		</span>
	);
}

/* ------------------------------- Card model -------------------------------- */

export type View = {
	id: string;
	origin: "local" | "remote";
	kind: string;
	title: string;
	author: string;
	authorUrl?: string;
	sourceUrl?: string;
	format: string;
	width: number;
	height: number;
	duration: number;
	size: number;
	license: License;
	attribution: string;
	category?: string;
	via?: string;
	previewSrc?: string;
	mediaSrc?: string;
	alpha?: boolean;
	generated?: boolean;
	external?: boolean;
	canDownload?: boolean;
	note?: string;
	requiresAck?: string;
};

export function localView(item: LocalItem): View {
	const sources = item.sources ?? [];
	const first = sources.find((s) => safeHref(s.sourceUrl)) ?? sources[0];
	return {
		id: item.id,
		origin: "local",
		kind: item.kind,
		title: item.title || item.id,
		author: first?.author || "",
		sourceUrl: safeHref(first?.sourceUrl),
		format: (item.ext || "").toUpperCase(),
		width: item.width || 0,
		height: item.height || 0,
		duration: item.duration || 0,
		size: item.size || 0,
		license: item.license,
		attribution: item.attribution || "",
		category: item.category,
		via: item.generated ? "Generado por Elite Editor" : first?.connector,
		previewSrc: fileUrl(item.id),
		mediaSrc: fileUrl(item.id),
		alpha: item.hasAlpha,
		generated: item.generated,
		external: item.external,
	};
}

export function remoteView(item: RemoteItem): View {
	const preview = safeHref(item.previewUrl);
	return {
		id: item.key,
		origin: "remote",
		kind: item.kind,
		title: item.title || "Sin título",
		author: item.author || "",
		authorUrl: safeHref(item.authorUrl),
		sourceUrl: safeHref(item.sourceUrl),
		format: (item.format || "").toUpperCase(),
		width: item.width || 0,
		height: item.height || 0,
		duration: item.duration || 0,
		size: item.size || 0,
		license: item.license,
		attribution: item.attribution || "",
		via: item.connectorName,
		previewSrc: preview ? thumbUrl(preview) : undefined,
		mediaSrc:
			item.kind === "audio"
				? safeHref(item.audioUrl)
				: item.kind === "font"
					? safeHref(item.fontUrl)
					: undefined,
		canDownload: item.canDownload,
		note: item.note,
		requiresAck: item.requiresAck,
	};
}

// What "Copiar atribución" puts in the clipboard.
export function attributionOf(v: View) {
	if (v.attribution) return v.attribution;
	return (
		[
			`«${v.title}»`,
			v.author ? `de ${v.author}` : "",
			v.license?.name || "",
			v.via && v.origin === "remote" ? `vía ${v.via}` : "",
		]
			.filter(Boolean)
			.join(", ") + (v.sourceUrl ? ` (${v.sourceUrl})` : "")
	);
}

/* --------------------------------- Preview -------------------------------- */

const hash = (text: string) => {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
};

// Loads a font file as a FontFace so the card can show "Aa" in the real typeface.
function useFont(url?: string) {
	const [family, setFamily] = useState("");
	useEffect(() => {
		setFamily("");
		if (!url) return;
		let alive = true;
		void (async () => {
			try {
				const name = "lib-" + hash(url);
				const face = new FontFace(
					name,
					`url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`,
				);
				await face.load();
				document.fonts.add(face);
				if (alive) setFamily(name);
			} catch {
				// Unsupported or blocked font: the card keeps the default typeface.
			}
		})();
		return () => {
			alive = false;
		};
	}, [url]);
	return family;
}

const BOX =
	"flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-black/40";

function Thumb({ v }: { v: View }) {
	const [broken, setBroken] = useState(false);
	const family = useFont(v.kind === "font" ? v.mediaSrc : undefined);
	useEffect(() => setBroken(false), [v.previewSrc]);
	if (v.kind === "audio")
		return (
			<div className={BOX}>
				{v.mediaSrc ? (
					<audio
						controls
						preload="none"
						src={v.mediaSrc}
						aria-label={"Escuchar: " + v.title}
						className="h-9 w-full"
					/>
				) : (
					<span className="text-[10px] text-muted-foreground">Sin audio</span>
				)}
			</div>
		);
	if (v.kind === "font")
		return (
			<div className={BOX}>
				<span
					aria-hidden
					className="text-4xl"
					style={family ? { fontFamily: `"${family}"` } : undefined}
				>
					Aa
				</span>
			</div>
		);
	if (v.kind === "video" && v.origin === "local" && v.mediaSrc)
		return (
			<video
				className={BOX + " object-cover"}
				src={v.mediaSrc + "#t=0.1"}
				muted
				controls
				playsInline
				preload="metadata"
				aria-label={"Vídeo: " + v.title}
			/>
		);
	if (v.previewSrc && !broken && v.kind !== "lut" && v.kind !== "lottie")
		return (
			<div className={BOX}>
				<img
					src={v.previewSrc}
					alt={v.title}
					loading="lazy"
					decoding="async"
					className="h-full w-full object-contain"
					onError={() => setBroken(true)}
				/>
			</div>
		);
	return (
		<div className={BOX}>
			<span className="xeno-kicker">
				{v.kind === "lut"
					? "LUT"
					: v.kind === "lottie"
						? "Lottie"
						: "Sin vista previa"}
			</span>
		</div>
	);
}

/* ---------------------------------- Card ---------------------------------- */

const LINK =
	"inline-flex h-7 items-center rounded-sm border border-border px-2.5 text-xs hover:bg-accent";
const TIMELINE_KINDS = ["image", "video", "audio"];

export function ResultCard({
	v,
	owned = false,
	busy,
	onDownload,
	onAdd,
	onRemove,
}: {
	v: View;
	owned?: boolean;
	busy?: string;
	// Resolves with the acknowledgement text when the engine asks for one (HTTP 428).
	onDownload?: (ack: boolean) => Promise<string | undefined>;
	onAdd?: () => void;
	onRemove?: () => void;
}) {
	const [ask, setAsk] = useState<
		{ type: "ack"; text: string } | { type: "remove" } | null
	>(null);
	const [copied, setCopied] = useState(false);
	const measures = [
		v.width && v.height ? `${v.width}×${v.height}` : "",
		v.duration ? length(v.duration) : "",
		v.size ? fileSize(v.size) : "",
	].filter(Boolean);
	async function download(ack: boolean) {
		if (!onDownload) return;
		if (!ack && v.requiresAck) {
			setAsk({ type: "ack", text: v.requiresAck });
			return;
		}
		const needed = await onDownload(ack);
		setAsk(needed ? { type: "ack", text: needed } : null);
	}
	return (
		<article
			className="xeno-card flex min-w-0 flex-col gap-2 p-2"
			data-origin={v.origin}
			data-kind={v.kind}
			aria-label={v.title}
		>
			<Thumb v={v} />
			<div className="min-w-0 space-y-0.5">
				<p className="truncate text-xs font-medium" title={v.title}>
					{v.title}
				</p>
				<p className="truncate text-[10px] text-muted-foreground">
					{[v.author, v.format, ...measures].filter(Boolean).join(" · ") ||
						KIND_LABELS[v.kind] ||
						v.kind}
				</p>
				{v.category || v.via ? (
					<p className="truncate text-[10px] text-muted-foreground">
						{[v.category, v.via && "vía " + v.via].filter(Boolean).join(" · ")}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<LicenseBadge license={v.license} />
				{v.generated ? (
					<span className="xeno-chip px-2 py-0.5 text-sky-300">Generado</span>
				) : null}
				{v.external ? (
					<span
						className="xeno-chip px-2 py-0.5 text-muted-foreground"
						title="Archivo enlazado: no se copia a la biblioteca"
					>
						Enlazado
					</span>
				) : null}
				{v.origin === "remote" && owned ? (
					<span className="xeno-chip px-2 py-0.5 text-emerald-300">
						Ya en tu biblioteca
					</span>
				) : null}
			</div>
			{v.origin === "remote" && !v.canDownload && v.note ? (
				<p className="text-[10px] text-muted-foreground">{v.note}</p>
			) : null}
			{ask?.type === "ack" ? (
				<div
					role="group"
					aria-label="Confirmación de descarga"
					className="space-y-1 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-[11px]"
				>
					<p>{ask.text}</p>
					<div className="flex flex-wrap gap-1">
						<Button
							size="sm"
							className="text-xs"
							disabled={!!busy}
							onClick={() => void download(true)}
						>
							Confirmar y descargar
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="text-xs"
							onClick={() => setAsk(null)}
						>
							Cancelar
						</Button>
					</div>
				</div>
			) : null}
			{ask?.type === "remove" ? (
				<div
					role="group"
					aria-label="Confirmación de borrado"
					className="space-y-1 rounded border border-red-400/40 bg-red-400/5 p-2 text-[11px]"
				>
					<p>
						¿Eliminar «{v.title}» de tu biblioteca? Se borra el archivo y no se
						puede deshacer.
					</p>
					<div className="flex flex-wrap gap-1">
						<Button
							size="sm"
							variant="outline"
							className="text-xs"
							disabled={!!busy}
							onClick={() => {
								setAsk(null);
								onRemove?.();
							}}
						>
							Sí, eliminar
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="text-xs"
							onClick={() => setAsk(null)}
						>
							Cancelar
						</Button>
					</div>
				</div>
			) : null}
			{busy ? (
				<p role="status" className="text-[10px] text-sky-300">
					{busy}
				</p>
			) : null}
			<div className="flex flex-wrap gap-1">
				{v.origin === "remote" && onDownload && !owned && v.canDownload ? (
					<Button
						size="sm"
						className="text-xs"
						disabled={!!busy}
						aria-label={"Descargar: " + v.title}
						onClick={() => void download(false)}
					>
						Descargar
					</Button>
				) : null}
				{v.origin === "local" && onAdd && TIMELINE_KINDS.includes(v.kind) ? (
					<Button
						size="sm"
						className="text-xs"
						disabled={!!busy}
						aria-label={"Añadir a la timeline: " + v.title}
						onClick={onAdd}
					>
						Añadir a la timeline
					</Button>
				) : null}
				{v.sourceUrl ? (
					<a
						className={LINK}
						href={v.sourceUrl}
						target="_blank"
						rel="noreferrer noopener"
						aria-label={"Abrir fuente: " + v.title}
					>
						Abrir fuente
					</a>
				) : null}
				<Button
					size="sm"
					variant="outline"
					className="text-xs"
					aria-label={"Copiar atribución: " + v.title}
					onClick={() =>
						void copyText(attributionOf(v)).then((ok) => {
							setCopied(ok);
							setTimeout(() => setCopied(false), 1500);
						})
					}
				>
					{copied ? "Copiada ✓" : "Copiar atribución"}
				</Button>
				{v.origin === "local" && onRemove && !v.external ? (
					<Button
						size="sm"
						variant="ghost"
						className="text-xs text-red-300"
						disabled={!!busy}
						aria-label={"Eliminar: " + v.title}
						onClick={() => setAsk({ type: "remove" })}
					>
						Eliminar
					</Button>
				) : null}
			</div>
		</article>
	);
}

/* ------------------------------ Download call ------------------------------ */

// nachoApi hides the HTTP status; the download needs it to tell "ack required" (428) apart.
export async function downloadItem(
	key: string,
	ack: boolean,
): Promise<{ item: LocalItem; duplicate: boolean } | { needsAck: string }> {
	const session = await fetch("/nacho-api/session");
	if (!session.ok) throw Error("El motor local no responde");
	const token = (await session.json()).token;
	const response = await fetch("/nacho-api/library/download", {
		method: "POST",
		headers: { "x-studio-token": token, "Content-Type": "application/json" },
		body: JSON.stringify(ack ? { key, ack: true } : { key }),
	});
	const body = await response.json().catch(() => ({}));
	if (response.status === 428)
		return {
			needsAck: String(
				body.error ||
					body.requiresAck ||
					"Confirma que aceptas las condiciones de este recurso.",
			),
		};
	if (!response.ok) throw Error(body.error || "No se pudo descargar el recurso");
	return body;
}

/* --------------------------------- Sources -------------------------------- */

const ATTRIBUTION: Record<Connector["attribution"], string> = {
	none: "No necesaria",
	recommended: "Recomendada",
	required: "Obligatoria",
	"per-item": "Según cada recurso",
};

function limitsText(c: Connector) {
	const l = c.limits || {};
	return [
		l.perMinute ? `${l.perMinute}/min` : "",
		l.perHour ? `${l.perHour}/h` : "",
		l.perDay ? `${l.perDay}/día` : "",
		l.perMonth ? `${l.perMonth}/mes` : "",
		l.note || "",
	]
		.filter(Boolean)
		.join(" · ");
}

type Imported = { item: LocalItem; duplicate: boolean };

function ImportForm({
	connector,
	onImported,
}: {
	connector: Connector;
	onImported: (result: Imported) => void;
}) {
	const first = connector.license?.ids?.find((id) =>
		IMPORT_LICENSES.includes(id),
	);
	const [file, setFile] = useState<File | null>(null);
	const [license, setLicense] = useState(first || "Unknown");
	const [author, setAuthor] = useState("");
	const [source, setSource] = useState("");
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState("");
	const [round, setRound] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	async function submit() {
		if (!file) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			const session = await nachoApi<{ token: string }>("/session");
			const params = new URLSearchParams({
				name: file.name,
				connector: connector.id,
				license,
			});
			for (const [key, value] of [
				["author", author],
				["source", source],
				["title", title],
				["tags", tags],
			])
				if (value.trim()) params.set(key, value.trim());
			const response = await fetch("/nacho-api/library/import?" + params, {
				method: "POST",
				headers: { "x-studio-token": session.token },
				body: file,
			});
			const body = await response.json();
			if (!response.ok) throw Error(body.error || "No se pudo importar el archivo");
			onImported(body);
			setMessage(
				body.duplicate
					? "Ya estaba en tu biblioteca: no se ha duplicado."
					: `Importado a tu biblioteca: ${body.item?.title || file.name}`,
			);
			setFile(null);
			setAuthor("");
			setSource("");
			setTitle("");
			setTags("");
			setRound((n) => n + 1);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}
	return (
		<form
			className="space-y-2 rounded border border-dashed p-2"
			aria-label={"Importar archivo de " + connector.name}
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<p className="text-[11px] font-medium">Importar un archivo descargado</p>
			<label className="block text-[11px]">
				Archivo
				<input
					key={round}
					type="file"
					aria-label={"Archivo para importar de " + connector.name}
					className="mt-1 block w-full text-xs"
					disabled={busy}
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				/>
			</label>
			<label className="block text-[11px]">
				Licencia
				<select
					aria-label={"Licencia del archivo de " + connector.name}
					className="mt-1 w-full rounded border bg-background p-1.5 text-xs"
					value={license}
					disabled={busy}
					onChange={(e) => setLicense(e.target.value)}
				>
					{IMPORT_LICENSES.map((id) => (
						<option key={id} value={id}>
							{id}
						</option>
					))}
				</select>
			</label>
			<label className="block text-[11px]">
				Autor
				<Input
					aria-label={"Autor del archivo de " + connector.name}
					size="sm"
					placeholder="Nombre del autor"
					value={author}
					disabled={busy}
					onChange={(e) => setAuthor(e.target.value)}
				/>
			</label>
			<label className="block text-[11px]">
				URL de origen
				<Input
					aria-label={"URL de origen del archivo de " + connector.name}
					size="sm"
					type="url"
					placeholder="https://…"
					value={source}
					disabled={busy}
					onChange={(e) => setSource(e.target.value)}
				/>
			</label>
			<label className="block text-[11px]">
				Título
				<Input
					aria-label={"Título del archivo de " + connector.name}
					size="sm"
					placeholder="Opcional"
					value={title}
					disabled={busy}
					onChange={(e) => setTitle(e.target.value)}
				/>
			</label>
			<label className="block text-[11px]">
				Etiquetas
				<Input
					aria-label={"Etiquetas del archivo de " + connector.name}
					size="sm"
					placeholder="lluvia, ambiente, bosque"
					value={tags}
					disabled={busy}
					onChange={(e) => setTags(e.target.value)}
				/>
			</label>
			<Button
				type="submit"
				size="sm"
				className="text-xs"
				disabled={busy || !file}
				aria-label={"Importar a la biblioteca desde " + connector.name}
			>
				{busy ? "Importando…" : "Importar a la biblioteca"}
			</Button>
			{error ? (
				<p role="alert" className="text-[11px] text-red-400">
					{error}
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-[11px] text-emerald-300">
					{message}
				</p>
			) : null}
		</form>
	);
}

function KeyForm({
	connector,
	onSaved,
}: {
	connector: Connector;
	onSaved: () => void;
}) {
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const signup = safeHref(connector.auth.signup);
	return (
		<form
			className="space-y-2"
			aria-label={"Clave de " + connector.name}
			onSubmit={(e) => {
				e.preventDefault();
				if (!key.trim()) return;
				setBusy(true);
				setError("");
				setMessage("");
				nachoApi("/library/keys", { connector: connector.id, key: key.trim() })
					.then(() => {
						setKey("");
						setMessage("Clave guardada en este equipo.");
						onSaved();
					})
					.catch((err) => setError((err as Error).message))
					.finally(() => setBusy(false));
			}}
		>
			<label className="block text-[11px]">
				Clave de {connector.name}
				{connector.auth.keyName ? ` · ${connector.auth.keyName}` : ""}
				<Input
					type="password"
					autoComplete="off"
					size="sm"
					aria-label={"Clave de " + connector.name}
					placeholder={connector.configured ? "Clave guardada · pega otra para cambiarla" : "Pega aquí tu clave"}
					value={key}
					disabled={busy}
					onChange={(e) => setKey(e.target.value)}
				/>
			</label>
			{connector.auth.note ? (
				<p className="text-[11px] text-muted-foreground">{connector.auth.note}</p>
			) : null}
			<div className="flex flex-wrap gap-1">
				<Button
					type="submit"
					size="sm"
					className="text-xs"
					disabled={busy || !key.trim()}
					aria-label={"Guardar clave de " + connector.name}
				>
					{busy ? "Guardando…" : "Guardar clave"}
				</Button>
				{signup ? (
					<a
						className={LINK}
						href={signup}
						target="_blank"
						rel="noreferrer noopener"
					>
						Conseguir clave
					</a>
				) : null}
			</div>
			{error ? (
				<p role="alert" className="text-[11px] text-red-400">
					{error}
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-[11px] text-emerald-300">
					{message}
				</p>
			) : null}
		</form>
	);
}

function ConnectorCard({
	connector: c,
	onChanged,
	onImported,
}: {
	connector: Connector;
	onChanged: () => void;
	onImported: (result: Imported) => void;
}) {
	const home = safeHref(c.homepage);
	const manualUrl = safeHref(c.manual?.url);
	const limits = limitsText(c);
	const needsKey = c.auth?.type === "key";
	return (
		<details className="xeno-card p-2 text-xs" data-connector={c.id}>
			<summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
				<span className="font-medium">{c.name}</span>
				<span className="xeno-chip px-2 py-0.5 text-muted-foreground">
					{c.tier === "primary" ? "Principal" : "Secundaria"}
				</span>
				<span className="xeno-chip px-2 py-0.5 text-muted-foreground">
					{c.mode === "manual" ? "Importación manual" : "Búsqueda por API"}
				</span>
				{needsKey ? (
					<span
						className={`xeno-chip px-2 py-0.5 ${c.configured ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}
					>
						{c.configured ? "Clave guardada" : "Falta la clave"}
					</span>
				) : c.mode === "api" ? (
					<span className="xeno-chip px-2 py-0.5 text-emerald-300">Sin clave</span>
				) : null}
			</summary>
			<div className="mt-2 space-y-2">
				<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
					<dt className="text-muted-foreground">Tipos</dt>
					<dd>{(c.kinds || []).map((k) => KIND_LABELS[k] || k).join(", ") || "—"}</dd>
					<dt className="text-muted-foreground">Formatos</dt>
					<dd>{(c.formats || []).join(", ") || "—"}</dd>
					<dt className="text-muted-foreground">Licencia</dt>
					<dd>{c.license?.summary || "—"}</dd>
					<dt className="text-muted-foreground">Atribución</dt>
					<dd>{ATTRIBUTION[c.attribution] || c.attribution}</dd>
					{limits ? (
						<>
							<dt className="text-muted-foreground">Límites</dt>
							<dd>{limits}</dd>
						</>
					) : null}
				</dl>
				{c.restrictions?.length ? (
					<ul
						aria-label={"Restricciones de " + c.name}
						className="list-disc space-y-0.5 pl-4 text-amber-300"
					>
						{c.restrictions.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				) : null}
				{c.credit ? <p className="text-muted-foreground">{c.credit}</p> : null}
				{home ? (
					<a
						className={LINK}
						href={home}
						target="_blank"
						rel="noreferrer noopener"
						aria-label={"Sitio web de " + c.name}
					>
						Sitio web
					</a>
				) : null}
				{needsKey ? <KeyForm connector={c} onSaved={onChanged} /> : null}
				{c.mode === "manual" ? (
					<div className="space-y-2">
						{c.manual?.importHint ? <p>{c.manual.importHint}</p> : null}
						{c.manual?.licenseHint ? (
							<p className="text-amber-300">{c.manual.licenseHint}</p>
						) : null}
						{manualUrl ? (
							<a
								className={LINK}
								href={manualUrl}
								target="_blank"
								rel="noreferrer noopener"
								aria-label={"Abrir sitio de " + c.name}
							>
								Abrir sitio
							</a>
						) : null}
						<ImportForm connector={c} onImported={onImported} />
					</div>
				) : null}
			</div>
		</details>
	);
}

export function SourcesSection({
	connectors,
	onChanged,
	onImported,
}: {
	connectors: Connector[];
	onChanged: () => void;
	onImported: (result: Imported) => void;
}) {
	return (
		<details className="xeno-card space-y-2 p-3" data-section="fuentes">
			<summary className="xeno-heading cursor-pointer" data-index="02">
				Fuentes
			</summary>
			<p className="mt-2 text-xs text-muted-foreground">
				De dónde puede traer recursos la biblioteca. Las que piden clave son
				gratuitas: la clave se guarda solo en este equipo. Las manuales no
				permiten descarga automática: abre el sitio, descarga y arrastra el
				archivo aquí con su licencia.
			</p>
			{connectors.length ? (
				<div className="space-y-2">
					{connectors.map((c) => (
						<ConnectorCard
							key={c.id}
							connector={c}
							onChanged={onChanged}
							onImported={onImported}
						/>
					))}
				</div>
			) : (
				<p className="text-xs text-muted-foreground">
					No se han podido cargar las fuentes.
				</p>
			)}
		</details>
	);
}

/* ----------------------------------- Forge -------------------------------- */

type ForgeResult = {
	made: number;
	total: number;
	failed: { id: string; error: string }[];
};

export function ForgeSection({
	packs,
	onChanged,
}: {
	packs: ForgePack[];
	onChanged: () => void;
}) {
	const [running, setRunning] = useState("");
	const [results, setResults] = useState<Record<string, ForgeResult>>({});
	const [error, setError] = useState("");
	async function generate(pack: ForgePack) {
		setRunning(pack.id);
		setError("");
		try {
			const result = await nachoApi<ForgeResult>(
				"/library/forge",
				pack.generated ? { pack: pack.id, force: true } : { pack: pack.id },
			);
			setResults((r) => ({ ...r, [pack.id]: result }));
			onChanged();
		} catch (e) {
			setError(`${pack.title}: ${(e as Error).message}`);
		} finally {
			setRunning("");
		}
	}
	return (
		<details className="xeno-card space-y-2 p-3" data-section="forge">
			<summary className="xeno-heading cursor-pointer" data-index="03">
				ASSET FORGE
			</summary>
			<p className="mt-2 text-xs text-muted-foreground">
				Recursos originales creados en tu equipo con FFmpeg: libres de derechos
				(CC0) y sin conexión. Cada pack puede tardar unos minutos; los que ya
				existen no se vuelven a crear salvo que pulses Regenerar.
			</p>
			{running ? (
				<div className="space-y-1" role="status" aria-live="polite">
					<div
						role="progressbar"
						aria-label="Generando recursos"
						data-indeterminate="true"
						className="xeno-progress w-full"
					>
						<span />
					</div>
					<p className="text-[11px] text-sky-300">
						Generando… no cierres el editor.
					</p>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="text-xs text-red-400">
					{error}
				</p>
			) : null}
			{packs.length ? (
				<ul className="space-y-2" aria-label="Packs generables">
					{packs.map((pack) => {
						const result = results[pack.id];
						const active = running === pack.id;
						return (
							<li
								key={pack.id}
								className="space-y-1 rounded border p-2 text-xs"
								data-pack={pack.id}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="font-medium">{pack.title}</p>
									<span
										className={`xeno-chip px-2 py-0.5 ${pack.generated ? "border-emerald-400/40 text-emerald-300" : "text-muted-foreground"}`}
									>
										{pack.generated ? "Generado" : "Pendiente"} ·{" "}
										{pack.count} recursos
									</span>
								</div>
								<p className="text-muted-foreground">{pack.description}</p>
								<Button
									size="sm"
									variant={pack.generated ? "outline" : "default"}
									className="text-xs"
									disabled={!!running || pack.available === false}
									aria-label={`${pack.generated ? "Regenerar" : "Generar"}: ${pack.title}`}
									onClick={() => void generate(pack)}
								>
									{pack.available === false ? "En desarrollo" : active ? "Generando…" : pack.generated ? "Regenerar" : "Generar"}
								</Button>
								{result ? (
									<div role="status" className="space-y-0.5">
										<p
											className={
												result.failed?.length
													? "text-amber-300"
													: "text-emerald-300"
											}
										>
											{result.made} generados de {result.total}
											{result.failed?.length
												? ` · ${result.failed.length} con fallos`
												: ""}
										</p>
										{result.failed?.length ? (
											<ul className="list-disc pl-4 text-[11px] text-amber-300">
												{result.failed.map((f) => (
													<li key={f.id}>
														{f.id}: {f.error}
													</li>
												))}
											</ul>
										) : null}
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			) : (
				<p className="text-xs text-muted-foreground">
					No hay packs disponibles todavía.
				</p>
			)}
		</details>
	);
}
