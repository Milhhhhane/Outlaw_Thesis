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


def disk(im, cx, cy, r, c, ry=None):
    ry = r if ry is None else ry
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2 < 1:
                put(im, x, y, c)


def ring(im, cx, cy, rx, ry, c, gap=1):
    for k in range(0, 360, 3):
        if (k // 3) % (gap + 1) == 0:
            a = math.radians(k)
            put(im, cx + math.cos(a) * rx, cy + math.sin(a) * ry, c)


def fire_hit(ramp, frame, seed, size=32):
    """Feu : éclat, langues de flammes qui montent, braises, puis fumée."""
    im = canvas(size, size)
    rnd = random.Random(seed)
    cx, cy = size / 2, size / 2 + size / 8
    s = size / 32
    if frame == 0:
        disk(im, cx, cy, 5 * s, ramp[4], 4 * s)
        disk(im, cx, cy - 2 * s, 3 * s, '#ffffff', 2.5 * s)
    tongues = [(-9, 7), (-4, 12), (0, 15), (4, 11), (9, 8), (-13, 4), (13, 5)]
    for i, (ox, h) in enumerate(tongues):
        if (frame == 0 and i >= 5) or frame == 3:
            continue
        h = h * s * (0.7, 1.0, 1.25, 0.6)[frame]
        lean = (i % 2 * 2 - 1) * frame * 0.5
        base_y = cy + 3 * s - frame * 3 * s
        x = cx + ox * s
        for k in range(int(h)):
            t = k / max(1, h)
            w = max(0, int((1 - t) * 2.5 * s))
            tone = 4 - frame if t < 0.35 else (3 - frame if t < 0.7 else 2 - frame)
            if frame == 3:
                tone = 1 if t < 0.5 else 0
            if tone < 0:
                continue
            if frame == 3 and (k + i) % 2:
                continue
            for dx in range(-w, w + 1):
                put(im, x + dx + lean * t * 4, base_y - k, ramp[max(0, tone)])
    if frame >= 1:  # braises
        for i in range(6 + frame * 2):
            x = cx + rnd.uniform(-10, 10) * s
            y = cy - (4 + frame * 5 + rnd.uniform(0, 6)) * s
            put(im, x, y, ramp[4 if (i + frame) % 3 == 0 else 3])
    if frame == 3:  # fumée
        for i in range(7):
            x = cx + rnd.uniform(-9, 9) * s
            y = cy - 4 * s - rnd.uniform(0, 8) * s
            disk(im, x, y, (2 + i % 2) * s, '#4a3240' if i % 2 else '#2e2030', 1.5 * s)
            put(im, x - 1, y - 1, '#5a4450')
    return im


def water_hit(ramp, frame, seed, size=32):
    """Eau : gerbe en couronne, gouttes qui retombent, rond dans l'eau."""
    im = canvas(size, size)
    rnd = random.Random(seed)
    s = size / 32
    cx, base = size / 2, size / 2 + 8 * s
    if frame <= 1:  # couronne
        disk(im, cx, base - 4 * s, 6 * s, ramp[2 + (1 - frame)], 3 * s)
        if frame == 0:
            disk(im, cx, base - 5 * s, 3.5 * s, ramp[4], 2 * s)
        for i in range(7):
            x = cx + (i - 3) * 3.4 * s
            h = (10 - abs(i - 3) * 2) * s * (1.0, 1.3)[frame]
            for k in range(int(h)):
                tone = 4 if k > h - 3 * s else (3 if (k + i) % 2 else 2)
                put(im, x, base - 3 * s - k, ramp[tone])
            put(im, x, base - 3 * s - h - 1, ramp[4])
    for i in range(10):  # gouttes
        a = (i / 10) * math.pi
        vx, vy = math.cos(a) * 9 * s, -math.sin(a) * 12 * s
        t = frame + 0.5
        x = cx + vx * t * 0.45
        y = base - 6 * s + vy * t * 0.45 + 2.2 * s * t * t
        if frame >= 1 and y < base + 2 * s:
            tone = 4 if frame < 3 else 2
            put(im, x, y, ramp[tone])
            if frame == 1:
                put(im, x, y + 1, ramp[3])
    if frame >= 1:  # ondes
        rx = (5 + frame * 4) * s
        ring(im, cx, base, rx, rx * 0.35, ramp[4 - frame if frame < 3 else 1], gap=frame - 1)
        if frame >= 2:
            ring(im, cx, base, rx * 0.55, rx * 0.2, ramp[2], gap=1)
    return im


LEAF = [[(0, 0), (1, 0), (2, 0), (1, -1), (1, 1)], [(0, 0), (1, -1), (2, -2), (1, 0), (2, -1)],
        [(0, 0), (0, 1), (0, 2), (-1, 1), (1, 1)], [(0, 0), (1, 1), (2, 2), (1, 0), (2, 1)]]


def nature_hit(ramp, frame, seed, size=32):
    """Nature : épines qui jaillissent, feuilles qui tourbillonnent puis retombent."""
    im = canvas(size, size)
    rnd = random.Random(seed)
    s = size / 32
    cx = cy = size / 2
    if frame == 0:
        disk(im, cx, cy, 5 * s, ramp[4], 4.5 * s)
        disk(im, cx, cy, 2.5 * s, '#ffffff')
    if frame <= 2:  # épines
        n = 7
        for i in range(n):
            a = i / n * math.tau + 0.4
            r0 = (2 + frame * 5) * s
            r1 = r0 + (9 - frame * 2) * s
            for r in range(int(r0), int(r1)):
                tip = r > r1 - 3 * s
                put(im, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.85, ramp[4 if tip else 2 - (frame == 2)])
                if not tip and r < r0 + 3 * s:
                    put(im, cx + math.cos(a) * r + 1, cy + math.sin(a) * r * 0.85, ramp[1])
    if frame >= 1:  # feuilles
        for i in range(8):
            a = i / 8 * math.tau + frame * 0.7 + rnd.uniform(0, 0.3)
            r = (5 + frame * 4.5) * s
            x = cx + math.cos(a) * r
            y = cy + math.sin(a) * r * 0.8 + (frame - 1) * 3 * s
            shape = LEAF[(i + frame) % 4]
            tone = (3, 3, 2)[frame - 1] if i % 2 else (4, 3, 1)[frame - 1]
            for dx, dy in shape:
                put(im, x + dx, y + dy, ramp[tone])
            put(im, x + shape[1][0], y + shape[1][1], ramp[min(4, tone + 1)])
    return im


HITS = {'fire': fire_hit, 'water': water_hit, 'nature': nature_hit}


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


HEAL = ['#16361a', '#2e6a2c', '#5ab04a', '#9de26a', '#e8ffd0']


def heal_fx(frame):
    """Soin 32 × 48 : colonne de lumière verte qui monte, feuilles et croix, anneau au sol."""
    im = canvas(32, 48)
    rnd = random.Random(21)
    cx, base = 16, 42
    # anneau au sol qui s'élargit
    rx = (6, 10, 12, 13)[frame]
    ring(im, cx, base, rx, rx * 0.35, HEAL[4 if frame < 2 else 3 - (frame == 3)], gap=frame)
    # colonne : deux bords clairs, cœur tramé, qui monte puis s'étire
    top = base - (14, 30, 40, 44)[frame]
    half = (7, 6, 5, 3)[frame]
    for y in range(int(top), base - 2):
        t = (y - top) / max(1, base - top)
        for x in range(cx - half, cx + half + 1):
            edge = abs(x - cx) == half
            if edge and frame < 3:
                put(im, x, y, HEAL[3 if t > 0.3 else 2])
            elif (x + y * 3 + frame * 2) % 5 == 0 and t > 0.15:
                put(im, x, y, HEAL[4 if (x + y) % 2 else 3])
    # croix et feuilles qui montent
    for i in range(7):
        x = 4 + rnd.randint(0, 24)
        y = base - 6 - rnd.randint(0, 10) - frame * 7 - (i % 3) * 2
        if y < 1:
            continue
        glyph = PLUS if i % 2 else LEAF[i % 4]
        for dx, dy in glyph:
            put(im, x + dx, y + dy, HEAL[4 if i % 2 else 3])
    return im


def bubble(w, h, frame):
    """Bulle de bouclier persistante : contour bleu, reflet qui tourne, quelques bulles."""
    im = canvas(w, h)
    ramp = ELEMENT['water']
    rx, ry = w / 2 - 1, h / 2 - 1
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    for y in range(h):
        for x in range(w):
            d = math.hypot((x - cx) / rx, (y - cy) / ry)
            a = math.atan2((y - cy) / ry, (x - cx) / rx)
            if 0.94 <= d < 1.0:
                hi = -2.6 < a < -1.2  # reflet en haut à gauche
                put(im, x, y, ramp[4] if hi != (frame == 1) and -2.9 < a < -0.9 else ramp[3])
            elif 0.84 <= d < 0.94 and -2.8 < a < -1.0 and (x + y + frame) % 2 == 0:
                put(im, x, y, ramp[4])
            elif d < 0.84 and (x * 5 + y * 7 + frame * 3) % 41 == 0:
                put(im, x, y, ramp[4])
    return im


def shatter(frame):
    """Bouclier brisé 32 × 32 : éclats d'un cercle bleu qui s'écartent et tombent."""
    im = canvas()
    ramp = ELEMENT['water']
    rnd = random.Random(9)
    for i in range(12):
        a = i / 12 * math.tau
        r = 10 + frame * 4
        x = 16 + math.cos(a) * r
        y = 16 + math.sin(a) * r * 0.9 + frame * frame * 1.2
        L = 4 - frame // 2
        for k in range(L):
            tone = 4 - (k > 1) - frame // 2
            put(im, x + math.cos(a + 1.3) * k, y + math.sin(a + 1.3) * k, ramp[tone])
            put(im, x + math.cos(a + 1.3) * k + 1, y + math.sin(a + 1.3) * k, ramp[max(0, tone - 1)])
    if frame == 0:
        ring(im, 16, 16, 9, 9, ramp[4], gap=0)
    return im


def stun(frame):
    """Étourdi : trois étoiles à quatre branches qui tournent au-dessus de la tête."""
    im = canvas(32, 16)
    for i in range(3):
        a = frame / 4 * math.tau + i / 3 * math.tau
        x, y = 16 + math.cos(a) * 11, 8 + math.sin(a) * 3
        behind = math.sin(a) < 0
        star = [(0, -2), (0, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (0, 1), (0, 2)]
        shape = star if not behind else PLUS
        on = {(round(x) + dx, round(y) + dy) for dx, dy in shape}
        for px, py in on:  # contour sombre : lisible sur le ciel clair comme sur le sol
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (px + ox, py + oy) not in on:
                    put(im, px + ox, py + oy, '#140a10')
        for px, py in on:
            centre = (px, py) == (round(x), round(y))
            put(im, px, py, '#fff6c8' if centre else ('#e2b440' if behind else '#fbe58a'))
    return im


def burn(frame):
    """Brûlure : flammes qui lèchent le bas du corps, braises qui montent."""
    im = canvas(32, 24)
    rnd = random.Random(frame * 7 + 1)
    for i, (x, h) in enumerate([(5, 7), (10, 11), (16, 9), (21, 12), (27, 8)]):
        h = h + (frame % 2) * (1 if i % 2 else -1) * 2
        lean = ((frame + i) % 3 - 1)
        for k in range(h):
            t = k / h
            w = 1 if t < 0.55 else 0
            tone = 4 if t < 0.2 else (3 if t < 0.5 else (2 if t < 0.8 else 1))
            for dx in range(-w, w + 1):
                put(im, x + dx + round(lean * t), 23 - k, FIRE[tone])
    for i in range(4):
        put(im, 4 + rnd.randint(0, 24), 2 + rnd.randint(0, 8), FIRE[3 + (i % 2)])
    return im


def mark(frame):
    """Cible : viseur qui se resserre."""
    im = canvas()
    r = [12, 10, 9, 9][frame]
    col = '#f07090'
    for k in range(-3, 4):
        for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            pass
    for a in range(0, 360, 4):
        if (a // 30) % 3 != 1:
            for rr, c in ((r, col), (r - 1, '#a03050')):  # trait double : lisible sur tout fond
                x = 16 + math.cos(math.radians(a)) * rr
                y = 16 + math.sin(math.radians(a)) * rr
                put(im, x, y, c)
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


def slash(ramp, frame):
    """Arc de frappe 48 × 48 devant le lanceur : croissant qui s'ouvre puis se dissipe."""
    im = canvas(48, 48)
    cx, cy = 20, 24
    r_out = 10 + frame * 5
    width = 5 - frame
    for y in range(48):
        for x in range(48):
            d = math.hypot(x - cx, (y - cy) * 1.1)
            a = math.atan2(y - cy, x - cx)
            if r_out - width <= d < r_out and -1.3 < a < 1.3:
                edge = r_out - d
                tone = 4 if edge < 1.5 and frame < 2 else (3 if edge < 3 else 2)
                if frame >= 2 and (x + y) % 2 == 0:
                    continue
                put(im, x, y, ramp[tone - (1 if frame == 3 else 0)])
    return im


def dust(frame, seed=3):
    """Nuage de poussière 32 × 16 au sol (chute, impact)."""
    im = canvas(32, 16)
    rnd = random.Random(seed)
    ramp = ['#2a2230', '#4a4050', '#6c6270', '#9a9098']
    for i in range(10):
        a = (i / 10) * math.pi
        r = 4 + frame * 4 + rnd.random() * 3
        x, y = 16 + math.cos(a) * r * 1.3, 13 - math.sin(a) * r * 0.5
        size = 3 - frame if frame < 3 else 1
        for dx in range(size):
            for dy in range(size):
                put(im, x + dx, y + dy, ramp[min(3, 3 - frame + (i % 2))])
    return im


def motes(ramp, frame, seed=5):
    """Dissolution 32 × 40 : le corps couché part en cendres lumineuses qui montent et s'éteignent."""
    im = canvas(32, 40)
    rnd = random.Random(seed)
    for i in range(44):
        x0 = 4 + rnd.random() * 24          # le long du corps couché
        y0 = 36 - rnd.random() * 6
        speed = 0.6 + rnd.random() * 0.8
        sway = math.sin(i * 1.7 + frame * 0.9) * (1 + frame)
        y = y0 - frame * 7 * speed - (i % 3)
        x = x0 + sway
        if frame == 0 and i % 3 == 2 or y < 1:  # les cendres partent par vagues
            continue
        tone = max(1, 4 - frame // 2 - (i % 2))
        put(im, x, y, ramp[tone])
        if frame < 3 and i % 3 == 0:
            put(im, x + 1, y, ramp[tone])
            put(im, x, y + 1, ramp[max(0, tone - 1)])
    if frame == 0:  # bouffée au sol
        for x in range(4, 28):
            if (x * 7) % 3:
                put(im, x, 37 + (x % 2), ramp[2])
    return im


def impact(ramp, frame, seed):
    """Gros impact 48 × 48 pour les coups lourds : éclat large et éclats longs."""
    im = canvas(48, 48)
    rnd = random.Random(seed)
    cx = cy = 24
    if frame < 2:
        for y in range(48):
            for x in range(48):
                d = math.hypot(x - cx, y - cy)
                if d < 7 - frame * 3:
                    put(im, x, y, '#ffffff' if frame == 0 else ramp[4])
                elif d < 10 - frame * 2:
                    put(im, x, y, ramp[4 - frame])
    for i in range(10):
        a = i / 10 * math.tau + rnd.random() * 0.3
        r0 = 4 + frame * 6
        r1 = r0 + 8 - frame * 2
        for r in range(int(r0), int(r1)):
            tone = 4 - frame if r < r0 + 3 else max(0, 3 - frame)
            put(im, cx + math.cos(a) * r, cy + math.sin(a) * r, ramp[tone])
    return im


def all_fx():
    out = {}
    for el, ramp in ELEMENT.items():
        hit = HITS[el]
        out[f'burst_{el}'] = [hit(ramp, f, 11, 32) for f in range(4)]
        kind = {'fire': 'orb', 'water': 'orb', 'nature': 'thorn'}[el]
        out[f'bolt_{el}'] = [projectile(ramp, f, kind) for f in range(2)]
        out[f'aura_{el}'] = [aura(ramp, f) for f in range(2)]
        out[f'slash_{el}'] = [slash(ramp, f) for f in range(4)]
        out[f'impact_{el}'] = [hit(ramp, f, 23, 48) for f in range(4)]
        out[f'motes_{el}'] = [motes(ramp, f) for f in range(4)]
    out['dust'] = [dust(f) for f in range(4)]
    out['heal'] = [heal_fx(f) for f in range(4)]
    out['bubble_s'] = [bubble(36, 44, f) for f in range(2)]
    out['bubble_l'] = [bubble(56, 76, f) for f in range(2)]
    out['shatter'] = [shatter(f) for f in range(4)]
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
