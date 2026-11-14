"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { nachoApi } from "./nacho-api";
import {
	CATEGORIES,
	ForgeSection,
	KIND_LABELS,
	KINDS,
	ResultCard,
	SourcesSection,
	downloadItem,
	fileUrl,
	localView,
	megabytes,
	remoteView,
	type LibraryStatus,
	type LocalItem,
	type RemoteItem,
} from "./library-parts";

type Scope = "all" | "local" | "remote";
type Search = {
	query: { original: string; english: string; translated: boolean };
	local: { items: LocalItem[]; total: number };
	remote: {
		items: RemoteItem[];
		total: number;
		errors: { connector: string; name: string; error: string }[];
		skipped: { connector: string; name: string; reason: string }[];
	};
	tookMs: number;
	// Scope actually asked of the engine (an empty text only browses the local library).
	scope: Scope;
};
const SCOPES: [Scope, string][] = [
	["local", "Mi biblioteca"],
	["remote", "Fuentes externas"],
	["all", "Todo"],
];

const normalize = (raw: Partial<Search>, scope: Scope): Search => ({
	query: {
		original: raw.query?.original ?? "",
		english: raw.query?.english ?? "",
		translated: !!raw.query?.translated,
	},
	local: {
		items: raw.local?.items ?? [],
		total: raw.local?.total ?? raw.local?.items?.length ?? 0,
	},
	remote: {
		items: raw.remote?.items ?? [],
		total: raw.remote?.total ?? raw.remote?.items?.length ?? 0,
		errors: raw.remote?.errors ?? [],
		skipped: raw.remote?.skipped ?? [],
	},
	tookMs: raw.tookMs ?? 0,
	scope,
});

const chip = (on: boolean) =>
	`xeno-chip px-2.5 py-1 ${on ? "border-emerald-400/60 text-emerald-300" : "text-muted-foreground"}`;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2";
// Quiet kinds are laid in lower so the voice stays on top.
const QUIET = ["Música", "Ambiente"];

