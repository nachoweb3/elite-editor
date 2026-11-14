"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import {
	getElementKeyframes,
	resolveAnimationPathValueAtTime,
} from "@/animation";
import { mediaTime, mediaTimeToSeconds } from "@/wasm";
import type { VideoElement, ImageElement } from "@/timeline";

const paths = [
	"transform.scaleX",
	"transform.scaleY",
	"transform.positionX",
	"transform.positionY",
] as const;

export function EliteZoom() {
	const editor = useEditor();
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const time = useEditor((e) => e.playback.getCurrentTime());
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const ref = selected.length === 1 ? selected[0] : null;
	const element = ref
		? [tracks.main, ...tracks.overlay]
				.find((t) => t.id === ref.trackId)
				?.elements.find((e) => e.id === ref.elementId)
		: null;
	if (
		!ref ||
		!element ||
		(element.type !== "video" && element.type !== "image")
	)
		return (
			<div className="space-y-3 p-4 text-sm">
				<h2 className="font-semibold">Zoom y encuadre ◆</h2>
				<p>Selecciona un solo clip de vídeo o imagen en la timeline.</p>
			</div>
		);
	if (time < element.startTime || time >= element.startTime + element.duration)
		return (
			<div className="space-y-3 p-4 text-sm">
				<h2 className="font-semibold">Zoom y encuadre ◆</h2>
				<p>Mueve el cabezal dentro del clip seleccionado.</p>
				<Button
					onClick={() => editor.playback.seek({ time: element.startTime })}
				>
					Ir al inicio del clip
				</Button>
			</div>
		);
	return (
		<ZoomControls
			key={`${element.id}:${time}:${JSON.stringify(element.animations)}:${JSON.stringify(element.params)}`}
			element={element}
			trackId={ref.trackId}
			localTime={time - element.startTime}
		/>
	);
}

