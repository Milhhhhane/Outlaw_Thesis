"""Exporte l'atlas des sprites, les décors et les cadres d'interface vers apps/web/src/art.

Usage : python3 tools/art/export.py   (Pillow et NumPy requis ; résultat déterministe)
"""
import json
import pathlib

from PIL import Image

import backgrounds
import fx
import icons
import pack as charpack
import ui

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps' / 'web' / 'src' / 'art'


def frames():
    out = dict(charpack.all_characters())
    out.update(charpack.all_chests())
    out.update(fx.all_fx())
    out.update(icons.all_icons())
    out.update(ui.all_ui())
    return out


def pack(groups, width=1024):
    """Rangement en étagères ; renvoie l'image et les positions de chaque image."""
    items = [(name, i, im) for name, ims in groups.items() for i, im in enumerate(ims)]
    items.sort(key=lambda t: (-t[2].height, t[0], t[1]))
    x = y = shelf = 0
    pos = {}
    for name, i, im in items:
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[(name, i)] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    atlas = Image.new('RGBA', (width, y + shelf), (0, 0, 0, 0))
    for name, i, im in items:
        atlas.alpha_composite(im, pos[(name, i)])
    return atlas, pos


def frame_png(fill, light, dark, edge, accent):
    """Cadre 9 tranches 12×12 (tranche de 4) : bord sombre, biseau clair, coins dorés."""
    im = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    from pix import hexc
    for y in range(12):
        for x in range(12):
            outer = x in (0, 11) or y in (0, 11)
            corner = (x in (0, 11)) and (y in (0, 11))
            if corner:
                continue
            if outer:
                c = edge
            elif x == 1 or y == 1:
                c = light
            elif x == 10 or y == 10:
                c = dark
            else:
                c = fill
            im.putpixel((x, y), (*hexc(c), 255))
    for x, y in ((1, 1), (10, 1), (1, 10), (10, 10)):
        im.putpixel((x, y), (*hexc(accent), 255))
    return im


def app_icons():
    """Icônes d'installation : Pyra au chapeau sur fond de crépuscule (fond plein, sans transparence)."""
    out = ROOT / 'apps' / 'web' / 'public' / 'icons'
    out.mkdir(parents=True, exist_ok=True)
    pyra = charpack.all_characters()['pyra'][0]
    tile = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
    sky = backgrounds.ember_wastes().crop((200, 80, 248, 128)).convert('RGBA')
    tile.alpha_composite(sky)
    tile.alpha_composite(pyra, ((48 - pyra.width) // 2, 48 - pyra.height))
    for size in (180, 192, 512):
        tile.resize((size, size), Image.NEAREST).convert('RGB').save(out / f'icon-{size}.png', optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'bg').mkdir(exist_ok=True)
    groups = frames()
    atlas, pos = pack(groups)
    atlas.save(OUT / 'atlas.png', optimize=True)
    sprites = {}
    for name, ims in groups.items():
        im = ims[0]
        bbox = im.getbbox() or (0, 0, im.width, im.height)
        sprites[name] = {
            'w': im.width, 'h': im.height,
            'top': bbox[1], 'bottom': bbox[3],
            'frames': [list(pos[(name, i)]) for i in range(len(ims))],
        }
    for name, fn in backgrounds.ALL.items():
        fn().save(OUT / 'bg' / f'{name}.png', optimize=True)
    frame_png('#221b2a', '#5a4664', '#120c16', '#07050a', '#b07a20').save(OUT / 'panel.png', optimize=True)
    ui.menu_backdrop().save(OUT / 'bg' / 'menu.png', optimize=True)
    for name, fn in ui.FILES.items():
        fn().save(OUT / f'{name}.png', optimize=True)
    frame_png('#3a2a20', '#d4a640', '#5a3410', '#07050a', '#fbe58a').save(OUT / 'button.png', optimize=True)
    body = json.dumps(sprites, separators=(',', ':'), sort_keys=True)
    (OUT / 'sprites.ts').write_text(
        '// Fichier généré par tools/art/export.py : ne pas modifier à la main.\n'
        'import type { SpriteMap } from \'./types\';\n\n'
        f'export const SPRITES: SpriteMap = {body};\n'
        f'export const ATLAS_SIZE = {{ w: {atlas.width}, h: {atlas.height} }};\n'
        f'export const GLYPHS = {json.dumps(fx.GLYPHS)};\n'
        f'export const GROUND_Y = {backgrounds.GROUND};\n'
        f'export const MAP_NODES: Readonly<Record<string, readonly [number, number]>> = '
        f'{(pathlib.Path(__file__).with_name("map_nodes.json")).read_text().strip()};\n',
        encoding='utf-8')
    app_icons()
    print('atlas', atlas.size, 'sprites', len(sprites))


if __name__ == '__main__':
    main()
