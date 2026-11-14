import type { ElementType } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	AiMagicIcon,
	ClosedCaptionIcon,
	Folder03Icon,
	Happy01Icon,
	HeadphonesIcon,
	ImageRemoveIcon,
	LibraryIcon,
	MagicWand05Icon,
	PackageSearchIcon,
	TextIcon,
	Settings01Icon,
	SparklesIcon,
	Sun03Icon,
	TransitionRightIcon,
	ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export const TAB_KEYS = [
	"zoom",
	"background",
	"assistant",
	"generate",
	"nacho",
	"library",
	"media",
	"sounds",
	"text",
	"stickers",
	"effects",
	"transitions",
	"captions",
	"adjustment",
	"settings",
] as const;

export type Tab = (typeof TAB_KEYS)[number];

const createHugeiconsIcon =
	({ icon }: { icon: IconSvgElement }) =>
	({ className }: { className?: string }) => (
		<HugeiconsIcon icon={icon} className={className} />
	);

export const tabs = {
	zoom: {
		icon: createHugeiconsIcon({ icon: ZoomInAreaIcon }),
		label: "Zoom ◆",
	},
	background: {
		icon: createHugeiconsIcon({ icon: ImageRemoveIcon }),
		label: "Quitar fondo",
	},
	assistant: {
		icon: createHugeiconsIcon({ icon: AiMagicIcon }),
		label: "Asistente IA",
	},
	generate: {
		icon: createHugeiconsIcon({ icon: SparklesIcon }),
		label: "Crear con IA",
	},
	nacho: {
		icon: createHugeiconsIcon({ icon: LibraryIcon }),
		label: "Biblioteca Elite",
	},
	library: {
		icon: createHugeiconsIcon({ icon: PackageSearchIcon }),
		label: "Recursos",
	},
	media: {
		icon: createHugeiconsIcon({ icon: Folder03Icon }),
		label: "Medios",
	},
	sounds: {
		icon: createHugeiconsIcon({ icon: HeadphonesIcon }),
		label: "Sonidos",
	},
	text: {
		icon: createHugeiconsIcon({ icon: TextIcon }),
		label: "Texto",
	},
	stickers: {
		icon: createHugeiconsIcon({ icon: Happy01Icon }),
		label: "Pegatinas",
	},
	effects: {
		icon: createHugeiconsIcon({ icon: MagicWand05Icon }),
		label: "Efectos",
	},
	transitions: {
		icon: createHugeiconsIcon({ icon: TransitionRightIcon }),
		label: "Transiciones",
	},
	captions: {
		icon: createHugeiconsIcon({ icon: ClosedCaptionIcon }),
		label: "Subtítulos",
	},
	adjustment: {
		icon: createHugeiconsIcon({ icon: Sun03Icon }),
		label: "Color y luz",
	},
	settings: {
		icon: createHugeiconsIcon({ icon: Settings01Icon }),
		label: "Configuración",
	},
} satisfies Record<
	Tab,
	{ icon: ElementType<{ className?: string }>; label: string }
>;

export type MediaViewMode = "grid" | "list";
export type MediaSortKey = "name" | "type" | "duration" | "size";
export type MediaSortOrder = "asc" | "desc";

interface AssetsPanelStore {
	activeTab: Tab;
	setActiveTab: (tab: Tab) => void;
	highlightMediaId: string | null;
	requestRevealMedia: (mediaId: string) => void;
	clearHighlight: () => void;

	/* Media */
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	mediaSortBy: MediaSortKey;
	mediaSortOrder: MediaSortOrder;
	setMediaSort: (args: { key: MediaSortKey; order: MediaSortOrder }) => void;
}

export const useAssetsPanelStore = create<AssetsPanelStore>()(
	persist(
		(set) => ({
			activeTab: "media",
			setActiveTab: (tab) => set({ activeTab: tab }),
			highlightMediaId: null,
			requestRevealMedia: (mediaId) =>
				set({ activeTab: "media", highlightMediaId: mediaId }),
			clearHighlight: () => set({ highlightMediaId: null }),
			mediaViewMode: "grid",
			setMediaViewMode: (mode) => set({ mediaViewMode: mode }),
			mediaSortBy: "name",
			mediaSortOrder: "asc",
			setMediaSort: ({ key, order }) =>
				set({ mediaSortBy: key, mediaSortOrder: order }),
		}),
		{
			name: "assets-panel",
			partialize: (state) => ({
				mediaViewMode: state.mediaViewMode,
				mediaSortBy: state.mediaSortBy,
				mediaSortOrder: state.mediaSortOrder,
			}),
		},
	),
);
