"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { ParamValue } from "@/params";
import { canElementBeHidden } from "@/timeline/element-utils";

type Edge = "in" | "out" | "both";
// Each preset lists, per property, [fraction of the animation, value] for an ENTRANCE.
// Values are computed from the clip's own resting value, so a moved or scaled clip
// animates from where it actually is. Exits play the same path backwards.
type Track = [number, (base: number, size: { w: number; h: number }) => number][];
const PRESETS: { id: string; label: string; tracks: Record<string, Track> }[] = [
	{ id: "fade", label: "Fundido", tracks: { opacity: [[0, () => 0], [1, (b) => b]] } },
	{
		id: "zoom",
		label: "Zoom suave",
		tracks: {
			"transform.scaleX": [[0, (b) => b * 0.65], [1, (b) => b]],
			"transform.scaleY": [[0, (b) => b * 0.65], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "pop",
		label: "Pop con rebote",
		tracks: {
			"transform.scaleX": [[0, (b) => b * 0.4], [0.7, (b) => b * 1.08], [1, (b) => b]],
			"transform.scaleY": [[0, (b) => b * 0.4], [0.7, (b) => b * 1.08], [1, (b) => b]],
			opacity: [[0, () => 0], [0.4, (b) => b]],
		},
	},
	{
		id: "left",
		label: "Desde izquierda",
		tracks: {
			"transform.positionX": [[0, (b, s) => b - s.w], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "right",
		label: "Desde derecha",
		tracks: {
			"transform.positionX": [[0, (b, s) => b + s.w], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "up",
		label: "Desde abajo",
		tracks: {
			"transform.positionY": [[0, (b, s) => b + s.h], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "down",
		label: "Desde arriba",
		tracks: {
			"transform.positionY": [[0, (b, s) => b - s.h], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "rise",
		label: "Subida sutil",
		tracks: {
			"transform.positionY": [[0, (b, s) => b + s.h * 0.08], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
	{
		id: "spin",
		label: "Giro suave",
		tracks: {
			"transform.rotate": [[0, (b) => b - 20], [1, (b) => b]],
			"transform.scaleX": [[0, (b) => b * 0.8], [1, (b) => b]],
			"transform.scaleY": [[0, (b) => b * 0.8], [1, (b) => b]],
			opacity: [[0, () => 0], [1, (b) => b]],
		},
	},
];

export function EliteMotion() {
	const editor = useEditor(),
		selected = useEditor((e) => e.selection.getSelectedElements());
	const [duration, setDuration] = useState(0.4),
		[edge, setEdge] = useState<Edge>("in"),
		[easing, setEasing] = useState<"linear" | "bezier">("bezier"),
		[message, setMessage] = useState("");
	function apply(presetId: string) {
		const preset = PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		const scene = editor.scenes.getActiveScene();
		const refs = selected.flatMap((ref) => {
			const track = [scene.tracks.main, ...scene.tracks.overlay].find(
				(t) => t.id === ref.trackId,
			);
			const element = track?.elements.find((e) => e.id === ref.elementId);
			return element && canElementBeHidden(element)
				? [{ ...ref, element }]
				: [];
		});
		if (!refs.length) {
			setMessage("Selecciona un clip de vídeo, imagen o texto en la timeline.");
			return;
		}
		const size = {
			w: editor.project.getActive()?.settings.canvasSize.width || 1920,
			h: editor.project.getActive()?.settings.canvasSize.height || 1080,
		};
		const keyframes: Parameters<
			typeof editor.timeline.upsertKeyframes
		>[0]["keyframes"] = [];
		for (const ref of refs) {
			const e = ref.element,
				length = mediaTimeToSeconds({ time: e.duration });
			// With entrance and exit together, each may use at most half of the clip.
			const span = Math.min(duration, edge === "both" ? length / 2.2 : length / 2);
			const last = length - 1 / 120;
			const edges: ("in" | "out")[] = edge === "both" ? ["in", "out"] : [edge];
			for (const side of edges) {
				const start = side === "in" ? 0 : Math.max(0, last - span);
				for (const [propertyPath, points] of Object.entries(preset.tracks)) {
					const base = Number(
						(e.params[propertyPath] as ParamValue | undefined) ??
							(propertyPath.includes("scale") || propertyPath === "opacity" ? 1 : 0),
					);
					for (const [fraction, value] of points) {
						const at = side === "in" ? fraction : 1 - fraction;
						keyframes.push({
							trackId: ref.trackId,
							elementId: e.id,
							propertyPath,
							time: mediaTimeFromSeconds({ seconds: start + at * span }),
							value: Math.round(value(base, size) * 1000) / 1000,
							interpolation: easing,
						});
					}
				}
			}
		}
		editor.timeline.upsertKeyframes({ keyframes });
		setMessage(
			`«${preset.label}» aplicado a ${refs.length} ${refs.length === 1 ? "clip" : "clips"} con keyframes editables. Puedes deshacerlo.`,
		);
	}
	return (
		<div className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
			<h2 className="font-semibold">Entradas y salidas</h2>
			<p className="text-xs text-muted-foreground">
				Selecciona uno o varios clips. Las animaciones parten de la posición y
				escala actuales del clip, se ven en la previsualización y se exportan
				con tu montaje. No son disoluciones entre dos clips solapados.
			</p>
			<div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Aplicar en">
				{(
					[
						["in", "Entrada"],
						["out", "Salida"],
						["both", "Ambas"],
					] as const
				).map(([id, label]) => (
					<Button
						key={id}
						size="sm"
						role="radio"
						aria-checked={edge === id}
						variant={edge === id ? "default" : "outline"}
						onClick={() => setEdge(id)}
					>
						{label}
					</Button>
				))}
			</div>
			<label>
				Duración · {duration.toFixed(1)} s
				<input
					className="w-full"
					type="range"
					min=".1"
					max="2"
					step=".1"
					value={duration}
					onChange={(e) => setDuration(Number(e.target.value))}
				/>
			</label>
			<label className="flex items-center justify-between gap-2 text-xs">
				Curva
				<select
					className="rounded border bg-background p-1.5"
					value={easing}
					onChange={(e) => setEasing(e.target.value as typeof easing)}
				>
					<option value="bezier">Suave · Bézier</option>
					<option value="linear">Constante · lineal</option>
				</select>
			</label>
			<div className="grid grid-cols-2 gap-2">
				{PRESETS.map((preset) => (
					<Button
						key={preset.id}
						variant="outline"
						disabled={!selected.length}
						onClick={() => apply(preset.id)}
					>
						{preset.label}
					</Button>
				))}
			</div>
			<p role="status" className="text-xs">
				{message}
			</p>
			<p className="text-xs text-muted-foreground">
				Se añaden keyframes en los extremos del clip. Si ya animaste esas
				propiedades, revisa su combinación en el inspector.
			</p>
		</div>
	);
}
