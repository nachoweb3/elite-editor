"use client";

import { Separator } from "@/components/ui/separator";
import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { TabBar } from "./tabbar";
import { Captions } from "@/subtitles/components/assets-view";
import { NachoResources } from "./views/nacho-resources";
import { NachoAssistant } from "./views/nacho-assistant";
import { NachoGenerate } from "./views/nacho-generate";
import { LibraryPanel } from "./views/library-panel";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { StickersView } from "@/stickers/components/assets-view";
import { TextView } from "@/text/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { EliteMotion } from "./views/elite-motion";
import { EliteAudio } from "./views/elite-audio";
import { EliteZoom } from "./views/elite-zoom";

export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		zoom: <EliteZoom />,
		assistant: <NachoAssistant />,
		generate: <NachoGenerate />,
		nacho: <NachoResources />,
		library: <LibraryPanel />,
		media: <MediaView />,
		sounds: <EliteAudio />,
		background: <EffectsView category="background" />,
		text: <TextView />,
		stickers: <StickersView />,
		effects: <EffectsView />,
		transitions: <EliteMotion />,
		captions: <Captions />,
		adjustment: <EffectsView category="color" />,
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full rounded-sm border overflow-hidden">
			<TabBar />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