export function LibraryPanel() {
	const editor = useEditor();
	const [status, setStatus] = useState<LibraryStatus | null>(null);
	const [statusError, setStatusError] = useState("");
	const [q, setQ] = useState("");
	const [kind, setKind] = useState("all");
	const [scope, setScope] = useState<Scope>("all");
	const [commercial, setCommercial] = useState(false);
	const [category, setCategory] = useState("");
	const [result, setResult] = useState<Search | null>(null);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState<Record<string, string>>({});
	// Downloads and removals made in this session, applied on top of the search result.
	const [owned, setOwned] = useState<Record<string, string>>({});
	const [gone, setGone] = useState<string[]>([]);
	const epoch = useRef(0);

	async function refreshStatus() {
		try {
			setStatus(await nachoApi<LibraryStatus>("/library/status"));
			setStatusError("");
		} catch (e) {
			setStatusError((e as Error).message);
		}
	}
	async function search(next = 1) {
		const mine = ++epoch.current;
		const text = q.trim();
		const effective: Scope | "" = text
			? scope
			: scope === "remote"
				? ""
				: "local";
		if (!effective) {
			setResult(null);
			setPage(1);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError("");
		try {
			const params = new URLSearchParams({
				q: text,
				kind,
				scope: effective,
				page: String(next),
				commercial: commercial ? "1" : "0",
			});
			if (category) params.set("category", category);
			const raw = await nachoApi<Partial<Search>>(
				"/library/search?" + params.toString(),
			);
			if (mine !== epoch.current) return;
			const fresh = normalize(raw, effective);
			setResult((old) =>
				next > 1 && old
					? {
							...fresh,
							local: {
								...fresh.local,
								items: [
									...old.local.items,
									...fresh.local.items.filter(
										(i) => !old.local.items.some((o) => o.id === i.id),
									),
								],
							},
							remote: {
								...fresh.remote,
								items: [
									...old.remote.items,
									...fresh.remote.items.filter(
										(i) => !old.remote.items.some((o) => o.key === i.key),
									),
								],
							},
						}
					: fresh,
			);
			setPage(next);
		} catch (e) {
			if (mine === epoch.current) setError((e as Error).message);
		} finally {
			if (mine === epoch.current) setLoading(false);
		}
	}
	useEffect(() => {
		void refreshStatus();
	}, []);
	// Filters re-run the search at once; the text itself waits for Enter / Buscar.
	useEffect(() => {
		void search(1);
	}, [kind, scope, commercial, category]);

	async function run(id: string, label: string, fn: () => Promise<void>) {
		setBusy((b) => ({ ...b, [id]: label }));
		setError("");
		setMessage("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy((b) => {
				const { [id]: _done, ...rest } = b;
				return rest;
			});
		}
	}

	function saved(item: LocalItem) {
		setGone((g) => g.filter((id) => id !== item.id));
		setResult((old) =>
			old && old.scope !== "remote" && !old.local.items.some((i) => i.id === item.id)
				? {
						...old,
						local: { items: [item, ...old.local.items], total: old.local.total + 1 },
					}
				: old,
		);
		void refreshStatus();
	}

	async function download(item: RemoteItem, ack: boolean) {
		let needsAck: string | undefined;
		await run(item.key, "Descargando…", async () => {
			const response = await downloadItem(item.key, ack);
			if ("needsAck" in response) {
				needsAck = response.needsAck;
				return;
			}
			setOwned((o) => ({ ...o, [item.key]: response.item.id }));
			saved(response.item);
			setMessage(
				response.duplicate
					? `«${item.title}» ya estaba en tu biblioteca.`
					: `«${item.title}» guardado en tu biblioteca con su licencia y atribución.`,
			);
		});
		return needsAck;
	}

	async function remove(item: LocalItem) {
		await nachoApi("/library/remove", { id: item.id });
		setGone((g) => [...g, item.id]);
		setResult((old) =>
			old
				? {
						...old,
						local: {
							items: old.local.items.filter((i) => i.id !== item.id),
							total: Math.max(0, old.local.total - 1),
						},
					}
				: old,
		);
		void refreshStatus();
		setMessage(`«${item.title}» eliminado de tu biblioteca.`);
	}

	async function addToTimeline(item: LocalItem) {
		const projectId = editor.project.getActive()?.metadata.id;
		if (!projectId)
			throw Error("Abre un proyecto para añadir recursos a la timeline");
		const sceneId = editor.scenes.getActiveScene().id;
		const type = item.kind as "image" | "video" | "audio";
		const ext =
			item.ext || (type === "image" ? "png" : type === "video" ? "mp4" : "wav");
		// Stable per item, so adding the same asset twice reuses the stored copy.
		const name = `${item.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 48)} [${item.id.slice(0, 8)}].${ext}`;
		const unchanged = () =>
			editor.project.getActive()?.metadata.id === projectId &&
			editor.scenes.getActiveScene().id === sceneId;
		let asset = editor.media
			.getAssets()
			.find((a) => a.name === name && a.type === type);
		if (!asset) {
			const response = await fetch(fileUrl(item.id));
			if (!response.ok) throw Error("No se pudo leer el archivo de la biblioteca");
			const blob = await response.blob();
			const files = await processMediaAssets({
				files: [new File([blob], name, { type: blob.type })],
			});
			if (!unchanged())
				throw Error("Has cambiado de proyecto o escena; vuelve a añadir el recurso");
			const prepared = files.find((f) => f.type === type) ?? files[0];
			if (!prepared)
				throw Error("Este formato no es compatible con el editor");
			asset =
				(await editor.media.addMediaAsset({ projectId, asset: prepared })) ??
				undefined;
			if (!asset) throw Error("No se pudo guardar el recurso en el proyecto");
		}
		if (!unchanged())
			throw Error("Has cambiado de proyecto o escena; vuelve a añadir el recurso");
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: type,
			name: item.title,
			duration: mediaTimeFromSeconds({
				seconds: asset.duration || item.duration || 5,
			}),
			startTime: editor.playback.getCurrentTime(),
		});
		if (type === "audio")
			element.params = {
				...element.params,
				volume: QUIET.includes(item.category) ? -18 : -8,
			};
		editor.timeline.insertElement({
			element,
			placement:
				type === "audio" ? { mode: "auto", trackType: "audio" } : { mode: "auto" },
		});
		setMessage(
			`«${item.title}» añadido a la timeline en la posición del cursor. Puedes deshacerlo.`,
		);
	}

	const connectors = status?.connectors ?? [];
	const stats = status?.stats;
	const ownedId = (item: RemoteItem) => {
		const id = owned[item.key] ?? item.owned;
		return id && !gone.includes(id) ? id : null;
	};
	const showLocal = !!result && result.scope !== "remote";
	const showRemote = !!result && result.scope !== "local";
	const credits = result
		? [
				...new Set(
					result.remote.items
						.map((i) => connectors.find((c) => c.id === i.connector)?.credit)
						.filter((c): c is string => !!c),
				),
			]
		: [];
	const more =
		!!result &&
		(result.local.items.length < result.local.total ||
			result.remote.items.length < result.remote.total);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
			<div className="flex items-center gap-3">
				<span
					className="xeno-orbit"
					data-busy={loading || Object.keys(busy).length > 0}
					aria-hidden
				/>
				<div className="min-w-0">
					<p className="xeno-kicker">Biblioteca local · licencias a la vista</p>
					<h2 className="xeno-holo-text text-base font-semibold tracking-wide">
						Recursos
					</h2>
					{stats ? (
						<p
							className="xeno-mono text-xs text-muted-foreground"
							aria-label="Estadísticas de la biblioteca"
						>
							{stats.items} recursos · {megabytes(stats.bytes)} MB ·{" "}
							{stats.generated} generados
						</p>
					) : null}
				</div>
			</div>
			{stats?.byKind && Object.keys(stats.byKind).length ? (
				<div className="flex flex-wrap gap-1" aria-label="Recursos por tipo">
					{Object.entries(stats.byKind).map(([k, n]) => (
						<span key={k} className="xeno-chip px-2 py-0.5 text-muted-foreground">
							{KIND_LABELS[k] || k} · {n}
						</span>
					))}
				</div>
			) : null}
			<div className="flex flex-wrap gap-2 text-xs">
				<a
					className="rounded border px-2 py-1 hover:bg-accent"
					href="/nacho-api/library/credits?all=0"
					download="creditos.txt"
				>
					Créditos
				</a>
				<a
					className="rounded border px-2 py-1 text-muted-foreground hover:bg-accent"
					href="/nacho-api/library/credits?all=1"
					download="creditos-completos.txt"
				>
					Créditos completos
				</a>
			</div>
			{statusError ? (
				<p className="rounded border border-amber-400/30 p-2 text-xs text-amber-300">
					La biblioteca local no responde: {statusError}. Arranca Elite Editor
					con ELITE_EDITOR.cmd o npm run dev.
				</p>
			) : null}

			<section className="xeno-card space-y-3 p-3" data-section="buscar">
				<h3 className="xeno-heading" data-index="01">
					Buscar recursos
				</h3>
				<form
					role="search"
					aria-label="Buscar recursos"
					className="space-y-2"
					onSubmit={(e) => {
						e.preventDefault();
						void search(1);
					}}
				>
					<div className="flex gap-2">
						<Input
							aria-label="Buscar recursos"
							placeholder="Lluvia, whoosh, fondo abstracto…"
							containerClassName="flex-1"
							value={q}
							onChange={(e) => setQ(e.target.value)}
						/>
						<Button type="submit" disabled={loading}>
							Buscar
						</Button>
					</div>
					<div role="group" aria-label="Tipo de recurso" className="flex flex-wrap gap-1">
						{KINDS.map(([id, label]) => (
							<button
								key={id}
								type="button"
								className={chip(kind === id)}
								aria-pressed={kind === id}
								onClick={() => setKind(id)}
							>
								{label}
							</button>
						))}
					</div>
					<div
						role="group"
						aria-label="Alcance de la búsqueda"
						className="flex flex-wrap gap-1"
					>
						{SCOPES.map(([id, label]) => (
							<button
								key={id}
								type="button"
								className={chip(scope === id)}
								aria-pressed={scope === id}
								onClick={() => setScope(id)}
							>
								{label}
							</button>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-3 text-xs">
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={commercial}
								onChange={(e) => setCommercial(e.target.checked)}
							/>
							Solo uso comercial
						</label>
						<label className="flex items-center gap-2">
							Categoría
							<select
								aria-label="Categoría de mi biblioteca"
								className="max-w-[11rem] rounded border bg-background p-1.5"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
							>
								<option value="">Todas</option>
								{CATEGORIES.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</label>
					</div>
					<p className="text-[11px] text-muted-foreground">
						Pulsa Intro para buscar. Sin texto se muestra tu biblioteca.
						Busca en español: se traduce al inglés para las fuentes externas.
					</p>
				</form>
			</section>

			{error ? (
				<p role="alert" className="text-xs text-red-400">
					{error}
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-xs text-emerald-300">
					{message}
				</p>
			) : null}
			{loading ? (
				<p role="status" className="text-xs text-sky-300">
					Buscando…
				</p>
			) : null}

			{result ? (
				<div className="space-y-4" data-section="resultados">
					{result.query.translated && result.query.english ? (
						<p className="text-xs text-sky-300" aria-live="polite">
							Buscando también: {result.query.english}
						</p>
					) : null}
					{showLocal ? (
						<section className="space-y-2" aria-label="Mi biblioteca">
							<h3 className="xeno-heading">
								Mi biblioteca · {result.local.total}
							</h3>
							{result.local.items.length ? (
								<div className={GRID}>
									{result.local.items.map((item) => (
										<ResultCard
											key={item.id}
											v={localView(item)}
											busy={busy[item.id]}
											onAdd={() =>
												void run(item.id, "Añadiendo a la timeline…", () =>
													addToTimeline(item),
												)
											}
											onRemove={() =>
												void run(item.id, "Eliminando…", () => remove(item))
											}
										/>
									))}
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									{result.query.original || q.trim()
										? "Nada en tu biblioteca con estos filtros. Prueba también en las fuentes externas."
										: "Tu biblioteca está vacía con estos filtros. Genera recursos en ASSET FORGE o descarga desde las fuentes externas."}
								</p>
							)}
						</section>
					) : null}
					{showRemote ? (
						<section className="space-y-2" aria-label="Fuentes externas">
							<h3 className="xeno-heading">
								Fuentes externas · {result.remote.total}
							</h3>
							{credits.length ? (
								<p
									className="flex flex-wrap gap-1"
									aria-label="Créditos de las fuentes"
								>
									{credits.map((credit) => (
										<span
											key={credit}
											className="xeno-chip px-2 py-0.5 text-sky-300"
										>
											{credit}
										</span>
									))}
								</p>
							) : null}
							{result.remote.errors.length ? (
								<ul
									aria-label="Fuentes con problemas"
									className="space-y-0.5 rounded border border-amber-400/30 p-2 text-xs text-amber-300"
								>
									{result.remote.errors.map((e) => (
										<li key={e.connector}>
											{e.name}: {e.error}
										</li>
									))}
								</ul>
							) : null}
							{result.remote.skipped.length ? (
								<ul
									aria-label="Fuentes omitidas"
									className="space-y-0.5 text-[11px] text-muted-foreground"
								>
									{result.remote.skipped.map((s) => (
										<li key={s.connector}>
											Omitida · {s.name}: {s.reason}
										</li>
									))}
								</ul>
							) : null}
							{result.remote.items.length ? (
								<div className={GRID}>
									{result.remote.items.map((item) => (
										<ResultCard
											key={item.key}
											v={remoteView({
												...item,
												requiresAck:
													item.requiresAck ??
													connectors.find((c) => c.id === item.connector)
														?.requiresAck,
											})}
											owned={!!ownedId(item)}
											busy={busy[item.key]}
											onDownload={(ack) => download(item, ack)}
										/>
									))}
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									Las fuentes externas no han devuelto resultados.
								</p>
							)}
						</section>
					) : null}
					{more ? (
						<Button
							variant="outline"
							disabled={loading}
							onClick={() => void search(page + 1)}
						>
							Más resultados
						</Button>
					) : null}
					<p className="xeno-mono text-[10px] text-muted-foreground">
						{result.local.items.length + result.remote.items.length} mostrados ·{" "}
						{result.tookMs} ms
					</p>
				</div>
			) : !loading ? (
				<p className="text-xs text-muted-foreground">
					Escribe qué buscas para consultar las fuentes externas.
				</p>
			) : null}

			<SourcesSection
				connectors={connectors}
				onChanged={() => void refreshStatus()}
				onImported={(imported) => {
					saved(imported.item);
					setMessage(
						imported.duplicate
							? `«${imported.item.title}» ya estaba en tu biblioteca.`
							: `«${imported.item.title}» importado a tu biblioteca.`,
					);
				}}
			/>
			<ForgeSection
				packs={status?.forge?.packs ?? []}
				onChanged={() => void refreshStatus()}
			/>
		</div>
	);
}
