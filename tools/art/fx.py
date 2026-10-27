"""Effets (impacts, projectiles, auras) et chiffres en police pixel 3×5."""
import math
import random

from PIL import Image

from pal import FIRE, WATER, LEAF, POISON, GOLD, FOAM
from pix import hexc

ELEMENT = {
    'fire': ['#6a140a', '#c0301a', '#f06a24', '#ffb840', '#fff2b8'],
    'water': ['#0e3466', '#1a5c9a', '#3a90cc', '#8cd0f0', '#e8fbff'],
    'nature': ['#16361a', '#265422', '#43782c', '#8ad84a', '#e0ffa0'],
}


def canvas(w=32, h=32):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def put(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((int(x), int(y)), (*hexc(c), 255))


def burst(ramp, frame, seed, shards=14):
    """Impact : éclat central puis particules qui s'écartent et refroidissent."""
    im = canvas()
    rnd = random.Random(seed)
    cx = cy = 16
    if frame == 0:
        for y in range(32):
            for x in range(32):
                d = math.hypot(x - cx, y - cy)
                if d < 4:
                    put(im, x, y, ramp[4])
                elif d < 6:
                    put(im, x, y, ramp[3])
                elif d < 7 and (x + y) % 2:
                    put(im, x, y, ramp[2])
    for i in range(shards):
        a = i / shards * math.tau + rnd.random() * 0.4
        speed = 0.7 + rnd.random() * 0.6
        r = (3 + frame * 4.2) * speed
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8
        tone = max(0, 4 - frame - (i % 2))
        put(im, x, y, ramp[tone])
        if frame < 3:
            put(im, x - math.cos(a), y - math.sin(a) * 0.8, ramp[max(0, tone - 1)])
    if 0 < frame < 3:  # anneau
        for k in range(48):
            a = k / 48 * math.tau
            r = 4 + frame * 3
            if k % (frame + 1) == 0:
                put(im, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8, ramp[3 - frame])
    return im


def rising(ramp, frame, seed, glyph):
    """Soin, renforcement, affaiblissement : signes qui montent et s'éteignent."""
    im = canvas()
    rnd = random.Random(seed)
    for i in range(6):
        x = 6 + rnd.randint(0, 20)
        y0 = 26 - rnd.randint(0, 8)
        y = y0 - frame * 4 - i % 3
        tone = max(0, 4 - frame - i % 2)
        for dx, dy in glyph:
            put(im, x + dx, y + dy, ramp[tone])
    return im


PLUS = [(0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)]
UP = [(0, -1), (-1, 0), (0, 0), (1, 0), (0, 1), (0, 2)]
DOWN = [(0, -2), (0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)]


def shield(frame):
    im = canvas()
    ramp = ELEMENT['water']
    r = [8, 12, 13, 13][frame]
    for y in range(32):
        for x in range(32):
            d = math.hypot((x - 16) / 1.0, (y - 16) / 1.15)
            if r - 1 <= d < r:
                put(im, x, y, ramp[4 if (x + y + frame) % 5 == 0 else 3])
            elif d < r - 1 and (x * 3 + y * 5 + frame) % 9 == 0 and frame > 0:
                put(im, x, y, ramp[2])
    return im


def stun(frame):
    im = canvas()
    for i in range(3):
        a = frame / 4 * math.tau + i / 3 * math.tau
        x, y = 16 + math.cos(a) * 9, 10 + math.sin(a) * 3
        for dx, dy in PLUS:
            put(im, x + dx, y + dy, '#fbe58a' if (dx, dy) == (0, 0) else '#e2b440')
    return im


def burn(frame):
    im = canvas()
    rnd = random.Random(frame)
    for i in range(7):
        x = 8 + rnd.randint(0, 16)
        y = 26 - rnd.randint(0, 10)
        for k in range(3):
            put(im, x, y - k, FIRE[max(0, 4 - k - (i % 2))])
    return im


def mark(frame):
    """Cible : viseur qui se resserre."""
    im = canvas()
    r = [12, 10, 9, 9][frame]
    col = '#f07090'
    for k in range(-3, 4):
        for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            pass
    for a in range(0, 360, 6):
        if (a // 30) % 3 != 1:
            x = 16 + math.cos(math.radians(a)) * r
            y = 16 + math.sin(math.radians(a)) * r
            put(im, x, y, col)
    for d in range(2, 5):
        put(im, 16, 16 - r - 1 + d, '#ffd0dc')
        put(im, 16, 16 + r + 1 - d, '#ffd0dc')
        put(im, 16 - r - 1 + d, 16, '#ffd0dc')
        put(im, 16 + r + 1 - d, 16, '#ffd0dc')
    return im


def projectile(ramp, frame, kind):
    im = canvas(16, 16)
    if kind == 'thorn':
        for i in range(10):
            put(im, 3 + i, 8 + (1 if i % 3 == 0 else 0) * (frame * 2 - 1), ramp[2 + (i > 6)])
        put(im, 13, 8, ramp[4])
        put(im, 6, 7, ramp[3])
        put(im, 9, 9, ramp[3])
        return im
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 10, y - 8)
            tail = (x < 10) and abs(y - 8) <= (x - 2) * 0.35 and (x + y + frame) % 2 == 0
            if d < 2:
                put(im, x, y, ramp[4])
            elif d < 3.4:
                put(im, x, y, ramp[3])
            elif d < 4.5:
                put(im, x, y, ramp[2])
            elif tail and x > 2:
                put(im, x, y, ramp[1 + (x > 6)])
    return im


def aura(ramp, frame):
    im = canvas(48, 12)
    for y in range(12):
        for x in range(48):
            d = math.hypot((x - 24) / 22, (y - 6) / 5)
            if 0.82 <= d < 1.0 and (x + frame) % 3:
                put(im, x, y, ramp[3 if (x // 3 + frame) % 2 else 2])
            elif d < 0.82 and (x * 7 + y * 3 + frame * 5) % 13 == 0:
                put(im, x, y, ramp[4])
    return im


# --- police 3×5 ------------------------------------------------------------------------------
FONT = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
    '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
    '<': ['001', '010', '100', '010', '001'], '>': ['100', '010', '001', '010', '100'],
}
GLYPHS = '0123456789+-<>'
TONES = {'damage': ('#fff2e0', '#ff9a6a'), 'heal': ('#e8ffd0', '#8ad84a'),
         'shield': ('#e8fbff', '#6ac0f0'), 'tempo': ('#fff6c8', '#e2b440'), 'status': ('#f6e0ff', '#c890f0')}


def glyph(ch, tone):
    """Glyphe 5×7 : 3×5 + contour sombre ; le bas du glyphe prend la couleur secondaire."""
    top, bottom = TONES[tone]
    im = canvas(5, 7)
    rows = FONT[ch]
    on = {(x + 1, y + 1) for y, row in enumerate(rows) for x, v in enumerate(row) if v == '1'}
    for x, y in on:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (x + dx, y + dy) not in on:
                    put(im, x + dx, y + dy, '#140a10')
    for x, y in on:
        put(im, x, y, top if y <= 3 else bottom)
    return im


def campfire(frame):
    """Feu de camp : bûches croisées, flammes qui dansent, braises."""
    from pix import Sprite
    from pal import BARK, FIRE
    s = Sprite(24, 24)
    s.line([(3, 21), (20, 17)], BARK, width=3)
    s.line([(4, 17), (21, 21)], BARK, width=3)
    lean = (-1, 1)[frame]
    for x, h, l in [(8, 9, lean), (12, 14, -lean), (16, 8, lean)]:
        s.poly([(x - 3, 19), (x - 2 + l, 19 - h // 2), (x + l, 19 - h), (x + 2 + l, 19 - h // 2), (x + 3, 19)], FIRE, glow=2)
    im = s.render()
    put(im, 6 + frame * 9, 2 + frame, '#ffb840')
    put(im, 15 - frame * 6, 4 - frame, '#ffe58a')
    return im


def all_fx():
    out = {}
    for el, ramp in ELEMENT.items():
        out[f'burst_{el}'] = [burst(ramp, f, hash(el) % 97) for f in range(4)]
        kind = {'fire': 'orb', 'water': 'orb', 'nature': 'thorn'}[el]
        out[f'bolt_{el}'] = [projectile(ramp, f, kind) for f in range(2)]
        out[f'aura_{el}'] = [aura(ramp, f) for f in range(2)]
    out['heal'] = [rising(ELEMENT['nature'], f, 5, PLUS) for f in range(4)]
    out['buff'] = [rising(['#3a2208', '#6e4612', '#b07a20', '#e2b440', '#fbe58a'], f, 6, UP) for f in range(4)]
    out['debuff'] = [rising(['#140a1c', '#3c2058', '#5a3478', '#8256a0', '#c8a0f0'], f, 7, DOWN) for f in range(4)]
    out['shield'] = [shield(f) for f in range(4)]
    out['stun'] = [stun(f) for f in range(4)]
    out['burn'] = [burn(f) for f in range(4)]
    out['mark'] = [mark(f) for f in range(4)]
    out['campfire'] = [campfire(f) for f in range(2)]
    for tone in TONES:
        out[f'font_{tone}'] = [glyph(ch, tone) for ch in GLYPHS]
    return out
