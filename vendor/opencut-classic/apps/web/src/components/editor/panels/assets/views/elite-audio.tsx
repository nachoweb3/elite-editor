"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
type Sound = {
	id: string;
	name: string;
	kind: string;
	license?: string;
	url: string;
	duration: number;
	trashedAt?: string;
	category?: string;
	pack?: string;
	author?: string;
};
export function EliteAudio() {
	const [collection,setCollection]=useState('all');
	const [loading,setLoading]=useState(true);
	const [category, setCategory] = useState("all"),
		[sort, setSort] = useState("name"),
		[favorites, setFavorites] = useState<string[]>([]),
		[onlyFavorites, setOnlyFavorites] = useState(false);
	useEffect(() => {
		try {
			const ids = JSON.parse(
				localStorage.getItem("elite-audio-favorites") || "[]",
			);
			if (Array.isArray(ids))
				setFavorites(ids.filter((id) => typeof id === "string"));
		} catch {}
	}, []);
	function favorite(id: string) {
		const next = favorites.includes(id)
			? favorites.filter((x) => x !== id)
			: [...favorites, id];
		setFavorites(next);
		try {
			localStorage.setItem("elite-audio-favorites", JSON.stringify(next));
		} catch {}
	}
	const editor = useEditor(),
		[sounds, setSounds] = useState<Sound[]>([]),
		[query, setQuery] = useState(""),
		[kind, setKind] = useState("all"),
		[preview, setPreview] = useState<Sound | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		fetch("/nacho-api/gallery", { signal: controller.signal })
			.then(async (r) => {
				if (!r.ok) throw Error("La biblioteca local no responde");
				setSounds(
					(await r.json()).filter(
						(s: Sound) =>
							["music", "sound"].includes(s.kind) &&
							!s.trashedAt &&
							!["test-music.wav", "audio-timeline-tone.wav"].includes(s.name),
					),
				);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
		return () => controller.abort();
	}, []);
	async function add(sound: Sound) {
		const projectId = editor.project.getActive()?.metadata.id;
		if (!projectId) return;
		const sceneId = editor.scenes.getActiveScene().id;
		setBusy(true);
		setError("");
		try {
			// Reuse the copy already stored in this project instead of saving the file again.
			const stored = editor.media
				.getAssets()
				.find((a) => a.name === sound.name && a.type === "audio");
			const assets: NonNullable<typeof stored>[] = stored ? [stored] : [];
			if (!stored) {
				const response = await fetch(sound.url.replace("/api/", "/nacho-api/"));
				if (!response.ok) throw Error("No se pudo leer el audio");
				const blob = await response.blob();
				const files = await processMediaAssets({
					files: [new File([blob], sound.name, { type: blob.type })],
				});
				if (
					editor.project.getActive()?.metadata.id !== projectId ||
					editor.scenes.getActiveScene().id !== sceneId
				)
					throw Error("Has cambiado de proyecto; vuelve a añadir el audio");
				if (!files.length) throw Error("Formato de audio no compatible");
				for (const prepared of files) {
					const added = await editor.media.addMediaAsset({
						projectId,
						asset: prepared,
					});
					if (!added) throw Error("No se pudo guardar el audio");
					assets.push(added);
				}
			}
			for (const asset of assets) {
				const element = buildElementFromMedia({
					mediaId: asset.id,
					mediaType: "audio",
					name: sound.name,
					duration: mediaTimeFromSeconds({
						seconds: asset.duration || sound.duration,
					}),
					startTime: editor.playback.getCurrentTime(),
				});
				element.params = {
					...element.params,
					volume: sound.kind === "music" ? -18 : -8,
				};
				editor.timeline.insertElement({
					element,
					placement: { mode: "auto", trackType: "audio" },
				});
			}
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}
	const filtered = sounds
		.filter(
			(s) =>
				(kind === "all" || s.kind === kind) &&
				(collection === "all" || s.pack === collection) &&
				(category === "all" || s.category === category) &&
				(!onlyFavorites || favorites.includes(s.id)) &&
				[s.name, s.category, s.pack, s.author]
					.filter(Boolean)
					.join(" ")
					.toLowerCase()
					.includes(query.toLowerCase()),
		)
		.sort((a, b) =>
			sort === "short"
				? a.duration - b.duration
				: sort === "long"
					? b.duration - a.duration
					: a.name.localeCompare(b.name),
		);
	return (
		<div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
			<h2 className="font-semibold text-lg">Música y efectos de sonido · {sounds.length}</h2>
			<p className="text-xs text-muted-foreground">{sounds.filter(s=>s.kind==='music').length} pistas musicales y jingles · {sounds.filter(s=>s.kind==='sound').length} efectos. Escucha antes de añadir a la timeline.</p>
			<label className="text-xs">Colección<select aria-label="Colección de audio" className="mt-1 w-full rounded border bg-background p-2" value={collection} onChange={e=>setCollection(e.target.value)}><option value="all">Todas las colecciones</option>{[...new Set(sounds.map(s=>s.pack).filter((p):p is string=>!!p))].map(p=><option key={p} value={p}>{{'elite-sfx':'Elite · efectos para creadores','kenney-interface-sounds':'Kenney · interfaz y clicks','kenney-music-jingles':'Kenney · jingles musicales','music-shadow':'Shadow · música ambiental'}[p]||p}</option>)}</select></label>
			<div className="flex flex-wrap gap-2 text-xs">
				<select
					aria-label="Categoría de audio"
					className="max-w-full rounded border bg-background p-2"
					value={category}
					onChange={(e) => setCategory(e.target.value)}
				>
					<option value="all">Todas las categorías</option>
					{[
						...new Set(
							sounds.map((s) => s.category).filter((s): s is string => !!s),
						),
					]
						.sort()
						.map((c) => (
							<option key={c}>{c}</option>
						))}
				</select>
				<select
					aria-label="Ordenar audio"
					className="rounded border bg-background p-2"
					value={sort}
					onChange={(e) => setSort(e.target.value)}
				>
					<option value="name">Nombre</option>
					<option value="short">Más corto</option>
					<option value="long">Más largo</option>
				</select>
				<Button
					size="sm"
					variant={onlyFavorites ? "default" : "outline"}
					aria-pressed={onlyFavorites}
					onClick={() => setOnlyFavorites((v) => !v)}
				>
					★ Favoritos
				</Button>
			</div>
			<Input
				aria-label="Buscar audio"
				placeholder="Buscar sonidos o música…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<div className="flex gap-2">
				{[
					["all", "Todo"],
					["music", "Música"],
					["sound", "Sonidos"],
				].map(([id, label]) => (
					<Button
						key={id}
						variant={kind === id ? "default" : "outline"}
						onClick={() => setKind(id)}
					>
						{label}
					</Button>
				))}
			</div>
			<p className="text-xs text-muted-foreground">
				Añade al cursor y ajusta volumen, cortes y fundidos en la pista de
				audio. Música al −18 dB inicial para dejar espacio a la voz.
			</p>
			{preview ? (
				<div>
					<p className="truncate text-xs">{preview.name}</p>
					<audio
						onError={()=>setError('No se pudo reproducir este audio. Prueba otro recurso o recarga la biblioteca.')}
						key={preview.id}
						controls
						autoPlay
						src={preview.url.replace("/api/", "/nacho-api/")}
						className="w-full"
					/>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			) : null}
			{filtered.map((sound) => (
				<article key={sound.id} aria-label={sound.name} className="rounded border p-2">
					<p className="truncate text-xs" title={sound.name}>
						{sound.name}
					</p>
					<p className="text-xs text-muted-foreground">
						{sound.category || "Audio"} · {sound.author || "Recurso importado"}{" "}
						· {sound.duration.toFixed(1)} s ·{" "}
						{sound.license || "Licencia del recurso"}
					</p>
					<div className="mt-2 flex gap-2">
						<Button
							variant="ghost"
							size="sm"
							aria-label={
								(favorites.includes(sound.id)
									? "Quitar de favoritos: "
									: "Guardar favorito: ") + sound.name
							}
							aria-pressed={favorites.includes(sound.id)}
							onClick={() => favorite(sound.id)}
						>
							{favorites.includes(sound.id) ? "★" : "☆"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							aria-label={'Escuchar: '+sound.name}
							onClick={() => setPreview(sound)}
						>
							Escuchar
						</Button>
						<Button size="sm" aria-label={'Añadir audio: '+sound.name} disabled={busy} onClick={() => void add(sound)}>
							Añadir
						</Button>
					</div>
				</article>
			))}
			{loading?<p role="status">Cargando biblioteca de audio…</p>:!filtered.length ? (
				<p className="text-xs text-muted-foreground">
					No hay recursos con estos filtros. Prueba otra categoría o quita
					Favoritos.
				</p>
			) : (
				<p className="text-xs text-muted-foreground">
					{filtered.length} recursos encontrados
				</p>
			)}
		</div>
	);
}
