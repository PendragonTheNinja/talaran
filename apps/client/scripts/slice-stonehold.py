"""
Cut the Stonehold theme's pieces from Nathan's mockup art (design/stonehold/).

The originals live outside public/ so players never download them (about
2 MB); only the cut pieces below are served.

The art is drawn as whole panels at one size (310 px side columns, a
1278x550 centre). Used as it is, the pictures would decide the layout, which
is what made this look impossible on smaller screens. So it is cut into parts
that fit any box:

  frames   9-slice sources for CSS border-image: corners stay crisp, edges stretch
  tiles    textures mirrored into seamless repeats
  pieces   single images used at their own shape (slot, parchment, button)

Run from apps/client:  python3 scripts/slice-stonehold.py
Writes public/images/ui/stonehold/*.webp. Re-run after changing any source.
"""
from pathlib import Path
from PIL import Image

SRC = Path('design/stonehold')
OUT = Path('public/images/ui/stonehold')
OUT.mkdir(exist_ok=True)


def save(im: Image.Image, name: str, q: int = 82) -> None:
    im.save(OUT / name, 'WEBP', quality=q, method=6)
    print(f'{name:28} {im.size[0]}x{im.size[1]}')


def mirror_tile(im: Image.Image) -> Image.Image:
    """A 2x2 of the image and its mirrors: always seamless when repeated."""
    w, h = im.size
    out = Image.new(im.mode, (w * 2, h * 2))
    out.paste(im, (0, 0))
    out.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    out.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    out.paste(im.transpose(Image.ROTATE_180), (w, h))
    return out


