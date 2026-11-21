import type {ClipTransitionType} from './transitions.mjs';

export const COMPOSITION_VERSION: number;
export const COMPOSITION_FPS: number;
export function outputDuration(project: unknown): number;
export function normalizeChromaColor(value: unknown): string;
export function chromaFor(item?: unknown): {
  enabled: boolean | null;
  color: string;
  similarity: number;
  blend: number;
};
export function transitionFor(
  clip: unknown,
  index: number,
  count: number,
  settings?: unknown,
  fps?: number
): {
  in: {type: ClipTransitionType; duration: number} | null;
  out: {type: ClipTransitionType; duration: number} | null;
};
export function buildComposition(project: unknown, options?: unknown): {
  version: number;
  fps: number;
  width: number;
  height: number;
  profile: string;
  duration: number;
  timeline: unknown[];
  words: unknown[];
  visuals: unknown[];
  audio: unknown[];
  captions: {enabled: boolean; template: string; position: string; title: string};
};
