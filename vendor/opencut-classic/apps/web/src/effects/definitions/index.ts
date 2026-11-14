import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import {eliteEffects} from './elite';
import {beautyDefinition} from './beauty';

const defaultEffects = [blurEffectDefinition,...eliteEffects,beautyDefinition];

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
