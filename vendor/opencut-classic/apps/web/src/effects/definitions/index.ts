import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import {eliteEffects} from './elite';

const defaultEffects = [blurEffectDefinition,...eliteEffects];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
