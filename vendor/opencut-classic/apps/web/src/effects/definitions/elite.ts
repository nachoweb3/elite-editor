import type { EffectDefinition } from "../types";
import type { ParamDefinition, ParamValues } from "@/params";
import { converter, parse } from "culori";
const rgb = converter("rgb");
const number = (
	key: string,
	label: string,
	value: number,
	min = 0,
	max = 1,
	step = 0.01,
): ParamDefinition => ({
	key,
	label,
	type: "number",
	default: value,
	min,
	max,
	step,
});
function effect(
	type: string,
	name: string,
	mode: number,
	params: ParamDefinition[],
	values: (p: ParamValues) => number[],
	extra: (p: ParamValues) => number[] = () => [0, 0, 0, 0],
): EffectDefinition {
	return {
		type,
		name,
		keywords: [name, type],
		params,
		renderer: {
			passes: [
				{
					shader: "elite",
					uniforms: ({ effectParams }) => ({
						u_values: [mode, ...values(effectParams)],
						u_extra: extra(effectParams),
					}),
				},
			],
		},
	};
}
const n = (p: ParamValues, k: string, d: number) =>
	typeof p[k] === "number" ? (p[k] as number) : d;
export const eliteEffects: EffectDefinition[] = [
	effect(
		"elite-color",
		"Color y exposición",
		0,
		[
			number("exposure", "Exposición", 0, -2, 2),
			number("contrast", "Contraste", 1, 0, 2),
			number("saturation", "Saturación", 1, 0, 2),
		],
		(p) => [n(p, "exposure", 0), n(p, "contrast", 1), n(p, "saturation", 1)],
	),
	...(
		[
			["elite-mono", "Blanco y negro", 1, 1],
			["elite-sepia", "Sepia", 2, 0.8],
			["elite-invert", "Negativo", 3, 1],
			["elite-vignette", "Viñeta", 4, 0.7],
			["elite-sharpen", "Nitidez", 8, 0.3],
		] as const
	).map(([id, name, mode, value]) =>
		effect(id, name, mode, [number("amount", "Intensidad", value)], (p) => [
			n(p, "amount", value),
			0,
			0,
		]),
	),
	effect(
		"elite-pixel",
		"Pixelado",
		5,
		[number("amount", "Tamaño del píxel", 16, 1, 120, 1)],
		(p) => [n(p, "amount", 16), 0, 0],
	),
	effect(
		"elite-temperature",
		"Temperatura",
		7,
		[number("amount", "Frío / cálido", 0.4, -1, 1)],
		(p) => [n(p, "amount", 0.4), 0, 0],
	),
	effect(
		"elite-chroma",
		"Chroma key · quitar fondo",
		6,
		[
			{
				key: "color",
				label: "Color a eliminar",
				type: "color",
				default: "#00ff00",
			},
			number("threshold", "Tolerancia", 0.15, 0, 0.8),
			number("softness", "Suavidad del borde", 0.08, 0.001, 0.5),
			number("spill", "Reducir contaminación", 0.8),
		],
		(p) => [
			n(p, "threshold", 0.15),
			n(p, "softness", 0.08),
			n(p, "spill", 0.8),
		],
		(p) => {
			const c = rgb(parse(String(p.color || "#00ff00")));
			return [c?.r ?? 0, c?.g ?? 1, c?.b ?? 0, 0];
		},
	),
];
