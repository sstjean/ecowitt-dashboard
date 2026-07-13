#!/usr/bin/env python3
"""Generate the ecowitt weather dashboard PWA / home-screen icons.

Clawpilot dark design language: a warm dark-grey field (``#3d3b3a``, the app
background) with a bold coral (``#fd8ea1``, the app accent) sun mark. Fills are
flat (no gradients, no anti-aliasing) so the palette is pixel-exact and the
icons are full-bleed / opaque -- iOS "Add to Home Screen" masks its own rounded
corners, so any transparency would show through as black.

This is a build-time edge asset: it is run once by a human and its outputs are
committed under ``apps/web/public/`` so the container build never needs Pillow.

Outputs (into ../public):
  - icon-512.png            512x512  standard
  - icon-192.png            192x192  standard
  - icon-512-maskable.png   512x512  glyph shrunk into the maskable safe zone
  - apple-touch-icon.png    180x180  iOS home-screen icon
  - favicon.ico             multi-size browser-tab icon

Run: ``python scripts/make-icons.py`` from ``apps/web``.
"""
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
S = 512

# Clawpilot palette (from apps/web/src/styles.css :root)
FIELD = (61, 59, 58)     # --cp-bg      #3d3b3a
CORAL = (253, 142, 161)  # --cp-accent  #fd8ea1


def draw_sun(size: int, scale: float) -> Image.Image:
    """A flat coral sun centred on a full-bleed dark field.

    ``scale`` in (0, 1] sets how much of the half-canvas the sun + rays occupy;
    a smaller scale keeps the maskable variant inside the safe zone.
    """
    img = Image.new("RGB", (size, size), FIELD)
    draw = ImageDraw.Draw(img)
    cx = cy = size / 2
    reach = (size / 2) * scale       # outer tip of the rays
    core_r = reach * 0.5             # sun-disk radius
    ray_inner = core_r * 1.20        # rays start just outside the disk
    ray_w = max(2, int(round(core_r * 0.34)))

    # eight rays with rounded caps
    for i in range(8):
        angle = math.pi / 4 * i
        x1 = cx + math.cos(angle) * ray_inner
        y1 = cy + math.sin(angle) * ray_inner
        x2 = cx + math.cos(angle) * reach
        y2 = cy + math.sin(angle) * reach
        draw.line([(x1, y1), (x2, y2)], fill=CORAL, width=ray_w)
        cap = ray_w / 2
        draw.ellipse([x2 - cap, y2 - cap, x2 + cap, y2 + cap], fill=CORAL)

    # sun disk
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=CORAL)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    base = draw_sun(S, 0.82)
    base.save(os.path.join(OUT, "icon-512.png"))
    base.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))
    base.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))

    # maskable: shrink the glyph so it survives a ~40% mask inset without clipping
    draw_sun(S, 0.56).save(os.path.join(OUT, "icon-512-maskable.png"))

    base.resize((64, 64), Image.LANCZOS).save(
        os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )

    print(
        "wrote icon-512.png, icon-192.png, icon-512-maskable.png, "
        "apple-touch-icon.png, favicon.ico to", os.path.normpath(OUT),
    )


if __name__ == "__main__":
    main()
