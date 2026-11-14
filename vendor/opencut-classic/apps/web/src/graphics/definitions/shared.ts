import type { ParamDefinition } from "@/params";

export type GraphicStrokeAlign = "inside" | "center" | "outside";

export const STROKE_ALIGN_PARAM: ParamDefinition<"strokeAlign"> = {
	key: "strokeAlign",
	label: "Alineación del contorno",
	type: "select",
	default: "center",
	group: "stroke",
	options: [
		{ value: "inside", label: "Interior" },
		{ value: "center", label: "Centro" },
		{ value: "outside", label: "Exterior" },
	],
};
