"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());
				await editor.project.loadProject({ id: projectId });

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const newProjectId = await editor.project.createNewProject({
							name: "Untitled Project",
						});
						router.replace(`/editor/${newProjectId}`);
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<XenoLoader label="Abriendo proyecto" detail="Cargando timeline, medios y efectos" />
		);
	}

	if (!activeProject) {
		return (
			<XenoLoader label="Guardando y saliendo" detail="Tu trabajo queda en este equipo" />
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

function XenoLoader({ label, detail }: { label: string; detail: string }) {
	return (
		<div
			role="status"
			className="xeno-shell flex h-screen w-screen items-center justify-center"
		>
			<div className="flex flex-col items-center gap-5 text-center">
				<span
					className="xeno-orbit"
					data-busy="true"
					style={{ width: 64, height: 64 }}
					aria-hidden
				/>
				<div className="space-y-1">
					<p className="xeno-holo-text text-lg font-semibold tracking-[0.2em] uppercase">
						{label}
					</p>
					<p className="xeno-kicker">{detail}</p>
				</div>
				<div className="xeno-progress w-56" data-indeterminate="true" aria-hidden>
					<span />
				</div>
			</div>
		</div>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
