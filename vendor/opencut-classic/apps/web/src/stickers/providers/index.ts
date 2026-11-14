import { stickersRegistry } from "../registry";
import type { StickerProvider } from "@/stickers/types";
import { flagsProvider } from "./flags";
import { logosProvider } from "./logos";
import { shapesProvider } from "./shapes";
import { calloutsProvider, emojiProvider, memesProvider } from "./elite-pack";

// Registration order is the order of the "Todo" overview.
const defaultProviders: StickerProvider[] = [
	memesProvider,
	emojiProvider,
	calloutsProvider,
	shapesProvider,
	flagsProvider,
	logosProvider,
];

export function registerDefaultStickerProviders({
	providersToRegister = defaultProviders,
}: {
	providersToRegister?: StickerProvider[];
} = {}): void {
	for (const provider of providersToRegister) {
		if (stickersRegistry.has(provider.id)) {
			continue;
		}
		stickersRegistry.register({key:provider.id,definition:provider});
	}
}