def seamless_stone(im: Image.Image) -> Image.Image:
    import numpy as np
    from PIL import ImageFilter
    a = np.asarray(im, dtype=np.float32)
    blur = np.asarray(im.filter(ImageFilter.GaussianBlur(28)), dtype=np.float32)
    flat = a - blur + a.reshape(-1, 3).mean(axis=0)
    lum = flat.mean(axis=2)
    cap = lum.mean() + 2.2 * lum.std()
    over = np.clip(lum - cap, 0, None)[..., None]
    flat = flat - over * 0.85                      # pull bright flecks back toward the grain
    h, w = lum.shape
    shifted = np.roll(np.roll(flat, h // 2, axis=0), w // 2, axis=1)
    y = np.sin(np.pi * (np.arange(h) + 0.5) / h)[:, None]
    x = np.sin(np.pi * (np.arange(w) + 0.5) / w)[None, :]
    m = np.clip((y * x) * 1.6, 0, 1)[..., None]   # 1 in the middle, 0 at the edges
    out = flat * m + shifted * (1 - m)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def gold_only(im: Image.Image, cut: int, rim: int = 4) -> Image.Image:
    """The gilt frame with everything that is not gilt made transparent.

    The frame's edge slices are as wide as its corner knots (cut px), so they
    carried a band of the red or stone beside the thin gold line, and that
    band smeared into streaks when the panel was taller than the art. With
    only the gold (and, in the corners, the knots' dark outlines) kept, the
    edges hold nothing that can smear, and the panel's own ground shows
    through, at its own scale."""
    import numpy as np
    from PIL import ImageFilter
    a = np.asarray(im.convert('RGB'), dtype=np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h, w = r.shape
    gold = (r > 70) & (g > 50) & (b < r * 0.8) & (g > r * 0.45)
    dark = np.maximum(np.maximum(r, g), b) < 30
    yy, xx = np.mgrid[0:h, 0:w]
    corner = ((xx < cut) | (xx >= w - cut)) & ((yy < cut) | (yy >= h - cut))
    outer = (xx < rim) | (yy < rim) | (xx >= w - rim) | (yy >= h - rim)
    keep = gold | (dark & corner) | outer
    mask = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def tileable_frame(im: Image.Image, cut: int) -> Image.Image:
    """A 9-slice source whose edges repeat without a seam.

    Stretching an edge slice along a panel longer than the art smears its
    texture: the pale flecks of the stone lip become streaks. Repeating it
    instead (border-image-repeat: round) keeps the grain, and pairing each
    edge with its mirror image makes the repeat seamless, since the tile then
    ends exactly as it starts."""
    w, h = im.size
    ew, eh = w - 2 * cut, h - 2 * cut          # edge lengths
    out = Image.new(im.mode, (2 * cut + 2 * ew, 2 * cut + 2 * eh))
    W, H = out.size
    # corners
    out.paste(im.crop((0, 0, cut, cut)), (0, 0))
    out.paste(im.crop((w - cut, 0, w, cut)), (W - cut, 0))
    out.paste(im.crop((0, h - cut, cut, h)), (0, H - cut))
    out.paste(im.crop((w - cut, h - cut, w, h)), (W - cut, H - cut))
    # top and bottom: the edge, then its mirror
    for y0, y1, oy in ((0, cut, 0), (h - cut, h, H - cut)):
        seg = im.crop((cut, y0, w - cut, y1))
        out.paste(seg, (cut, oy))
        out.paste(seg.transpose(Image.FLIP_LEFT_RIGHT), (cut + ew, oy))
    # left and right
    for x0, x1, ox in ((0, cut, 0), (w - cut, w, W - cut)):
        seg = im.crop((x0, cut, x1, h - cut))
        out.paste(seg, (ox, cut))
        out.paste(seg.transpose(Image.FLIP_TOP_BOTTOM), (ox, cut + eh))
    return out


main = Image.open(SRC / 'Main Content Background.jpg').convert('RGB')
side = Image.open(SRC / 'right side of screen.jpg').convert('RGB')
left = Image.open(SRC / 'inventory and paper doll.jpg').convert('RGB')
chat = Image.open(SRC / 'ChatBackground.jpg').convert('RGB')
menu = Image.open(SRC / 'MenuBackground.jpg').convert('RGB')
grid = Image.open(SRC / 'testscrollingbackground2.jpg').convert('RGB')

# Gold filigree frame (the scene). Slice 34: the corner knots.
save(gold_only(main.crop((0, 0, 1079, 550)), 34), 'frame-gold.webp', 90)
# The same frame over stone, for the column beside the scene: the right-hand
# box of the art, with the gold divider across its middle cut out (an edge
# slice would smear it down the whole side).
gs = main.crop((1077, 0, 1278, 550))
gold_stone = Image.new('RGB', (201, 505))
gold_stone.paste(gs.crop((0, 0, 201, 300)), (0, 0))
gold_stone.paste(gs.crop((0, 345, 201, 550)), (0, 300))
save(gold_only(gold_stone, 34), 'frame-gold-stone.webp', 90)
# The red ground inside it, used as a cover fill.
save(main.crop((12, 12, 1066, 538)), 'red.webp', 80)

# Rope-and-stone frame (side panels): the top box of the right column, rope on
# all four sides. Slice 20.
save(tileable_frame(side.crop((0, 0, 310, 346)), 20), 'frame-stone.webp', 88)
# Dark stone ground. A crop mirrored four ways tiled without a seam, but the
# mirroring doubled every pale patch in the crop into a symmetric white
# blotch (Nathan, 2026-11-04). Instead: the broad light and dark is taken out
# (the crop less a heavy blur of itself), the rare bright flecks are clipped,
# and the tile is made seamless by blending it with itself shifted half a
# tile, weighted to the shifted copy at the edges. No symmetry anywhere.
save(seamless_stone(side.crop((24, 530, 286, 880))), 'stone.webp', 80)

# Chat and menu bars: bevelled dark frames, used with their own fill.
save(chat, 'frame-chat.webp', 84)    # slice 12
save(menu, 'frame-menu.webp', 84)    # slice 10

# One inventory cell from the full left-column art, its hairline on all four
# sides (the grid's lines fall every 63.5 px from x 27).
save(left.crop((27, 27, 92, 92)), 'slot.webp', 90)

# Parchment for the paper doll, torn edges included. Slice 26.
save(left.crop((30, 386, 282, 828)), 'parchment.webp', 84)
# Stone bricks closing the foot of the left column.
save(left.crop((12, 828, 298, 1068)), 'bricks.webp', 80)

# The red nav button without its word. 'Clan' is the shortest label; the
# lettering (x 38 to 82) is covered with mirrored copies of the bare texture
# either side of it, so any label can be set on it in live type.
btn = Image.open(SRC / 'MenuClan.png').convert('RGBA')
blank = btn.copy()
# Strips start clear of the corner curls (which reach x 20 and from x 100).
blank.paste(btn.crop((22, 0, 39, 35)).transpose(Image.FLIP_LEFT_RIGHT), (38, 0))
blank.paste(btn.crop((24, 0, 34, 35)), (55, 0))
blank.paste(btn.crop((81, 0, 98, 35)).transpose(Image.FLIP_LEFT_RIGHT), (65, 0))
save(blank, 'button.webp', 90)
# Hover: the same button warmed a little.
from PIL import ImageEnhance
save(ImageEnhance.Brightness(blank).enhance(1.25), 'button-hover.webp', 90)

# The health and Talar orbs. The art has both orbs full in one stone mount
# (310x104, transparent around). Cut into:
#   orb-mount   the mount with both orbs drained to dark glass
#   orb-red, orb-purple   each orb's full glass, a circle, for the liquid
# The game sets the liquid's height from the bottom (the fill element), so the
# orb drains from the top as health or Talar is spent.
from PIL import ImageDraw
orbs = Image.open(SRC / 'HealthManaPanels.png').convert('RGBA')
ORB_D = 86                      # glass diameter
ORB_TOP = 10
ORBS = {'red': 15, 'purple': 206}   # left edge of each glass

def circle_mask(d: int) -> Image.Image:
    m = Image.new('L', (d * 4, d * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    return m.resize((d, d), Image.LANCZOS)

mask = circle_mask(ORB_D)
mount = orbs.copy()
for name, x in ORBS.items():
    box = (x, ORB_TOP, x + ORB_D, ORB_TOP + ORB_D)
    glass = orbs.crop(box)
    full = Image.new('RGBA', (ORB_D, ORB_D), (0, 0, 0, 0))
    full.paste(glass, (0, 0), mask)
    save(full, f'orb-{name}.webp', 90)
    # Empty: the same glass, nearly black and without its colour.
    empty = ImageEnhance.Brightness(ImageEnhance.Color(glass).enhance(0.15)).enhance(0.28)
    mount.paste(empty, box[:2], mask)
save(mount, 'orb-mount.webp', 90)
print(f'orbs: glass {ORB_D}px at top {ORB_TOP}, left {ORBS} of a {orbs.size[0]}x{orbs.size[1]} mount')
