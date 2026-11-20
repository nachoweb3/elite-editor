"""Dibuja un stickman que explica un concepto con una metáfora visual.

Uso: python stickman.py especificacion.json
La especificación incluye width, height, fps, duration, concept, caption,
metaphor y outDir. Los fotogramas se guardan como frame-0001.png...
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

PAPER = (246, 242, 233)
INK = (20, 22, 26)
ACCENT = (224, 49, 49)
MUTED = (118, 116, 110)
SHADOW = (226, 220, 208)

BOLD_FONTS = [
    r"C:\Windows\Fonts\ariblk.ttf",
    r"C:\Windows\Fonts\seguibl.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\verdanab.ttf",
]
BODY_FONTS = [
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\verdana.ttf",
]

_FONTS = {}


def load_font(paths, size):
    size = max(8, int(size))
    key = (tuple(paths), size)
    if key in _FONTS:
        return _FONTS[key]
    font = None
    for candidate in paths:
        try:
            font = ImageFont.truetype(candidate, size)
            break
        except Exception:
            continue
    if font is None:
        try:
            font = ImageFont.load_default(size=size)
        except TypeError:
            font = ImageFont.load_default()
    _FONTS[key] = font
    return font


def bold(size):
    return load_font(BOLD_FONTS, size)


def body_font(size):
    return load_font(BODY_FONTS, size)


def wrap(draw, text, font, width, max_lines):
    words = str(text).split()
    lines, line = [], ""
    for word in words:
        probe = (line + " " + word).strip()
        if not line or draw.textlength(probe, font=font) <= width:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def polar(origin, angle, length):
    return (origin[0] + math.cos(angle) * length, origin[1] + math.sin(angle) * length)


def prop_battery(d, cx, cy, s, t, iw):
    bw, bh = s * 1.6, s * 0.78
    left, top, right, bottom = cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2
    d.rounded_rectangle([left, top, right, bottom], radius=s * 0.11, outline=INK, width=iw)
    d.rectangle([right, cy - bh * 0.16, right + s * 0.12, cy + bh * 0.16], fill=INK)
    level = max(0.05, 1 - 0.95 * t)
    inner_right = left + s * 0.09 + (bw - s * 0.18) * level
    if inner_right > left + s * 0.13:
        d.rounded_rectangle(
            [left + s * 0.09, top + s * 0.09, inner_right, bottom - s * 0.09],
            radius=s * 0.05,
            fill=ACCENT if level < 0.3 else INK,
        )
    if level < 0.3:
        d.arc([cx - s * 0.07, cy - s * 0.09, cx + s * 0.07, cy + s * 0.09], 0, 360, fill=PAPER, width=max(2, int(iw * 0.8)))


def prop_clock(d, cx, cy, s, t, iw):
    r = s * 0.44
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=iw)
    for k in range(12):
        a = k * math.pi / 6
        d.line(
            [cx + math.cos(a) * r * 0.84, cy + math.sin(a) * r * 0.84,
             cx + math.cos(a) * r * 0.94, cy + math.sin(a) * r * 0.94],
            fill=INK,
            width=max(2, int(iw / 2)),
        )
    hour = -math.pi / 2 + t * math.pi * 3
    minute = -math.pi / 2 + t * math.pi * 18
    d.line([cx, cy, cx + math.cos(hour) * r * 0.42, cy + math.sin(hour) * r * 0.42], fill=INK, width=iw)
    d.line([cx, cy, cx + math.cos(minute) * r * 0.72, cy + math.sin(minute) * r * 0.72], fill=ACCENT, width=max(2, int(iw * 0.85)))
    d.ellipse([cx - iw, cy - iw, cx + iw, cy + iw], fill=INK)


def prop_coins(d, cx, cy, s, t, iw):
    base = cy + s * 0.34
    w, h = s * 0.66, s * 0.19
    for k in range(3):
        y = base - k * h * 1.05
        d.ellipse([cx - w, y - h, cx + w, y + h], fill=PAPER, outline=INK, width=iw)
    top = base - 3 * h * 1.05
    flip = abs(math.sin(t * math.pi * 3))
    fh = h * (0.2 + 0.8 * flip)
    d.ellipse([cx - w, top - s * 0.22 - fh, cx + w, top - s * 0.22 + fh], fill=PAPER, outline=INK, width=iw)
    d.text((cx, top - s * 0.22), "€", font=bold(int(s * 0.24)), fill=ACCENT, anchor="mm")


def prop_ladder(d, cx, cy, s, t, iw):
    h, wdt = s * 1.05, s * 0.34
    lean = s * 0.15
    x1t, x2t = cx - wdt / 2 + lean, cx + wdt / 2 + lean
    x1b, x2b = cx - wdt / 2 - lean, cx + wdt / 2 - lean
    d.line([x1b, cy + h / 2, x1t, cy - h / 2], fill=INK, width=iw)
    d.line([x2b, cy + h / 2, x2t, cy - h / 2], fill=INK, width=iw)
    for k in range(6):
        f = k / 5
        x1 = x1b + (x1t - x1b) * f
        x2 = x2b + (x2t - x2b) * f
        y = cy + h / 2 - h * f
        d.line([x1, y, x2, y], fill=INK, width=max(2, int(iw / 2)))
    prog = 0.12 + 0.62 * t
    ax = cx + lean * (1 - 2 * prog)
    ay = cy + h / 2 - h * prog
    d.polygon([(ax - s * 0.10, ay + s * 0.05), (ax + s * 0.10, ay + s * 0.05), (ax, ay - s * 0.15)], fill=ACCENT)


def prop_chart(d, cx, cy, s, t, iw):
    w, h = s * 1.25, s * 0.86
    left, bottom = cx - w / 2, cy + h / 2
    d.line([left, cy - h / 2, left, bottom], fill=INK, width=iw)
    d.line([left, bottom, left + w, bottom], fill=INK, width=iw)
    bars = 5
    for k in range(bars):
        f = (k + 1) / bars
        local = min(1.0, max(0.0, (t - k * 0.08) / 0.5))
        frac = 0.16 + (f * 0.9 - 0.16) * local
        bw = w / bars * 0.6
        x = left + w * (k + 0.5) / bars - bw / 2
        y = bottom - h * frac
        d.rectangle([x, y, x + bw, bottom], fill=ACCENT if k == bars - 1 else INK)


def prop_target(d, cx, cy, s, t, iw):
    for k, r in enumerate((s * 0.46, s * 0.32, s * 0.18)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT if k == 2 else INK, width=iw)
    d.ellipse([cx - s * 0.05, cy - s * 0.05, cx + s * 0.05, cy + s * 0.05], fill=ACCENT)
    tip = (cx - s * 0.06 * (1 - t), cy - s * 0.06 * (1 - t))
    hx, hy = cx + s * 0.85 * (1 - 0.5 * t), cy - s * 0.85 * (1 - 0.5 * t)
    d.line([hx, hy, tip[0], tip[1]], fill=INK, width=iw)
    ang = math.atan2(tip[1] - hy, tip[0] - hx)
    for sgn in (1, -1):
        a = ang + math.pi + sgn * 0.44
        d.line([tip[0], tip[1], tip[0] + math.cos(a) * s * 0.17, tip[1] + math.sin(a) * s * 0.17], fill=INK, width=iw)


def prop_weight(d, cx, cy, s, t, iw):
    lift = abs(math.sin(t * math.pi)) * s * 0.08
    y = cy + s * 0.3 - lift
    bar = s * 0.85
    d.line([cx - bar, y, cx + bar, y], fill=INK, width=iw)
    for sgn in (-1, 1):
        for k, wgt in enumerate((s * 0.34, s * 0.24)):
            x = cx + sgn * (bar - k * s * 0.12)
            d.rounded_rectangle(
                [x - wgt * 0.22, y - wgt * 0.62, x + wgt * 0.22, y + wgt * 0.62],
                radius=s * 0.05,
                outline=INK,
                width=iw,
            )
    for dx in (-s * 0.15, s * 0.15):
        d.line([cx + dx, cy - s * 0.72, cx + dx, cy - s * 0.5], fill=ACCENT, width=iw)
        d.polygon(
            [(cx + dx - s * 0.07, cy - s * 0.52), (cx + dx + s * 0.07, cy - s * 0.52), (cx + dx, cy - s * 0.4)],
            fill=ACCENT,
        )


def prop_bulb(d, cx, cy, s, t, iw):
    r = s * 0.3
    d.ellipse([cx - r, cy - r * 1.15, cx + r, cy + r * 0.85], outline=INK, width=iw)
    d.rounded_rectangle([cx - r * 0.42, cy + r * 0.72, cx + r * 0.42, cy + r * 1.05], radius=s * 0.04, outline=INK, width=iw)
    d.line([cx - r * 0.3, cy + r * 0.86, cx + r * 0.3, cy + r * 0.86], fill=INK, width=max(2, int(iw / 2)))
    on = abs(math.sin(t * math.pi * 2))
    for k in range(8):
        a = -math.pi * 0.75 + k * math.pi * 1.5 / 7
        d.line(
            [cx + math.cos(a) * r * 1.45, cy + math.sin(a) * r * 1.45,
             cx + math.cos(a) * r * (1.5 + 0.35 * on), cy + math.sin(a) * r * (1.5 + 0.35 * on)],
            fill=ACCENT,
            width=max(2, int(iw * 0.8)),
        )


def prop_cycle(d, cx, cy, s, t, iw):
    r = s * 0.36
    start = -math.pi * 0.6 + t * math.pi * 2
    end = start + math.pi * 1.55
    d.arc([cx - r, cy - r, cx + r, cy + r], start=math.degrees(start), end=math.degrees(end), fill=INK, width=iw)
    ex, ey = cx + math.cos(end) * r, cy + math.sin(end) * r
    for sgn in (1, -1):
        a = end + math.pi + sgn * 0.5
        d.line([ex, ey, ex + math.cos(a) * s * 0.16, ey + math.sin(a) * s * 0.16], fill=INK, width=iw)
    d.ellipse([cx - s * 0.05, cy - s * 0.05, cx + s * 0.05, cy + s * 0.05], fill=ACCENT)


def prop_scale(d, cx, cy, s, t, iw):
    tilt = math.sin(t * math.pi * 2) * 0.12
    h = s * 0.5
    d.line([cx - s * 0.12, cy + h, cx + s * 0.12, cy + h], fill=INK, width=iw)
    d.line([cx, cy + h, cx, cy - h * 0.2], fill=INK, width=iw)
    bx1 = cx - math.cos(tilt) * s * 0.5
    by1 = cy - h * 0.2 - math.sin(tilt) * s * 0.5
    bx2 = cx + math.cos(tilt) * s * 0.5
    by2 = cy - h * 0.2 + math.sin(tilt) * s * 0.5
    d.line([bx1, by1, bx2, by2], fill=INK, width=iw)
    for px, py, big in ((bx1, by1, True), (bx2, by2, False)):
        r = s * 0.15 if big else s * 0.10
        d.line([px, py, px, py + s * 0.12], fill=INK, width=max(2, int(iw / 2)))
        d.arc([px - r, py + s * 0.1, px + r, py + s * 0.1 + r * 1.3], 0, 180, fill=ACCENT if big else INK, width=max(2, int(iw / 1.2)))


def prop_lock(d, cx, cy, s, t, iw):
    body_w, body_h = s * 0.62, s * 0.5
    top = cy - body_h * 0.12
    d.rounded_rectangle(
        [cx - body_w / 2, top, cx + body_w / 2, top + body_h], radius=s * 0.07, outline=INK, width=iw
    )
    r = s * 0.22
    lift = abs(math.sin(t * math.pi)) * s * 0.14
    d.arc([cx - r, top - s * 0.44 - lift, cx + r, top + s * 0.04 - lift], 180, 360, fill=INK, width=iw)
    d.line([cx + r, top - s * 0.2 - lift, cx + r, top - lift], fill=INK, width=iw)
    d.ellipse([cx - s * 0.06, cy + s * 0.08, cx + s * 0.06, cy + s * 0.2], fill=ACCENT)


def prop_screen(d, cx, cy, s, t, iw):
    w, h = s * 1.2, s * 0.8
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=s * 0.08, outline=INK, width=iw)
    d.line([cx - w / 2, cy - h / 2 + s * 0.16, cx + w / 2, cy - h / 2 + s * 0.16], fill=INK, width=max(2, int(iw / 1.4)))
    for k in range(3):
        x = cx - w / 2 + s * 0.12 + k * s * 0.09
        d.ellipse([x - s * 0.025, cy - h / 2 + s * 0.075, x + s * 0.025, cy - h / 2 + s * 0.125],
                  fill=ACCENT if k == 0 else INK)
    for k in range(3):
        y = cy - s * 0.06 + k * s * 0.14
        d.line([cx - w / 2 + s * 0.14, y, cx - w / 2 + s * (0.56 + 0.1 * k), y], fill=INK, width=max(2, int(iw / 1.6)))
    px = cx + w / 2 - s * 0.32 + math.sin(t * math.pi * 2) * s * 0.06
    py = cy + s * 0.1
    d.polygon([(px, py), (px, py + s * 0.21), (px + s * 0.15, py + s * 0.16)], fill=ACCENT)


def prop_brain(d, cx, cy, s, t, iw):
    d.ellipse([cx - s * 0.42, cy - s * 0.3, cx + s * 0.42, cy + s * 0.32], outline=INK, width=iw)
    d.line([cx, cy - s * 0.28, cx, cy + s * 0.3], fill=INK, width=max(2, int(iw / 1.6)))
    for k in range(3):
        off = s * 0.08 * k
        d.arc([cx - s * 0.34 + off, cy - s * 0.24, cx - s * 0.02 + off, cy + s * 0.08], 300, 120,
              fill=INK, width=max(2, int(iw / 1.6)))
        d.arc([cx + s * 0.02 - off, cy - s * 0.24, cx + s * 0.34 - off, cy + s * 0.08], 60, 240,
              fill=INK, width=max(2, int(iw / 1.6)))
    pulse = abs(math.sin(t * math.pi * 2))
    d.ellipse([cx - s * 0.05, cy - s * 0.18, cx + s * 0.05, cy - s * 0.18 + s * (0.1 + 0.04 * pulse)],
              fill=ACCENT)


def prop_filter(d, cx, cy, s, t, iw):
    top_w, bot_w = s * 0.95, s * 0.28
    top, bottom = cy - s * 0.42, cy + s * 0.2
    d.polygon(
        [(cx - top_w / 2, top), (cx + top_w / 2, top), (cx + bot_w / 2, bottom), (cx - bot_w / 2, bottom)],
        outline=INK,
        width=iw,
    )
    for k in range(4):
        f = 0.2 + k * 0.2
        half = (top_w + (bot_w - top_w) * f) / 2
        y = top + (bottom - top) * f
        d.line([cx - half, y, cx + half, y], fill=INK, width=max(2, int(iw / 2)))
    for k in range(5):
        phase = (t * 1.7 + k * 0.2) % 1
        x = cx - s * 0.28 + (k % 3) * s * 0.28
        y = top - s * 0.55 + phase * s * 0.5
        r = s * 0.03 + s * 0.012 * (1 - phase)
        d.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT)
    d.line([cx, bottom, cx, cy + s * 0.62], fill=INK, width=max(2, int(iw * 0.8)))
    wave = math.sin(t * math.pi * 4) * s * 0.035
    d.arc([cx - s * 0.34 + wave, cy + s * 0.42, cx + s * 0.34 + wave, cy + s * 0.94], 200, 340, fill=INK, width=max(2, int(iw * 0.8)))


PROPS = {
    "battery": prop_battery,
    "filter": prop_filter,
    "clock": prop_clock,
    "coins": prop_coins,
    "ladder": prop_ladder,
    "chart": prop_chart,
    "target": prop_target,
    "weight": prop_weight,
    "bulb": prop_bulb,
    "cycle": prop_cycle,
    "scale": prop_scale,
    "lock": prop_lock,
    "screen": prop_screen,
    "brain": prop_brain,
}


def draw_figure(d, cx, ground, height, t, target, iw):
    head_r = height * 0.115
    hip = (cx, ground - height * 0.44)
    sway = math.sin(t * math.pi * 2) * height * 0.012
    neck = (cx + sway, hip[1] - height * 0.32)
    head = (neck[0], neck[1] - head_r * 1.02)
    step = math.sin(t * math.pi * 3)

    d.ellipse(
        [cx - height * 0.2, ground - height * 0.03, cx + height * 0.2, ground + height * 0.035],
        fill=SHADOW,
    )

    for side in (-1, 1):
        a = math.pi / 2 + side * (0.14 + 0.16 * step)
        knee = polar(hip, a, height * 0.23)
        b = math.pi / 2 + side * (0.02 + 0.1 * step)
        foot = polar(knee, b, height * 0.2)
        d.line([hip, knee, foot], fill=INK, width=iw, joint="curve")
        d.line([foot, (foot[0] + side * height * 0.07, foot[1])], fill=INK, width=iw)

    d.line([hip, neck], fill=INK, width=iw)
    shoulder = polar(hip, -math.pi / 2, height * 0.27)
    d.line(
        [(shoulder[0] - height * 0.07, shoulder[1]), (shoulder[0] + height * 0.07, shoulder[1])],
        fill=ACCENT,
        width=max(3, int(iw * 1.15)),
    )

    d.ellipse([head[0] - head_r, head[1] - head_r, head[0] + head_r, head[1] + head_r],
              outline=INK, width=iw)
    look = 1 if target[0] > head[0] else -1
    for ex in (-0.32, 0.32):
        x = head[0] + head_r * (ex + look * 0.14)
        y = head[1] - head_r * 0.12
        d.ellipse([x - head_r * 0.07, y - head_r * 0.09, x + head_r * 0.07, y + head_r * 0.09], fill=INK)
    d.arc([head[0] - head_r * 0.36, head[1] - head_r * 0.04, head[0] + head_r * 0.36, head[1] + head_r * 0.46],
          25, 155, fill=INK, width=max(2, int(iw * 0.7)))

    back = polar(shoulder, math.pi / 2 + 0.6 + 0.05 * step, height * 0.17)
    back2 = polar(back, math.pi / 2 + 0.2, height * 0.15)
    d.line([shoulder, back, back2], fill=INK, width=iw, joint="curve")

    angle = math.atan2(target[1] - shoulder[1], target[0] - shoulder[0])
    lateral = 1 if target[0] > neck[0] else -1
    elbow = polar(shoulder, angle + 0.3 * lateral, height * 0.19)
    hand = polar(elbow, angle + 0.05 * lateral + 0.1 * math.sin(t * math.pi * 2), height * 0.17)
    d.line([shoulder, elbow, hand], fill=INK, width=iw, joint="curve")
    d.ellipse([hand[0] - iw * 1.15, hand[1] - iw * 1.15, hand[0] + iw * 1.15, hand[1] + iw * 1.15], fill=ACCENT)


def scene(d, W, H, t, spec, u):
    landscape = W > H * 1.05
    pad = min(W, H) * 0.06
    concept = str(spec.get("concept") or "").strip()
    caption = str(spec.get("caption") or "").strip()

    head_size = int((H * 0.085) if landscape else (W * 0.078))
    head_size = max(18, min(head_size, int(min(W, H) * 0.17)))
    head_font = bold(head_size)
    maxw = (W * 0.9) if landscape else (W * 0.86)
    x = pad * 0.88
    y = pad * 0.6
    for line in wrap(d, concept, head_font, maxw, 3):
        d.text((x, y), line, font=head_font, fill=INK)
        y += head_size * 1.14
    d.rectangle(
        [x, y + head_size * 0.1, x + min(maxw, head_size * 4), y + head_size * 0.1 + max(4, u * 7)],
        fill=ACCENT,
    )
    y += head_size * 0.6

    if caption:
        cap_size = max(13, int(head_size * 0.42))
        cap_font = body_font(cap_size)
        for line in wrap(d, caption, cap_font, maxw * 0.94, 2):
            d.text((x, y), line, font=cap_font, fill=MUTED)
            y += int(cap_size * 1.4)

    if landscape:
        ground = H - pad * 0.6
        fh = H * 0.42
        fx = pad * 0.9 + fh * 0.55
        pcx, pcy, ps = W * 0.68, H * 0.63, min(W, H) * 0.33
    else:
        ground = H - pad * 0.5
        fh = H * 0.34
        fx = W * 0.25
        pcx, pcy, ps = W * 0.63, H * 0.52, W * 0.36

    target = (pcx - ps * 0.62, pcy)
    PROPS.get(str(spec.get("metaphor") or "").lower(), prop_bulb)(d, pcx, pcy, ps, t, u)
    draw_figure(d, fx, ground, fh, t, target, u)

    brand = body_font(max(12, int(min(W, H) * 0.022)))
    d.text((W - pad * 0.85, H - pad * 0.42), "NACHO WEB3", font=brand, fill=MUTED, anchor="rs")


def main():
    spec_path = sys.argv[1]
    with open(spec_path, "r", encoding="utf-8") as handle:
        spec = json.load(handle)

    w = int(spec["width"])
    h = int(spec["height"])
    fps = int(spec.get("fps", 30))
    duration = float(spec.get("duration", 3.6))
    frames = max(1, int(round(duration * fps)))
    out_dir = spec["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        if name.startswith("frame-"):
            os.remove(os.path.join(out_dir, name))

    supersample = min(2.0, math.sqrt(3_600_000 / max(1, w * h)))
    scale = max(1.0, math.floor(supersample * 20) / 20)
    W, H = int(w * scale), int(h * scale)
    u = max(2, int(min(W, H) / 1000.0 * 8))

    for index in range(frames):
        t = (index + 1) / frames
        image = Image.new("RGB", (W, H), PAPER)
        draw = ImageDraw.Draw(image)
        scene(draw, W, H, t, spec, u)
        image.resize((w, h), Image.LANCZOS).save(os.path.join(out_dir, "frame-%04d.png" % (index + 1)))

    print(json.dumps({"frames": frames}))


if __name__ == "__main__":
    main()
