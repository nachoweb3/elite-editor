"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type { ParamValue } from "@/params";
import { canElementBeHidden } from "@/timeline/element-utils";

export function EliteMotion() {
	const editor = useEditor(),
		selected = useEditor((e) => e.selection.getSelectedElements());
	const [duration, setDuration] = useState(0.4),
		[edge, setEdge] = useState("in"),
		[message, setMessage] = useState("");
	function apply(kind: string) {
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
		const keyframes: Parameters<
			typeof editor.timeline.upsertKeyframes
		>[0]["keyframes"] = [];
		for (const ref of refs) {
			const e = ref.element,
				span = Math.min(duration, mediaTimeToSeconds({ time: e.duration }) / 2);
			const end = mediaTimeFromSeconds({
				seconds: mediaTimeToSeconds({ time: e.duration }) - 1 / 120,
			});
			const a =
					edge === "in"
						? ZERO_MEDIA_TIME
						: mediaTimeFromSeconds({
								seconds: Math.max(0, mediaTimeToSeconds({ time: end }) - span),
							}),
				b = edge === "in" ? mediaTimeFromSeconds({ seconds: span }) : end;
			const width =
					editor.project.getActive()?.settings.canvasSize.width || 1920,
				height = editor.project.getActive()?.settings.canvasSize.height || 1080;
			const properties: Record<string, number> =
				kind === "fade"
					? { opacity: 0 }
					: kind === "zoom"
						? { "transform.scaleX": 0.65, "transform.scaleY": 0.65, opacity: 0 }
						: kind === "left"
							? { "transform.positionX": -width, opacity: 0 }
							: kind === "right"
								? { "transform.positionX": width, opacity: 0 }
								: kind === "up"
									? { "transform.positionY": height, opacity: 0 }
									: {
											"transform.rotate": -20,
											"transform.scaleX": 0.8,
											"transform.scaleY": 0.8,
											opacity: 0,
										};
			for (const [propertyPath, from] of Object.entries(properties)) {
				const base = (e.params[propertyPath] ??
					(propertyPath.includes("scale") || propertyPath === "opacity"
						? 1
						: 0)) as ParamValue;
				keyframes.push(
					{
						trackId: ref.trackId,
						elementId: e.id,
						propertyPath,
						time: a,
						value: edge === "in" ? from : base,
						interpolation: "linear",
					},
					{
						trackId: ref.trackId,
						elementId: e.id,
						propertyPath,
						time: b,
						value: edge === "in" ? base : from,
						interpolation: "linear",
					},
				);
			}
		}
		editor.timeline.upsertKeyframes({ keyframes });
		setMessage(
			"Animación aplicada con keyframes editables. Puedes deshacerla.",
		);
	}
	return (
		<div className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
			<h2 className="font-semibold">Entradas y salidas</h2>
			<p className="text-xs text-muted-foreground">
				Selecciona uno o varios clips. Estas animaciones se ven en la
				previsualización y se exportan con tu montaje. No son disoluciones entre
				dos clips solapados.
			</p>
			<label>
				Aplicar en
				<select
					className="ml-3 rounded border bg-background p-2"
					value={edge}
					onChange={(e) => setEdge(e.target.value)}
				>
					<option value="in">Entrada</option>
					<option value="out">Salida</option>
				</select>
			</label>
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
			<div className="grid grid-cols-2 gap-2">
				{[
					["fade", "Fundido"],
					["zoom", "Zoom suave"],
					["left", "Desde izquierda"],
					["right", "Desde derecha"],
					["up", "Desde abajo"],
					["spin", "Giro suave"],
				].map(([id, label]) => (
					<Button
						key={id}
						variant="outline"
						disabled={!selected.length}
						onClick={() => apply(id)}
					>
						{label}
					</Button>
				))}
			</div>
			<p role="status" className="text-xs">
				{message}
			</p>
			<p className="text-xs text-muted-foreground">
				Se añaden keyframes en los extremos del tramo. Si ya animaste esas
				propiedades, revisa su combinación en el inspector.
			</p>
		</div>
	);
}
