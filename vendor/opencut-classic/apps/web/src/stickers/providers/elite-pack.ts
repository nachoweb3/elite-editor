import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";
import { parseStickerId } from "../sticker-id";
import {
	CALLOUT_COLORS,
	MEME_STYLES,
	type MemeStyle,
	arrowSvg,
	badgeSvg,
	bubbleSvg,
	curvedArrowSvg,
	emojiSvg,
	markSvg,
	memeSvg,
	numberSvg,
	progressSvg,
	scribbleArrowSvg,
	starsSvg,
	svgUrl,
} from "./elite-art";
import { EMOJI_GROUPS, emojiCatalogue, fromCode, normalizeQuery, toCode } from "./emoji-data";

type Entry = {
	id: string;
	name: string;
	section: string;
	sectionTitle: string;
	search: string;
	svg: () => string;
};

const urlCache = new Map<string, string>();
const cachedUrl = (id: string, make: () => string) => {
	let url = urlCache.get(id);
	if (!url) {
		url = svgUrl(make());
		if (urlCache.size > 2000) urlCache.clear();
		urlCache.set(id, url);
	}
	return url;
};
const toItem = (provider: string) => (entry: Entry): StickerItem => ({
	id: entry.id,
	provider,
	name: entry.name,
	previewUrl: cachedUrl(entry.id, entry.svg),
	metadata: { section: entry.section },
});

/** A provider backed by an in-memory catalogue of generated artwork. */
function catalogueProvider({
	id,
	entries,
	fallback,
}: {
	id: string;
	entries: () => Entry[];
	fallback?: (value: string) => string | null;
}): StickerProvider {
	let index: Map<string, Entry> | null = null;
	const byId = () => (index ??= new Map(entries().map((e) => [e.id, e])));
	return {
		id,
		async search({ query, options }): Promise<StickerSearchResult> {
			const terms = normalizeQuery(query).split(/\s+/).filter(Boolean);
			const matches = entries().filter((e) => terms.every((t) => e.search.includes(t)));
			const limit = options?.limit ?? 100;
			return { items: matches.slice(0, limit).map(toItem(id)), total: matches.length, hasMore: matches.length > limit };
		},
		async browse({ options }): Promise<StickerBrowseResult> {
			const sections = new Map<string, { title: string; items: Entry[] }>();
			for (const entry of entries()) {
				const section = sections.get(entry.section) ?? { title: entry.sectionTitle, items: [] };
				section.items.push(entry);
				sections.set(entry.section, section);
			}
			const limit = options?.limit;
			return {
				sections: [...sections.entries()].map(([key, section]) => ({
					id: key,
					title: section.title,
					items: (limit ? section.items.slice(0, limit) : section.items).map(toItem(id)),
					hasMore: limit ? section.items.length > limit : false,
					layout: "grid" as const,
				})),
			};
		},
		resolveUrl({ stickerId }): string {
			const entry = byId().get(stickerId);
			if (entry) return cachedUrl(entry.id, entry.svg);
			const { providerValue } = parseStickerId({ stickerId });
			const made = fallback?.(providerValue);
			return made ? cachedUrl(stickerId, () => made) : cachedUrl("missing", () => memeSvg("impact", "?"));
		},
	};
}

/* --------------------------------- Memes --------------------------------- */

export const MEME_WORDS = [
	"WOW", "¿QUÉ?", "BRUTAL", "ÉPICO", "LOL", "XD", "OMG", "F", "GG", "RIP", "POV:", "PLOT TWIST",
	"SPOILER", "NO", "SÍ", "BRO", "CRACK", "TOP 1", "BASED", "CRINGE", "SUS", "NPC", "+1000 AURA",
	"-1000 AURA", "MOOD", "MIENTRAS TANTO…", "3 HORAS DESPUÉS", "FIN", "CONTINUARÁ…", "ALERTA", "OJO",
	"TREMENDO", "INCREÍBLE", "JAJAJA", "NOOO", "¿EN SERIO?", "LET'S GO", "BOOM", "ZAS", "PUM", "BANG",
	"OK", "LIKE", "100 %", "EPIC FAIL", "LEVEL UP", "GAME OVER", "VICTORIA", "PRO", "NOOB", "ICONIC",
	"SLAY", "DATO", "RED FLAG", "GREEN FLAG", "HYPE", "ESPERA…", "¡SORPRESA!", "MÁS TARDE", "TRUCO",
];
export const MEME_PREFIX = "memes";
export const memeStickerId = (style: MemeStyle, text: string) =>
	`${MEME_PREFIX}:${style}:${encodeURIComponent(text.trim().slice(0, 40))}`;
