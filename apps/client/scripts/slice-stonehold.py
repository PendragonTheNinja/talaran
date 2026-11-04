"""
Cut the Stonehold theme's pieces from Nathan's mockup art (public/images/ui/).

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

SRC = Path('public/images/ui')
OUT = SRC / 'stonehold'
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


main = Image.open(SRC / 'Main Content Background.jpg').convert('RGB')
side = Image.open(SRC / 'right side of screen.jpg').convert('RGB')
left = Image.open(SRC / 'inventory and paper doll.jpg').convert('RGB')
chat = Image.open(SRC / 'ChatBackground.jpg').convert('RGB')
menu = Image.open(SRC / 'MenuBackground.jpg').convert('RGB')
grid = Image.open(SRC / 'testscrollingbackground2.jpg').convert('RGB')

# Gold filigree frame (the scene). Slice 34: the corner knots.
save(main.crop((0, 0, 1079, 550)), 'frame-gold.webp', 88)
# The same frame over stone, for the column beside the scene: the right-hand
# box of the art, with the gold divider across its middle cut out (an edge
# slice would smear it down the whole side).
gs = main.crop((1077, 0, 1278, 550))
gold_stone = Image.new('RGB', (201, 505))
gold_stone.paste(gs.crop((0, 0, 201, 300)), (0, 0))
gold_stone.paste(gs.crop((0, 345, 201, 550)), (0, 300))
save(gold_stone, 'frame-gold-stone.webp', 88)
# The red ground inside it, used as a cover fill.
save(main.crop((12, 12, 1066, 538)), 'red.webp', 80)

# Rope-and-stone frame (side panels): the top box of the right column, rope on
# all four sides. Slice 20.
save(side.crop((0, 0, 310, 346)), 'frame-stone.webp', 88)
# Dark stone ground, mirrored into a seamless tile.
save(mirror_tile(side.crop((24, 530, 286, 880))), 'stone.webp', 78)

# Chat and menu bars: bevelled dark frames, used with their own fill.
save(chat, 'frame-chat.webp', 84)    # slice 12
save(menu, 'frame-menu.webp', 84)    # slice 10

# One inventory cell, bevel and all.
save(grid.crop((0, 0, 64, 64)), 'slot.webp', 88)

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

# The health and Talar orbs with their stone mount (transparent around).
orbs = Image.open(SRC / 'HealthManaPanels.png').convert('RGBA')
save(orbs, 'orbs.webp', 90)
