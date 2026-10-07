#!/usr/bin/env python3
"""Regenerate every AmpliFood icon, splash, favicon and in-app logo image.

Inputs are the owner's 1254x1254 logos in assets/brand/source/. Run from the
repo root after replacing either source logo:

    pip install pillow numpy
    python3 scripts/generate-brand-assets.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand" / "source"
ASSETS = ROOT / "assets"
BRAND = ASSETS / "brand"
PUBLIC = ROOT / "public"

# Background of the colour logo; icon and splash backgrounds use it so the
# artwork never sits on a visible seam.
LOGO_CREAM = (254, 252, 247)
CREAM = (255, 248, 236)
INK = (42, 20, 36)


def load(name):
    return np.array(Image.open(SRC / name).convert("RGB")).astype(np.int16)


def grow(seed, allowed, connectivity=8):
    """Flood `seed` through `allowed` pixels (binary dilation until stable)."""
    reach = seed & allowed
    while True:
        nxt = reach.copy()
        nxt[1:] |= reach[:-1]
        nxt[:-1] |= reach[1:]
        nxt[:, 1:] |= reach[:, :-1]
        nxt[:, :-1] |= reach[:, 1:]
        if connectivity == 8:
            nxt[1:, 1:] |= reach[:-1, :-1]
            nxt[:-1, :-1] |= reach[1:, 1:]
            nxt[1:, :-1] |= reach[:-1, 1:]
            nxt[:-1, 1:] |= reach[1:, :-1]
        nxt &= allowed
        if (nxt == reach).all():
            return reach
        reach = nxt


def bbox(mask, pad=0):
    ys, xs = np.where(mask)
    h, w = mask.shape
    return (
        max(xs.min() - pad, 0),
        max(ys.min() - pad, 0),
        min(xs.max() + 1 + pad, w),
        min(ys.max() + 1 + pad, h),
    )


def cutout_colour(rgb, rows, keep_inner=True):
    """Colour artwork in `rows` with the cream background made transparent.

    With `keep_inner`, only background connected to the crop edge is removed so
    the cream details inside the guitar (pickups, strings, highlights) stay
    opaque. Lettering has no such details, so its counters are cleared too.
    """
    region = rgb[rows[0]:rows[1]]
    dist = np.abs(region - np.array(LOGO_CREAM)).sum(axis=2)
    near_bg = dist < 90
    border = np.zeros_like(near_bg)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    outside = grow(border, near_bg, connectivity=4) if keep_inner else near_bg
    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    img = Image.fromarray(region.astype(np.uint8)).convert("RGBA")
    img.putalpha(alpha)
    return img.crop(bbox(~outside, pad=4))


def fit(img, size, scale, bg=None):
    """Centre `img` on a `size` square so its longest side is `scale` of the canvas."""
    canvas = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    target = int(size * scale)
    ratio = target / max(img.size)
    resized = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def save(img, path, opaque=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert("RGB") if opaque else img).save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")


def scale_to_height(img, height):
    return img.resize((round(img.width * height / img.height), height), Image.LANCZOS)


def main():
    colour = load("logo-color.png")
    bw = load("logo-bw.png")

    # Colour logo: the guitar mark and the wordmark are separated by an empty band.
    dist = np.abs(colour - np.array(LOGO_CREAM)).sum(axis=2)
    rows = np.where((dist > 60).sum(axis=1) > 0)[0]
    gap = np.where(np.diff(rows) > 1)[0][0]
    mark_rows = (rows[0] - 6, rows[gap] + 7)
    word_rows = (rows[gap + 1] - 6, rows[-1] + 7)

    mark = cutout_colour(colour, mark_rows)
    word = cutout_colour(colour, word_rows, keep_inner=False)
    full = cutout_colour(colour, (mark_rows[0], word_rows[1]))

    # Black-and-white logo: the guitar overlaps the wordmark ascenders
    # vertically, so pick the ink that is connected to the upper half.
    lum = bw.mean(axis=2)
    ink = lum < 150
    seed = np.zeros_like(ink)
    seed[: int(ink.shape[0] * 0.7)] = True
    bw_mark_mask = grow(seed & ink, ink)
    alpha = np.clip((215 - lum) / (215 - 70), 0, 1)
    alpha = np.where(grow(bw_mark_mask, lum < 200), alpha, 0)
    stamp = np.zeros(bw.shape[:2] + (4,), dtype=np.uint8)
    stamp[..., :3] = (12, 10, 11)
    stamp[..., 3] = (alpha * 255).astype(np.uint8)
    stamp = Image.fromarray(stamp, "RGBA").crop(bbox(bw_mark_mask, pad=6))

    # Dark-mode wordmark: the plum-black "Ampli" turns cream, the coloured
    # "Food" letters stay as they are.
    w = np.array(word).astype(np.int16)
    dark = (w[..., :3].max(axis=2) < 110) & (w[..., 3] > 0)
    w_dark = w.copy()
    w_dark[dark, 0], w_dark[dark, 1], w_dark[dark, 2] = CREAM
    word_dark = Image.fromarray(w_dark.astype(np.uint8), "RGBA")

    # App icon, Android adaptive foreground, splash, favicons.
    save(fit(mark, 1024, 0.78, LOGO_CREAM), ASSETS / "icon.png", opaque=True)
    # Android masks the adaptive icon to the inner ~66%, so the mark stays inside it.
    save(fit(mark, 1024, 0.58, LOGO_CREAM), ASSETS / "adaptive-icon.png", opaque=True)
    save(fit(full, 1024, 0.92), ASSETS / "splash-icon.png")
    save(fit(mark, 48, 0.96), ASSETS / "favicon.png")
    save(fit(mark, 192, 0.8, LOGO_CREAM), PUBLIC / "icon-192.png", opaque=True)
    save(fit(mark, 512, 0.8, LOGO_CREAM), PUBLIC / "icon-512.png", opaque=True)
    save(fit(mark, 512, 0.62, LOGO_CREAM), PUBLIC / "icon-maskable-512.png", opaque=True)
    save(fit(mark, 180, 0.8, LOGO_CREAM), PUBLIC / "apple-touch-icon.png", opaque=True)

    # In-app artwork (3x for retina).
    save(scale_to_height(word, 108), BRAND / "wordmark.png")
    save(scale_to_height(word_dark, 108), BRAND / "wordmark-dark.png")
    save(scale_to_height(mark, 480), BRAND / "mark-color.png")
    save(scale_to_height(stamp, 240), BRAND / "mark-ink.png")


if __name__ == "__main__":
    main()