function ZoomControls({
	element,
	trackId,
	localTime,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
	localTime: number;
}) {
	const editor = useEditor();
	const canvas = editor.project.getActive()?.settings.canvasSize || {
		width: 1920,
		height: 1080,
	};
	const read = (propertyPath: string, fallback: number) =>
		resolveAnimationPathValueAtTime({
			animations: element.animations,
			propertyPath,
			localTime,
			fallbackValue: Number(element.params[propertyPath] ?? fallback),
		});
	const [zoom, setZoom] = useState(read(paths[0], 1));
	const [scaleY, setScaleY] = useState(read(paths[1], 1));
	const [x, setX] = useState(read(paths[2], 0));
	const [y, setY] = useState(read(paths[3], 0));
	const [interpolation, setInterpolation] = useState<
		"linear" | "bezier" | "hold"
	>("linear");
	const allKeys = getElementKeyframes({
		animations: element.animations,
	}).filter((k) => paths.some((p) => p === k.propertyPath));
	const times = [...new Set(allKeys.map((k) => k.time))].sort((a, b) => a - b);
	const here = allKeys.filter((k) => k.time === localTime);
	function save() {
		editor.timeline.upsertKeyframes({
			keyframes: paths.map((propertyPath, index) => ({
				trackId,
				elementId: element.id,
				propertyPath,
				time: mediaTime({ ticks: localTime }),
				value: [zoom, scaleY, x, y][index],
				interpolation,
			})),
		});
	}
	function remove() {
		editor.timeline.removeKeyframes({
			keyframes: here.map((k) => ({
				trackId,
				elementId: element.id,
				propertyPath: k.propertyPath,
				keyframeId: k.id,
			})),
		});
	}
	// One-click moves: two diamonds spanning the whole clip, from its resting framing.
	const rest = {
		zoom: Number(element.params[paths[0]] ?? 1),
		scaleY: Number(element.params[paths[1]] ?? 1),
		x: Number(element.params[paths[2]] ?? 0),
		y: Number(element.params[paths[3]] ?? 0),
	};
	const lastTick = Math.max(1, element.duration - 1);
	function frame(
		time: number,
		[z, sy, fx, fy]: number[],
		mode: "linear" | "bezier" | "hold",
	) {
		return paths.map((propertyPath, index) => ({
			trackId,
			elementId: element.id,
			propertyPath,
			time: mediaTime({ ticks: Math.round(time) }),
			value: Math.round([z, sy, fx, fy][index] * 1000) / 1000,
			interpolation: mode,
		}));
	}
	function automatic(kind: "in" | "out" | "left" | "right" | "punch") {
		const { zoom: z, scaleY: sy, x: rx, y: ry } = rest;
		const push = 1.15,
			drift = (canvas.width * (push - 1)) / 2;
		const moves = {
			in: [frame(0, [z, sy, rx, ry], "bezier"), frame(lastTick, [z * push, sy * push, rx, ry], "bezier")],
			out: [frame(0, [z * push, sy * push, rx, ry], "bezier"), frame(lastTick, [z, sy, rx, ry], "bezier")],
			left: [frame(0, [z * push, sy * push, rx + drift, ry], "linear"), frame(lastTick, [z * push, sy * push, rx - drift, ry], "linear")],
			right: [frame(0, [z * push, sy * push, rx - drift, ry], "linear"), frame(lastTick, [z * push, sy * push, rx + drift, ry], "linear")],
			// A cut-like jump at the playhead: hold the current framing, then hold a closer one.
			punch: [
				frame(Math.max(0, localTime - 1), [zoom, scaleY, x, y], "hold"),
				frame(localTime, [zoom * 1.2, scaleY * 1.2, x * 1.2, y * 1.2], "hold"),
			],
		}[kind];
		editor.timeline.upsertKeyframes({ keyframes: moves.flat() });
	}
	function clearAll() {
		editor.timeline.removeKeyframes({
			keyframes: allKeys.map((k) => ({
				trackId,
				elementId: element.id,
				propertyPath: k.propertyPath,
				keyframeId: k.id,
			})),
		});
	}
	return (
		<div className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
			<h2 className="font-semibold">Zoom y encuadre ◆</h2>
			<p className="text-xs text-muted-foreground">
				Guarda un rombo al inicio. Avanza el cabezal, elige otro zoom y guarda
				un segundo rombo. El recorrido se anima con los keyframes del clip.
			</p>
			<section
				className="space-y-2 rounded border border-emerald-400/20 bg-emerald-400/5 p-2"
				aria-label="Movimiento automático"
			>
				<p className="text-xs font-medium">Movimiento automático · un clic</p>
				<div className="grid grid-cols-2 gap-1.5">
					{(
						[
							["in", "Acercamiento lento"],
							["out", "Alejamiento lento"],
							["left", "Paneo a la izquierda"],
							["right", "Paneo a la derecha"],
						] as const
					).map(([kind, label]) => (
						<Button
							key={kind}
							size="sm"
							variant="outline"
							onClick={() => automatic(kind)}
						>
							{label}
						</Button>
					))}
				</div>
				<Button
					size="sm"
					variant="outline"
					className="w-full"
					onClick={() => automatic("punch")}
				>
					Punch-in en el cabezal · +20 %
				</Button>
				<p className="text-[11px] text-muted-foreground">
					Crea rombos editables en el clip. El punch-in salta al encuadre
					cercano justo donde está el cabezal, ideal para cortes de énfasis.
				</p>
			</section>
			<p className="rounded border p-2 text-xs">
				Posición dentro del clip:{" "}
				{mediaTimeToSeconds({ time: mediaTime({ ticks: localTime }) }).toFixed(
					2,
				)}{" "}
				s · {here.length ? "◆ Encuadre guardado aquí" : "◇ Sin rombo aquí"}
			</p>
			<label className="space-y-2">
				Zoom · {Math.round(zoom * 100)} %
				<input
					aria-label="Zoom del encuadre"
					className="w-full"
					type="range"
					min="0.1"
					max="5"
					step="0.01"
					value={zoom}
					onChange={(e) => {
						const value = Number(e.target.value);
						setZoom(value);
						setScaleY(value);
					}}
				/>
			</label>
			<div className="space-y-2">
				<p>Ampliar hacia una zona</p>
				<div className="grid grid-cols-3 gap-1 rounded border bg-black/30 p-2">
					{[
						"Superior izquierda",
						"Superior centro",
						"Superior derecha",
						"Centro izquierda",
						"Centro",
						"Centro derecha",
						"Inferior izquierda",
						"Inferior centro",
						"Inferior derecha",
					].map((label, i) => (
						<button
							key={label}
							title={label}
							aria-label={"Enfocar " + label}
							className="h-10 rounded border border-white/10 text-emerald-300 hover:bg-emerald-300/15 focus-visible:outline focus-visible:outline-emerald-300"
							onClick={() => {
								setX((-((i % 3) - 1) * canvas.width * (zoom - 1)) / 2);
								setY(
									(-(Math.floor(i / 3) - 1) * canvas.height * (zoom - 1)) / 2,
								);
							}}
						>
							{["↖", "↑", "↗", "←", "⊙", "→", "↙", "↓", "↘"][i]}
						</button>
					))}
				</div>
				<p className="text-xs text-muted-foreground">
					Elige primero el zoom y luego la zona. Ajusta X/Y para afinar. Las
					zonas se calculan sobre el lienzo; comprueba el resultado en el
					monitor, especialmente si el clip está girado.
				</p>
			</div>
			{(
				[
					["Horizontal X", x, setX, canvas.width],
					["Vertical Y", y, setY, canvas.height],
				] as const
			).map(([label, value, setValue, limit]) => (
				<label className="text-xs" key={label}>
					{label} · {Math.round(value)} px
					<input
						className="w-full"
						type="range"
						min={-limit * 2}
						max={limit * 2}
						step="1"
						value={value}
						onChange={(e) => setValue(Number(e.target.value))}
					/>
				</label>
			))}
			<label className="flex flex-col gap-2">
				Movimiento hacia el siguiente rombo
				<select
					className="rounded border bg-background p-2"
					value={interpolation}
					onChange={(e) =>
						setInterpolation(e.target.value as typeof interpolation)
					}
				>
					<option value="linear">Continuo · lineal</option>
					<option value="bezier">Curva Bézier · ajustable en inspector</option>
					<option value="hold">Salto · mantener hasta el siguiente</option>
				</select>
			</label>
			<Button onClick={save}>
				◆ {here.length ? "Actualizar" : "Guardar"} encuadre aquí
			</Button>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					onClick={() => {
						setZoom(1);
						setScaleY(1);
						setX(0);
						setY(0);
					}}
				>
					Preparar encuadre 100 %
				</Button>
				<Button variant="outline" disabled={!here.length} onClick={remove}>
					Quitar rombo actual
				</Button>
				<Button variant="ghost" disabled={!allKeys.length} onClick={clearAll}>
					Quitar todos los rombos
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Los controles se aplican al guardar el rombo. Deshacer recupera el
				estado anterior. Los keyframes quedan en el proyecto y se usan al
				exportar.
			</p>
			<div className="flex flex-wrap gap-2" aria-label="Rombos del clip">
				{times.map((t) => (
					<button
						key={t}
						className="rounded border px-2 py-1 text-xs text-emerald-300"
						aria-label={
							"Ir al rombo en " +
							mediaTimeToSeconds({ time: t }).toFixed(2) +
							" segundos"
						}
						onClick={() =>
							editor.playback.seek({
								time: mediaTime({ ticks: element.startTime + t }),
							})
						}
					>
						◆ {mediaTimeToSeconds({ time: t }).toFixed(2)} s
					</button>
				))}
			</div>
		</div>
	);
}
