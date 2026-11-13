"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { buildTextElement } from "@/timeline/element-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mediaTimeFromSeconds } from "@/wasm";
import type { ParamValues } from "@/params";

type Style = {
	name: string;
	group: string;
	font: string;
	size: number;
	color: string;
	bold?: boolean;
	italic?: boolean;
	bg?: string;
	spacing?: number;
	y?: number;
};
const styles: Style[] = [
	{
		name: "Impacto",
		group: "Títulos",
		font: "Impact",
		size: 30,
		color: "#ffffff",
		bold: true,
	},
	{
		name: "Elite Mint",
		group: "Títulos",
		font: "Arial",
		size: 25,
		color: "#8affd4",
		bold: true,
	},
	{
		name: "Editorial",
		group: "Títulos",
		font: "Georgia",
		size: 27,
		color: "#fff2d2",
		italic: true,
	},
	{
		name: "Documental",
		group: "Títulos",
		font: "Arial",
		size: 23,
		color: "#ffffff",
		spacing: 2,
	},
	{
		name: "Alerta roja",
		group: "Títulos",
		font: "Arial",
		size: 24,
		color: "#ffffff",
		bg: "#b91c1c",
		bold: true,
	},
	{
		name: "Violeta",
		group: "Títulos",
		font: "Arial",
		size: 26,
		color: "#d8b4fe",
		bold: true,
	},
	{
		name: "Nombre del creador",
		group: "Rótulos",
		font: "Arial",
		size: 16,
		color: "#111827",
		bg: "#a7f3d0",
		bold: true,
		y: 0.32,
	},
	{
		name: "Entrevista",
		group: "Rótulos",
		font: "Georgia",
		size: 17,
		color: "#ffffff",
		bg: "#111827",
		y: 0.32,
	},
	{
		name: "Etiqueta noticia",
		group: "Rótulos",
		font: "Arial",
		size: 15,
		color: "#ffffff",
		bg: "#1d4ed8",
		bold: true,
		y: 0.32,
	},
	{
		name: "Ubicación",
		group: "Rótulos",
		font: "Arial",
		size: 14,
		color: "#fde68a",
		spacing: 2,
		y: 0.32,
	},
	{
		name: "Paso a paso",
		group: "Tutorial",
		font: "Arial",
		size: 18,
		color: "#111827",
		bg: "#fde047",
		bold: true,
		y: -0.32,
	},
	{
		name: "Código",
		group: "Tutorial",
		font: "Courier New",
		size: 17,
		color: "#a7f3d0",
		bg: "#111827",
	},
	{
		name: "Nota útil",
		group: "Tutorial",
		font: "Arial",
		size: 16,
		color: "#111827",
		bg: "#f8fafc",
		y: -0.32,
	},
	{
		name: "Dato clave",
		group: "Tutorial",
		font: "Arial",
		size: 26,
		color: "#67e8f9",
		bold: true,
	},
	{
		name: "Cita editorial",
		group: "Citas",
		font: "Georgia",
		size: 22,
		color: "#fef3c7",
		italic: true,
	},
	{
		name: "Minimal",
		group: "Citas",
		font: "Arial",
		size: 19,
		color: "#e2e8f0",
		spacing: 1,
	},
	{
		name: "Clásico",
		group: "Citas",
		font: "Times New Roman",
		size: 23,
		color: "#ffffff",
		italic: true,
	},
	{
		name: "Mensaje destacado",
		group: "Citas",
		font: "Arial",
		size: 20,
		color: "#ffffff",
		bg: "#4338ca",
		bold: true,
	},
	{
		name: "Subtítulo superior",
		group: "Subtítulos",
		font: "Arial",
		size: 15,
		color: "#ffffff",
		bg: "#111827",
		bold: true,
		y: -0.35,
	},
	{
		name: "Subtítulo amarillo",
		group: "Subtítulos",
		font: "Arial",
		size: 16,
		color: "#fde047",
		bg: "#111827",
		bold: true,
		y: 0.35,
	},
];
export function TextView() {
	const editor = useEditor();
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const [group, setGroup] = useState("Todo"),
		[content, setContent] = useState("Tu historia empieza aquí"),
		[duration, setDuration] = useState(4),
		[message, setMessage] = useState("");
	function apply(s: Style, replace: boolean) {
		const params: ParamValues = {
			fontFamily: s.font,
			fontSize: s.size,
			color: s.color,
			fontWeight: s.bold ? "bold" : "normal",
			fontStyle: s.italic ? "italic" : "normal",
			textAlign: "center",
			textDecoration: "none",
			letterSpacing: s.spacing || 0,
			lineHeight: 1.2,
			"background.enabled": !!s.bg,
			"background.color": s.bg || "#000000",
			"background.paddingX": 22,
			"background.paddingY": 12,
			"background.cornerRadius": 8,
		};
		if (replace) {
			const scene = editor.scenes.getActiveScene();
			const updates = selected.flatMap((ref) => {
				const e = [scene.tracks.main, ...scene.tracks.overlay]
					.find((t) => t.id === ref.trackId)
					?.elements.find((e) => e.id === ref.elementId);
				return e?.type === "text"
					? [{ ...ref, patch: { params: { ...e.params, ...params } } }]
					: [];
			});
			if (!updates.length) {
				setMessage("Selecciona un texto en la timeline.");
				return;
			}
			editor.timeline.updateElements({ updates });
			setMessage(
				"Estilo aplicado. Se conservan contenido, posición, duración y animaciones; las propiedades ya animadas pueden prevalecer.",
			);
		} else {
			if (!content.trim()) return;
			const height =
				editor.project.getActive()?.settings.canvasSize.height || 1080;
			editor.timeline.insertElement({
				element: buildTextElement({
					raw: {
						name: s.name,
						duration: mediaTimeFromSeconds({ seconds: duration }),
						params: {
							...params,
							content: content.trim(),
							"transform.positionY": (s.y || 0) * height,
						},
					},
					startTime: editor.playback.getCurrentTime(),
				}),
				placement: { mode: "auto" },
			});
			setMessage(
				"Texto editable añadido al cabezal. Personalízalo en el inspector; puedes deshacer.",
			);
		}
	}
	return (
		<div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
			<h2 className="font-semibold">Estudio de textos · 20 estilos</h2>
			<p className="text-xs text-muted-foreground">
				Títulos, rótulos y citas editables. Las fuentes disponibles dependen del
				equipo.
			</p>
			<label className="space-y-1 text-xs">
				Tu texto
				<Input
					aria-label="Contenido del texto"
					maxLength={1000}
					value={content}
					onChange={(e) => setContent(e.target.value)}
				/>
			</label>
			<label className="flex items-center gap-3 text-xs">
				Duración inicial
				<input
					className="w-20 rounded border bg-background p-2"
					type="number"
					min=".5"
					max="60"
					step=".5"
					value={duration}
					onChange={(e) =>
						setDuration(
							Math.min(60, Math.max(0.5, Number(e.target.value) || 0.5)),
						)
					}
				/>{" "}
				s
			</label>
			<label className="text-xs">
				Colección
				<select
					className="ml-2 rounded border bg-background p-2"
					value={group}
					onChange={(e) => setGroup(e.target.value)}
				>
					{[
						"Todo",
						"Títulos",
						"Rótulos",
						"Tutorial",
						"Citas",
						"Subtítulos",
					].map((g) => (
						<option key={g}>{g}</option>
					))}
				</select>
			</label>
			{message ? (
				<p role="status" className="text-xs text-emerald-300">
					{message}
				</p>
			) : null}
			{styles
				.filter((s) => group === "Todo" || s.group === group)
				.map((s) => (
					<article key={s.name} className="space-y-2 rounded-xl border p-3">
						<div className="flex min-h-20 items-center justify-center rounded bg-slate-950 p-3">
							<span
								className="max-w-full break-words rounded px-2 py-1 text-center text-xl"
								style={{
									fontFamily: s.font,
									color: s.color,
									background: s.bg,
									fontWeight: s.bold ? 700 : 400,
									fontStyle: s.italic ? "italic" : "normal",
								}}
							>
								{content.trim() || s.name}
							</span>
						</div>
						<p className="text-xs">
							{s.name} · {s.group}
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={!content.trim()}
								onClick={() => apply(s, false)}
							>
								Añadir texto
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={!selected.length}
								onClick={() => apply(s, true)}
							>
								Aplicar estilo
							</Button>
						</div>
					</article>
				))}
		</div>
	);
}
