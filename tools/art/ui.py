"""Habillage des menus : fond de menu, cadres ornés, planche d'en-tête, socles et icônes de stats.

Tout est déterministe (graines fixes). Usage : python3 tools/art/ui.py /tmp/ui.png pour une planche.
"""
import math
import random
import sys

import numpy as np
from PIL import Image

import pal
from backgrounds import Canvas, H, W
from pix import BAYER, Sprite, hexc, upscale


# ---------------------------------------------------------------------------------------
# Fond de menu 320 × 180 : nuit de désert vue de loin, contrasté faiblement pour rester lisible
# sous les panneaux.
# ---------------------------------------------------------------------------------------
def menu_backdrop():
    c = Canvas()
    c.bands([(0, '#07050a'), (60, '#0d0914'), (110, '#15101c'), (150, '#1a1420'), (180, '#120d16')])
    rnd = random.Random(9)
    # étoiles rares et ternes
    for _ in range(70):
        x, y = rnd.randrange(W), rnd.randrange(0, 95)
        c.put(x, y, '#3a3146' if rnd.random() < 0.7 else '#5a4e66')
    # lune voilée
    c.disc(252, 40, [(0, 9, '#4a3f52', None), (9, 14, '#2a2234', 0.5), (14, 24, '#1c1626', 0.3)])
    # mesas lointaines, trois plans
    c.ridge(120, 26, '#120d18', seed=31, step=22, flat=0.6, top='#1c1624')
    c.ridge(132, 18, '#0e0a12', seed=32, step=16, flat=0.5, top='#17121d')
    c.ridge(146, 10, '#0a070d', seed=33, step=10, flat=0.3)
    # sol : bandes tramées, un peu de broussaille sombre
    for y in range(150, H):
        for x in range(W):
            t = (y - 150) / 30
            c.put(x, y, '#0b080e' if c.dith(x, y, t) else '#110d15')
    for _ in range(40):
        x, y = rnd.randrange(W), rnd.randrange(150, H - 2)
        for dy in range(rnd.randint(1, 3)):
            c.put(x, y - dy, '#1a1420')
    return Image.fromarray(c.a, 'RGB')


