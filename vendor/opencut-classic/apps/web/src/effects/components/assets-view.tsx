"use client";

import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";
import {toast} from 'sonner';

export function EffectsView({
	category = "all",
}: {
	category?: "all" | "color" | "background";
}) {
	const effects = effectsRegistry
		.getAll()
		.filter(
			(e) =>
				category === "all" ||
				(category === "background"
					? e.type === "elite-chroma"
					: ["elite-color", "elite-temperature", "elite-sharpen"].includes(
							e.type,
						)),
		);

	return (
		<PanelView
			title={
				category === "background"
					? "Quitar fondo · Chroma key"
					: category === "color"
						? "Color y ajustes"
						: "Efectos"
			}
		>
			<p className="mb-3 text-xs text-muted-foreground">
				Selecciona un clip y pulsa + para aplicar. Ajusta sus controles en el
				inspector de efectos.{" "}
				{category === "background"
					? "Elimina un color uniforme: verde, azul o el que elijas. Coloca el fondo nuevo en una pista inferior. No es segmentación automática de personas."
					: ""}
			</p>
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();

	const handleAddToTimeline = useCallback(() => {
		const selected = editor.selection.getSelectedElements();
		if (selected.length) {
			const tracks = editor.scenes.getActiveScene().tracks;
			for (const ref of selected) {
				const track = [tracks.main, ...tracks.overlay, ...tracks.audio].find(
					(t) => t.id === ref.trackId,
				);
				const element = track?.elements.find((e) => e.id === ref.elementId);
				if (
					element &&
					EFFECT_TARGET_ELEMENT_TYPES.some((t) => t === element.type)
				)
					editor.timeline.addClipEffect({ ...ref, effectType: effect.type });
			}
			return;
		}
		if (effect.type === "elite-chroma") {toast.info('Selecciona el clip al que quieres quitar el fondo.');return;}
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
