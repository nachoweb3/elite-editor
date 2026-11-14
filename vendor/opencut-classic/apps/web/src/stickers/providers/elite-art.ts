// Original sticker artwork for Elite Editor, generated as SVG at runtime.
// Everything here is drawn from code (no third-party images), so the packs are
// MIT like the rest of Elite's contributions and work fully offline. Text uses
// fonts installed with the system (Impact, Arial Black, Bahnschrift, Segoe UI Emoji).

export const FONTS = {
	impact: "Impact, 'Anton', 'Haettenschweiler', 'Arial Black', sans-serif",
	heavy: "'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Arial, sans-serif",
	tech: "Bahnschrift, 'DIN Alternate', 'Segoe UI', Arial, sans-serif",
	emoji: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif",
} as const;

export const escapeXml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

export const svgUrl = (svg: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function svg(width: number, height: number, body: string, defs = "") {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

/** Font size that keeps a line inside `maxWidth`; very long lines are squeezed with textLength. */
function fit(text: string, maxWidth: number, maxSize: number, ratio: number) {
	const length = Math.max(1, [...text].length);
	const size = Math.max(40, Math.min(maxSize, maxWidth / (length * ratio)));
	const squeeze =
		length * size * ratio > maxWidth
			? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`
			: "";
	return { size: Math.round(size), squeeze };
}

const line = (
	text: string,
	{
		x,
		y,
		size,
		font,
		fill,
		extra = "",
		squeeze = "",
	}: { x: number; y: number; size: number; font: string; fill: string; extra?: string; squeeze?: string },
) =>
	`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="${size}" font-weight="900" fill="${fill}"${squeeze} ${extra}>${escapeXml(text)}</text>`;

/* --------------------------------- Memes --------------------------------- */

export const MEME_STYLES = {
	impact: "Clásico",
	burst: "Cómic",
	neon: "Neón",
	diecut: "Troquelado",
	tape: "Cinta",
	glitch: "Glitch",
	bubble: "Bocadillo",
} as const;
export type MemeStyle = keyof typeof MEME_STYLES;

const ACCENTS = ["#ff3d7f", "#5effc8", "#ffd43b", "#38e8ff", "#a78bfa", "#ff8a3d"];
const accentFor = (text: string) =>
	ACCENTS[[...text].reduce((sum, ch) => sum + (ch.codePointAt(0) ?? 0), 0) % ACCENTS.length];

function starburst(cx: number, cy: number, rx: number, ry: number, points: number, inner: number) {
	const coords: string[] = [];
	for (let i = 0; i < points * 2; i++) {
		const angle = (Math.PI * i) / points - Math.PI / 2;
		const k = i % 2 === 0 ? 1 : inner;
		coords.push(`${(cx + Math.cos(angle) * rx * k).toFixed(1)},${(cy + Math.sin(angle) * ry * k).toFixed(1)}`);
	}
	return coords.join(" ");
}

export function memeSvg(style: MemeStyle, rawText: string): string {
	const text = rawText.trim().slice(0, 40) || "TEXTO";
	const accent = accentFor(text);
	switch (style) {
		case "burst": {
			const { size, squeeze } = fit(text, 380, 120, 0.68);
			return svg(
				600,
				400,
				`<polygon points="${starburst(300, 200, 290, 190, 14, 0.72)}" fill="#ffd43b" stroke="#e8590c" stroke-width="12" stroke-linejoin="round"/>` +
					`<polygon points="${starburst(300, 200, 240, 150, 14, 0.74)}" fill="#fff3bf" opacity=".55"/>` +
					line(text, { x: 300, y: 205, size, font: FONTS.heavy, fill: "#1b1b1b", squeeze, extra: `transform="rotate(-6 300 205)" stroke="#fff" stroke-width="${Math.round(size * 0.08)}" paint-order="stroke"` }),
			);
		}
		case "neon": {
			const { size, squeeze } = fit(text, 480, 120, 0.6);
			return svg(
				600,
				280,
				`<rect x="10" y="10" width="580" height="260" rx="42" fill="#0b0d1e" stroke="${accent}" stroke-width="5" filter="url(#g)"/>` +
					line(text, { x: 300, y: 145, size, font: FONTS.tech, fill: "#f5fffb", squeeze, extra: `filter="url(#g)" stroke="${accent}" stroke-width="3"` }),
				`<filter id="g" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
			);
		}
		case "diecut": {
			const { size, squeeze } = fit(text, 520, 150, 0.7);
			return svg(
				600,
				300,
				line(text, { x: 300, y: 150, size, font: FONTS.heavy, fill: accent, squeeze, extra: `stroke="#fff" stroke-width="${Math.round(size * 0.26)}" stroke-linejoin="round" paint-order="stroke" filter="url(#s)"` }),
				`<filter id="s" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".45"/></filter>`,
			);
		}
		case "tape": {
			const { size, squeeze } = fit(text, 470, 110, 0.62);
			return svg(
				600,
				260,
				`<g transform="rotate(-4 300 130)"><polygon points="28,48 46,40 38,56 572,44 560,60 574,74 566,212 578,222 30,220 44,206 26,196" fill="#ffe066" opacity=".95"/>` +
					`<rect x="40" y="56" width="520" height="14" fill="#fff" opacity=".25"/>` +
					line(text, { x: 300, y: 136, size, font: FONTS.tech, fill: "#1f1f1f", squeeze }) +
					`</g>`,
			);
		}
		case "glitch": {
			const { size, squeeze } = fit(text, 520, 140, 0.64);
			const base = { y: 150, size, font: FONTS.heavy, squeeze };
			return svg(
				600,
				300,
				line(text, { ...base, x: 292, fill: "#38e8ff", extra: `opacity=".85"` }) +
					line(text, { ...base, x: 308, fill: "#ff2e63", extra: `opacity=".85"` }) +
					line(text, { ...base, x: 300, fill: "#ffffff" }) +
					`<rect x="40" y="128" width="520" height="7" fill="#05060f" opacity=".55"/><rect x="80" y="170" width="440" height="4" fill="#05060f" opacity=".45"/>`,
			);
		}
		case "bubble": {
			const { size, squeeze } = fit(text, 440, 100, 0.62);
			return svg(
				600,
				330,
				`<path d="M70 30 H530 Q570 30 570 70 V210 Q570 250 530 250 H220 L130 310 L150 250 H70 Q30 250 30 210 V70 Q30 30 70 30 Z" fill="#fff" stroke="#111" stroke-width="8" stroke-linejoin="round"/>` +
					line(text, { x: 300, y: 140, size, font: FONTS.heavy, fill: "#111", squeeze }),
			);
		}
		default: {
			const { size, squeeze } = fit(text, 560, 150, 0.52);
			return svg(
				600,
				240,
				line(text, { x: 300, y: 122, size, font: FONTS.impact, fill: "#fff", squeeze, extra: `stroke="#000" stroke-width="${Math.round(size * 0.1)}" stroke-linejoin="round" paint-order="stroke"` }),
			);
		}
	}
}