# ---------------------------------------------------------------------------------------
# Cadres 9 tranches
# ---------------------------------------------------------------------------------------
def ornate_frame(size=24, slice_=8, wood=pal.BARK, stud=pal.GOLD, fill='#1a1420', rivets=True):
    """Cadre bois clouté : planche biseautée, clous dorés aux coins, intérieur uni."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = im.load()
    s = slice_
    for y in range(size):
        for x in range(size):
            d = min(x, y, size - 1 - x, size - 1 - y)  # distance au bord
            if d >= s:
                col = hexc(fill)
            elif d == 0:
                col = hexc('#07050a')
            elif d == 1:
                col = hexc(wood[4])
            elif d in (2, 3, 4):
                # fil du bois : lignes irrégulières le long du bord
                along = x if y < size - 1 - y and y <= x and y <= size - 1 - x or (size - 1 - y) < min(x, size - 1 - x) else y
                grain = ((along * 5 + d * 7) // 4) % 4 == 0
                col = hexc(wood[1]) if grain else hexc(wood[3] if d == 2 else wood[2])
            elif d == 5:
                col = hexc(wood[0])
            elif d == 6:
                col = hexc('#07050a')
            else:  # d == 7 : liseré intérieur clair
                col = hexc('#2a2234')
            px[x, y] = (*col, 255)
    if rivets:
        for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4), (size - 4, size - 4)):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if abs(dx) + abs(dy) <= 1:
                        px[cx + dx, cy + dy] = (*hexc(stud[3]), 255)
            px[cx - 1, cy - 1] = (*hexc(stud[4]), 255)
            px[cx + 1, cy + 1] = (*hexc(stud[1]), 255)
    return im


def gold_frame():
    return ornate_frame(wood=['#3a2208', '#6e4612', '#8a5c18', '#b07a20', '#e2b440'],
                        stud=['#3a2208', '#6e4612', '#b07a20', '#fbe58a', '#ffffff'],
                        fill='#2a1f10')


# ---------------------------------------------------------------------------------------
# Tuiles : planche d'en-tête, corde de séparation, cuir de fond de carte
# ---------------------------------------------------------------------------------------
def plank_tile():
    """Planche horizontale 48 × 56 : fil du bois, deux clous, bord ombré en bas."""
    w, h = 48, 56
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = im.load()
    rnd = random.Random(4)
    for y in range(h):
        base = pal.BARK[1] if y % 9 in (0, 4) else pal.BARK[2]
        for x in range(w):
            col = base
            wob = int(2 * math.sin((x + y * 0.3) / 6))
            if (y + wob) % 9 == 0:
                col = pal.BARK[0]
            elif (y + wob) % 9 == 5 and rnd.random() < 0.6:
                col = pal.BARK[3]
            if y >= h - 3:
                col = '#07050a' if y == h - 1 else pal.BARK[0]
            if y == 0:
                col = pal.BARK[3]
            px[x, y] = (*hexc(col), 255)
    for cx in (6, w - 7):
        for cy in (10, h - 12):
            px[cx, cy] = (*hexc(pal.METAL[3]), 255)
            px[cx + 1, cy] = (*hexc(pal.METAL[2]), 255)
            px[cx, cy + 1] = (*hexc(pal.METAL[1]), 255)
            px[cx - 1, cy] = (*hexc(pal.METAL[4]), 255)
    return im


def rope_tile():
    """Corde torsadée 12 × 6, à répéter horizontalement."""
    im = Image.new('RGBA', (12, 6), (0, 0, 0, 0))
    px = im.load()
    for x in range(12):
        for y in range(1, 5):
            t = ((x + y * 2) // 3) % 2
            px[x, y] = (*hexc(pal.SAND[2 + t]), 255)
        px[x, 0] = (*hexc(pal.SAND[0]), 255)
        px[x, 5] = (*hexc('#07050a'), 255)
    return im


def leather_tile():
    """Cuir sombre 32 × 32 tramé, pour le fond des panneaux."""
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    rnd = random.Random(11)
    for y in range(32):
        for x in range(32):
            n = rnd.random()
            col = '#1a1420' if n < 0.78 else ('#1f1826' if n < 0.95 else '#140f1a')
            px[x, y] = (*hexc(col), 255)
    return im


# ---------------------------------------------------------------------------------------
# Socle de pierre sous un héros (72 × 18), en deux teintes : pierre et pierre dorée (sélection)
# ---------------------------------------------------------------------------------------
def pedestal(gold=False):
    s = Sprite(72, 18)
    ramp = pal.GOLD if gold else pal.STONE
    s.ell((2, 2, 70, 15), ramp)
    s.ell((6, 4, 66, 11), [ramp[1], ramp[2], ramp[3], ramp[4], ramp[4]])
    s.rect((2, 9, 70, 16), ramp, clip=[1])
    return s.render(light=(0, -1))


# ---------------------------------------------------------------------------------------
# Icônes de statistiques 12 × 12 (masques blancs) : PV, VIT ; ATK et DEF existent déjà
# ---------------------------------------------------------------------------------------
STAT_ICONS = {
    'hp': [  # cœur
        '............', '..###..###..', '.#####.####.', '############', '############',
        '############', '.##########.', '..########..', '...######...', '....####....',
        '.....##.....', '............'],
    'spd': [  # botte ailée / chevron double
        '............', '.##....##...', '..##....##..', '...##....##.', '....##....##',
        '....##....##', '...##....##.', '..##....##..', '.##....##...', '............',
        '............', '............'],
    'xp': [  # étoile à quatre branches
        '.....##.....', '.....##.....', '....####....', '....####....', '.##########.',
        '############', '.##########.', '....####....', '....####....', '.....##.....',
        '.....##.....', '............'],
    'star': [
        '.....##.....', '.....##.....', '....####....', '############', '.##########.',
        '..########..', '..########..', '.###....###.', '.##......##.', '............',
        '............', '............'],
}


def stat_icon(name):
    rows = STAT_ICONS[name]
    im = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '#':
                im.putpixel((x, y), (255, 255, 255, 255))
    return im


def all_ui():
    """Sprites à ranger dans l'atlas."""
    out = {'pedestal': [pedestal()], 'pedestal_gold': [pedestal(True)]}
    out.update({f'icon_{k}': [stat_icon(k)] for k in STAT_ICONS})
    return out


FILES = {
    'frame_wood': ornate_frame,
    'frame_gold': gold_frame,
    'plank': plank_tile,
    'rope': rope_tile,
    'leather': leather_tile,
}


if __name__ == '__main__':
    sheet = Image.new('RGBA', (640, 420), (20, 16, 26, 255))
    sheet.alpha_composite(menu_backdrop().convert('RGBA'), (0, 0))
    x = 0
    for name, fn in FILES.items():
        im = upscale(fn(), 3)
        sheet.alpha_composite(im, (x, 190))
        x += im.width + 8
    sheet.alpha_composite(upscale(pedestal(), 3), (0, 360))
    sheet.alpha_composite(upscale(pedestal(True), 3), (230, 360))
    sheet.save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ui.png')