export function parseMemeValue(value: string): { style: MemeStyle; text: string } | null {
	const separator = value.indexOf(":");
	if (separator <= 0) return null;
	const style = value.slice(0, separator) as MemeStyle;
	if (!(style in MEME_STYLES)) return null;
	try {
		return { style, text: decodeURIComponent(value.slice(separator + 1)) };
	} catch {
		return null;
	}
}
let memeEntries: Entry[] | null = null;
export const memesProvider = catalogueProvider({
	id: MEME_PREFIX,
	entries: () =>
		(memeEntries ??= (Object.entries(MEME_STYLES) as [MemeStyle, string][]).flatMap(([style, title]) =>
			MEME_WORDS.map((word) => ({
				id: memeStickerId(style, word),
				name: `${word} · ${title}`,
				section: style,
				sectionTitle: `Estilo ${title.toLowerCase()}`,
				search: normalizeQuery(`${word} ${title} meme reaccion texto`),
				svg: () => memeSvg(style, word),
			})),
		)),
	// Any text in any style: this is how custom meme stickers live in a project.
	fallback: (value) => {
		const parsed = parseMemeValue(value);
		return parsed ? memeSvg(parsed.style, parsed.text) : null;
	},
});

/* -------------------------------- Callouts ------------------------------- */

const DIRECTIONS: [string, number][] = [
	["derecha", 0], ["abajo-derecha", 45], ["abajo", 90], ["abajo-izquierda", 135],
	["izquierda", 180], ["arriba-izquierda", 225], ["arriba", 270], ["arriba-derecha", 315],
];
const SOCIAL: { key: string; label: string; background: string; emoji?: string; dot?: string; color?: string; tags: string }[] = [
	{ key: "suscribete", label: "SUSCRÍBETE", background: "#ff1f3d", emoji: "🔔", tags: "suscribirse canal youtube" },
	{ key: "me-gusta", label: "ME GUSTA", background: "#2563eb", emoji: "👍", tags: "like" },
	{ key: "comenta", label: "COMENTA", background: "#7c3aed", emoji: "💬", tags: "comentario" },
	{ key: "comparte", label: "COMPARTE", background: "#0ea5a4", emoji: "🔁", tags: "compartir share" },
	{ key: "sigueme", label: "SÍGUEME", background: "#e11d74", emoji: "➕", tags: "seguir follow" },
	{ key: "activa-campana", label: "ACTIVA LA CAMPANA", background: "#f59e0b", emoji: "🔔", color: "#111", tags: "notificaciones" },
	{ key: "link-bio", label: "LINK EN LA BIO", background: "#111827", emoji: "🔗", tags: "enlace descripcion" },
	{ key: "en-directo", label: "EN DIRECTO", background: "#dc2626", dot: "#fff", tags: "live directo streaming" },
	{ key: "rec", label: "REC", background: "#0b0b0b", dot: "#ff2e4d", tags: "grabando grabar" },
	{ key: "nuevo-video", label: "NUEVO VÍDEO", background: "#5effc8", color: "#062018", emoji: "✨", tags: "nuevo estreno" },
	{ key: "parte-2", label: "PARTE 2", background: "#a78bfa", color: "#140b2b", tags: "segunda parte continuacion" },
	{ key: "top-10", label: "TOP 10", background: "#ffd43b", color: "#111", emoji: "🏆", tags: "ranking lista" },
	{ key: "oferta", label: "OFERTA", background: "#16a34a", emoji: "💸", tags: "descuento promo" },
	{ key: "gratis", label: "GRATIS", background: "#0891b2", emoji: "🎁", tags: "free regalo" },
	{ key: "importante", label: "IMPORTANTE", background: "#ea580c", emoji: "⚠️", tags: "atencion aviso" },
	{ key: "dato-curioso", label: "DATO CURIOSO", background: "#0f766e", emoji: "💡", tags: "sabias que idea tip" },
	{ key: "spoiler", label: "SPOILER", background: "#111827", emoji: "🙈", tags: "aviso" },
	{ key: "sorteo", label: "SORTEO", background: "#db2777", emoji: "🎉", tags: "giveaway concurso" },
];
let calloutEntries: Entry[] | null = null;
function buildCallouts(): Entry[] {
	const list: Entry[] = [];
	const add = (key: string, name: string, section: string, sectionTitle: string, tags: string, make: () => string) =>
		list.push({ id: `callouts:${key}`, name, section, sectionTitle, search: normalizeQuery(`${name} ${tags} ${sectionTitle}`), svg: make });
	for (const item of SOCIAL)
		add(`badge-${item.key}`, item.label, "redes", "Redes y llamadas a la acción", item.tags, () => badgeSvg(item));
	for (const [colorName, color] of Object.entries(CALLOUT_COLORS)) {
		for (const [direction, angle] of DIRECTIONS)
			add(`flecha-${direction}-${colorName}`, `Flecha ${direction.replace("-", " ")} ${colorName}`, "flechas", "Flechas", "flecha señalar apuntar", () => arrowSvg(angle, color));
		add(`curva-izquierda-${colorName}`, `Flecha curva ${colorName}`, "flechas", "Flechas", "flecha curva señalar", () => curvedArrowSvg(color, false));
		add(`curva-derecha-${colorName}`, `Flecha curva invertida ${colorName}`, "flechas", "Flechas", "flecha curva señalar", () => curvedArrowSvg(color, true));
		add(`garabato-${colorName}`, `Flecha a mano ${colorName}`, "flechas", "Flechas", "flecha dibujada garabato", () => scribbleArrowSvg(color));
		for (const [mark, label] of [["circulo", "Círculo a mano"], ["caja", "Recuadro a mano"], ["subrayado", "Subrayado"], ["tachado", "Tachado"], ["check", "Correcto"], ["cruz", "Incorrecto"]] as const)
			add(`marca-${mark}-${colorName}`, `${label} ${colorName}`, "marcas", "Marcas y resaltados", "resaltar destacar marcar señalar", () => markSvg(mark, color));
	}
	for (const [kind, label] of [["redonda", "Bocadillo"], ["derecha", "Bocadillo a la derecha"], ["rectangular", "Bocadillo rectangular"], ["pensamiento", "Pensamiento"], ["grito", "Grito"]] as const)
		add(`bocadillo-${kind}`, label, "bocadillos", "Bocadillos", "dialogo hablar comic texto", () => bubbleSvg(kind));
	const steps = ["#5effc8", "#38e8ff", "#a78bfa", "#ffd43b", "#ff8a3d"];
	for (let n = 1; n <= 10; n++)
		add(`numero-${n}`, `Número ${n}`, "numeros", "Números y pasos", `paso ${n} numero lista`, () => numberSvg(String(n), steps[(n - 1) % steps.length]));
	for (let n = 1; n <= 5; n++)
		add(`paso-${n}`, `PASO ${n}`, "numeros", "Números y pasos", "tutorial paso", () => badgeSvg({ label: `PASO ${n}`, background: steps[(n - 1) % steps.length], color: "#0b0b0b" }));
	for (let n = 0; n <= 5; n++)
		add(`estrellas-${n}`, `${n} de 5 estrellas`, "valoraciones", "Valoraciones y progreso", "puntuacion review reseña rating", () => starsSvg(n));
	for (const percent of [10, 25, 50, 75, 90, 100])
		add(`progreso-${percent}`, `Progreso ${percent} %`, "valoraciones", "Valoraciones y progreso", "barra cargando carga", () => progressSvg(percent));
	return list;
}
export const calloutsProvider = catalogueProvider({ id: "callouts", entries: () => (calloutEntries ??= buildCallouts()) });

/* --------------------------------- Emoji --------------------------------- */

let emojiEntries: Entry[] | null = null;
export const emojiProvider = catalogueProvider({
	id: "emoji",
	entries: () =>
		(emojiEntries ??= emojiCatalogue().map((e) => ({
			id: `emoji:${toCode(e.emoji)}`,
			name: e.name,
			section: e.group,
			sectionTitle: EMOJI_GROUPS[e.group],
			search: `${e.search} emoji`,
			svg: () => emojiSvg(e.emoji),
		}))),
	// Any emoji code still renders, even if it is not in the curated list.
	fallback: (value) => (/^[0-9a-f-]+$/i.test(value) ? emojiSvg(fromCode(value)) : null),
});