/* -------------------------------- Callouts ------------------------------- */

export const CALLOUT_COLORS = {
	rojo: "#ff2e4d",
	amarillo: "#ffd43b",
	blanco: "#ffffff",
	menta: "#5effc8",
} as const;
export type CalloutColor = keyof typeof CALLOUT_COLORS;

const outline = `stroke="#0b0b0b" stroke-width="7" stroke-linejoin="round" paint-order="stroke"`;

export function arrowSvg(angle: number, color: string) {
	return svg(
		260,
		260,
		`<g transform="rotate(${angle} 130 130)"><path d="M28 108 H150 V66 L234 130 L150 194 V152 H28 Z" fill="${color}" ${outline}/></g>`,
	);
}
export function curvedArrowSvg(color: string, flip: boolean) {
	const t = flip ? `transform="translate(300 0) scale(-1 1)"` : "";
	return svg(
		300,
		260,
		`<g ${t}><path d="M40 220 C 50 110, 130 60, 230 70" fill="none" stroke="#0b0b0b" stroke-width="26" stroke-linecap="round"/>` +
			`<path d="M40 220 C 50 110, 130 60, 230 70" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>` +
			`<path d="M206 30 L268 74 L212 122 Z" fill="${color}" ${outline}/></g>`,
	);
}
export function scribbleArrowSvg(color: string) {
	return svg(
		320,
		220,
		`<path d="M24 170 C 70 60, 120 200, 160 120 S 230 40, 270 90" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
			`<path d="M240 58 L278 92 L232 112" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`,
	);
}
export function markSvg(kind: string, color: string) {
	const stroke = `fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"`;
	switch (kind) {
		case "circulo":
			return svg(500, 280, `<path d="M70 130 C 70 40, 430 30, 440 130 C 450 230, 80 240, 58 150 C 50 105, 130 66, 210 58" ${stroke}/>`);
		case "caja":
			return svg(480, 300, `<path d="M40 52 L438 40 L444 252 L34 258 Z M30 70 L40 46" ${stroke}/>`);
		case "subrayado":
			return svg(520, 120, `<path d="M20 70 C 90 40, 140 96, 210 64 S 330 36, 400 66 S 470 80, 500 52" ${stroke}/>`);
		case "tachado":
			return svg(300, 300, `<path d="M40 40 L260 260 M260 40 L40 260" ${stroke} stroke-width="20"/>`);
		case "check":
			return svg(300, 300, `<circle cx="150" cy="150" r="128" fill="${color}" ${outline}/><path d="M86 156 L132 202 L218 104" fill="none" stroke="#0b0b0b" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`);
		case "cruz":
			return svg(300, 300, `<circle cx="150" cy="150" r="128" fill="${color}" ${outline}/><path d="M100 100 L200 200 M200 100 L100 200" fill="none" stroke="#0b0b0b" stroke-width="26" stroke-linecap="round"/>`);
		default:
			return svg(300, 300, `<circle cx="150" cy="150" r="120" ${stroke}/>`);
	}
}

export function bubbleSvg(kind: string) {
	const paint = `fill="#fff" stroke="#111" stroke-width="8" stroke-linejoin="round"`;
	switch (kind) {
		case "pensamiento":
			return svg(560, 380, `<ellipse cx="300" cy="150" rx="240" ry="120" ${paint}/><circle cx="150" cy="300" r="30" ${paint}/><circle cx="96" cy="350" r="16" ${paint}/>`);
		case "grito":
			return svg(560, 400, `<polygon points="${starburst(280, 200, 260, 180, 16, 0.78)}" ${paint}/>`);
		case "rectangular":
			return svg(560, 320, `<path d="M30 30 H530 V230 H230 L150 300 L160 230 H30 Z" ${paint}/>`);
		case "derecha":
			return svg(560, 340, `<path d="M70 30 H490 Q530 30 530 70 V200 Q530 240 490 240 H400 L440 310 L330 240 H70 Q30 240 30 200 V70 Q30 30 70 30 Z" ${paint}/>`);
		default:
			return svg(560, 340, `<path d="M70 30 H490 Q530 30 530 70 V200 Q530 240 490 240 H230 L130 310 L160 240 H70 Q30 240 30 200 V70 Q30 30 70 30 Z" ${paint}/>`);
	}
}

/** Rounded badge: optional emoji glyph + label. */
export function badgeSvg({
	label,
	background,
	color = "#fff",
	emoji,
	dot,
}: {
	label: string;
	background: string;
	color?: string;
	emoji?: string;
	dot?: string;
}) {
	const lead = emoji || dot ? 92 : 0;
	const { size, squeeze } = fit(label, 470 - lead, 74, 0.62);
	const width = 560;
	const textX = (width + lead) / 2;
	return svg(
		width,
		170,
		`<rect x="12" y="20" width="${width - 24}" height="130" rx="65" fill="${background}" filter="url(#d)"/>` +
			`<rect x="12" y="20" width="${width - 24}" height="62" rx="31" fill="#fff" opacity=".14"/>` +
			(emoji
				? `<text x="${lead + 6}" y="88" text-anchor="middle" dominant-baseline="central" font-family="${FONTS.emoji}" font-size="68">${escapeXml(emoji)}</text>`
				: "") +
			(dot ? `<circle cx="${lead - 6}" cy="85" r="22" fill="${dot}"/>` : "") +
			line(label, { x: textX, y: 87, size, font: FONTS.heavy, fill: color, squeeze }),
		`<filter id="d" x="-10%" y="-30%" width="120%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".4"/></filter>`,
	);
}

export function numberSvg(value: string, background: string) {
	const { size } = fit(value, 170, 150, 0.62);
	return svg(
		260,
		260,
		`<circle cx="130" cy="130" r="112" fill="${background}" stroke="#0b0b0b" stroke-width="10"/>` +
			line(value, { x: 130, y: 136, size, font: FONTS.heavy, fill: "#0b0b0b" }),
	);
}

export function starsSvg(filled: number) {
	const star = (x: number, on: boolean) =>
		`<polygon points="${starburst(x, 70, 52, 52, 5, 0.45)}" fill="${on ? "#ffd43b" : "#3a3f58"}" stroke="#0b0b0b" stroke-width="6" stroke-linejoin="round"/>`;
	return svg(560, 140, [0, 1, 2, 3, 4].map((i) => star(60 + i * 110, i < filled)).join(""));
}

export function progressSvg(percent: number) {
	return svg(
		560,
		120,
		`<rect x="20" y="36" width="520" height="48" rx="24" fill="#10132b" stroke="#5effc8" stroke-width="4"/>` +
			`<rect x="30" y="46" width="${Math.max(28, (500 * percent) / 100)}" height="28" rx="14" fill="#5effc8"/>` +
			line(`${percent} %`, { x: 280, y: 60, size: 30, font: FONTS.tech, fill: "#fff", extra: `stroke="#0b0b0b" stroke-width="5" paint-order="stroke"` }),
	);
}

export function emojiSvg(emoji: string) {
	return svg(
		256,
		256,
		`<text x="128" y="138" text-anchor="middle" dominant-baseline="central" font-family="${FONTS.emoji}" font-size="200">${escapeXml(emoji)}</text>`,
	);
}
