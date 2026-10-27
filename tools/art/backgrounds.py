"""Décors de combat 320×180, un par donjon. Rendu déterministe (graine fixe)."""
import math
import random

import numpy as np
from PIL import Image, ImageDraw

from pix import BAYER, hexc

W, H = 320, 180
GROUND = 138  # ligne d'horizon du sol de combat


class Canvas:
    def __init__(self):
        self.a = np.zeros((H, W, 3), np.uint8)

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.a[y, x] = hexc(c) if isinstance(c, str) else c

    def get(self, x, y):
        return tuple(int(v) for v in self.a[y, x])

    def dith(self, x, y, t):
        return t > BAYER[y % 4][x % 4]

    def bands(self, stops, y0=0, y1=H):
        """Dégradé tramé vertical : stops = [(y, couleur), ...]."""
        for y in range(y0, y1):
            for i in range(len(stops) - 1):
                ya, ca = stops[i]
                yb, cb = stops[i + 1]
                if ya <= y < yb:
                    t = (y - ya) / (yb - ya)
                    for x in range(W):
                        self.put(x, y, cb if self.dith(x, y, t) else ca)
            if y >= stops[-1][0]:
                for x in range(W):
                    self.put(x, y, stops[-1][1])

    def disc(self, cx, cy, rings):
        """Astre et halo : rings = [(rayon, couleur, densité ou None si plein)]."""
        for y in range(H):
            for x in range(W):
                d = math.hypot(x - cx, y - cy)
                for r0, r1, c, dens in rings:
                    if r0 <= d < r1:
                        if dens is None or self.dith(x, y, dens * (r1 - d) / (r1 - r0)):
                            self.put(x, y, c)
                        break

    def ridge(self, base, amp, color, seed, step=12, flat=0.0, top=None, ylimit=H, rough=2):
        """Silhouette de relief : ligne brisée bruitée, plateaux si flat > 0."""
        rnd = random.Random(seed)
        pts = []
        x = -step
        while x < W + step * 2:
            hgt = rnd.random() * amp
            if flat and rnd.random() < flat:
                w = rnd.randint(step, step * 3)
                pts += [(x, base - hgt), (x + w, base - hgt)]
                x += w + rnd.randint(2, 5)
            else:
                pts.append((x, base - hgt))
                x += step
        prof = np.interp(np.arange(W), [p[0] for p in pts], [p[1] for p in pts])
        prof += np.array([rnd.randint(0, rough) * 0.5 for _ in range(W)])
        for x in range(W):
            yt = int(prof[x])
            for y in range(max(0, yt), ylimit):
                self.put(x, y, color)
            if top and 0 <= yt < H:
                self.put(x, yt, top)
        return prof

    def blob(self, rows, ox, oy, pal):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != '.':
                    self.put(ox + i, oy + j, pal[ch])

    def image(self):
        return Image.fromarray(self.a, 'RGB')


def ember_wastes():
    c = Canvas()
    c.bands([(0, '#1a0f2e'), (30, '#2a1536'), (56, '#47203f'), (78, '#74293e'), (96, '#a53c3a'),
             (110, '#d4603a'), (120, '#f0924a'), (127, '#ffc77a')], 0, GROUND)
    c.disc(226, 116, [(0, 17, '#fff3c9', None), (17, 19, '#ffe29a', None), (19, 36, '#ffd27e', 0.6),
                      (36, 60, '#f7a85a', 0.35)])
    rnd = random.Random(3)
    for _ in range(9):  # nuages étirés
        y = rnd.randint(30, 95)
        x0 = rnd.randint(-20, W)
        ln = rnd.randint(30, 90)
        col = ['#5a2440', '#7d2c3e', '#9a3c44', '#c45a48', '#e8884e'][min(4, (y - 30) // 14)]
        for x in range(x0, x0 + ln):
            c.put(x, y, col)
            if x0 + 6 < x < x0 + ln - 8:
                c.put(x, y + 1, col)
    for x in range(W):  # étoiles
        if rnd.random() < 0.08:
            y = rnd.randint(2, 40)
            c.put(x, y, '#c8a8c8' if rnd.random() < 0.5 else '#6a4a7a')
    c.ridge(126, 14, '#9c4a52', 1, step=18, flat=0.6, top='#d6825c', ylimit=GROUND, rough=0)
    c.ridge(132, 22, '#6e3040', 2, step=14, flat=0.7, top='#e7905e', ylimit=GROUND, rough=0)
    # grandes mesas du premier plan
    for (x0, x1, top) in [(-8, 58, 96), (262, 330, 90)]:
        for y in range(top, GROUND + 4):
            k = min(1, (y - top) / 10)
            for x in range(int(x0 - k * 8), int(x1 + k * 8)):
                c.put(x, y, '#4a1e30')
        for x in range(x0, x1):
            c.put(x, top, '#f0a060')
            c.put(x, top + 1, '#b0584a')
        for xs in range(x0 + 6, x1, 11):  # strates
            for y in range(top + 4, GROUND, 1):
                if (y + xs) % 7 < 4:
                    c.put(xs, y, '#3a1626')
    # sol : bandes de perspective, tramées seulement aux transitions
    c.bands([(GROUND, '#7a3438'), (GROUND + 6, '#5e2834'), (GROUND + 16, '#45202e'), (GROUND + 28, '#331828'),
             (H, '#24101c')], GROUND, H)
    for x in range(W):
        c.put(x, GROUND, '#d27050' if x % 4 else '#a04a40')
    for _ in range(140):  # cailloux et touffes sèches
        x, y = rnd.randint(0, W - 2), rnd.randint(GROUND + 3, H - 1)
        c.put(x, y, '#8a4040' if y < GROUND + 18 else '#4e2430')
        c.put(x + 1, y, '#1c0c16')
    # crevasses de braise
    for (x, y, ln) in [(30, 150, 22), (120, 166, 30), (210, 156, 26), (282, 170, 18)]:
        for i in range(ln):
            yy = y + int(2 * math.sin(i / 3))
            c.put(x + i, yy, '#ff8a3a' if i % 5 else '#ffd27a')
            c.put(x + i, yy + 1, '#7a1a14')
    ROCK = {'K': '#1c0c16', 'l': '#a85a44', 'm': '#5a2a30'}
    c.blob(['..lll..', '.lmmml.', 'lmKKKml', 'KKKKKKK'], 150, 172, ROCK)
    c.blob(['.ll.', 'lmml', 'KKKK'], 300, 150, ROCK)
    CACT = {'K': '#1a0c14', 'l': '#c06048'}
    c.blob(['.l.', 'lKl', 'KKK', 'KKK.l', 'KKK.K', 'KKKKK', 'KKK..', 'KKK..', 'KKK..', 'KKK..'], 8, 128, CACT)
    c.blob(['.l..', 'lKl.', 'KKK.', 'KKKKl', 'KKKKK', 'KKK..', 'KKK..'], 306, 131, CACT)
    for _ in range(26):  # braises en l'air
        c.put(rnd.randint(0, W - 1), rnd.randint(40, GROUND), rnd.choice(['#ffd27a', '#ffb04a', '#f7a85a']))
    return c.image()


def lighten(c, x0, y0, x1, y1, fn, amt=(40, 34, 24)):
    """Éclaircit les pixels où fn(x, y) renvoie une densité tramée > seuil."""
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            d = fn(x, y)
            if d > 0 and c.dith(x, y, d):
                r, g, b = c.get(x, y)
                c.a[y, x] = (min(255, r + amt[0]), min(255, g + amt[1]), min(255, b + amt[2]))


def pillar(c, x, top, w, body, light, dark, broken=False):
    for y in range(top, GROUND):
        for i in range(w):
            col = light if i == 1 else dark if i >= w - 2 else body
            if broken and y < top + 6 and (i * 3 + y) % 5 == 0:
                continue
            c.put(x + i, y, col)
    for i in range(-2, w + 2):  # chapiteau et base
        c.put(x + i, GROUND - 1, dark)
        c.put(x + i, GROUND - 2, body)
        if not broken:
            c.put(x + i, top, light)
            c.put(x + i, top + 1, body)


def weeds(c, rnd, n, y0, y1, cols, hmin=6, hmax=20):
    for _ in range(n):
        x, base = rnd.randint(0, W - 1), rnd.randint(y0, y1)
        hgt = rnd.randint(hmin, hmax)
        for k in range(hgt):
            c.put(x + int(1.5 * math.sin(k / 3 + x)), base - k, cols[min(len(cols) - 1, k * len(cols) // hgt)])


def drowned_halls():
    c = Canvas()
    rnd = random.Random(11)
    c.bands([(0, '#04121e'), (40, '#072034'), (90, '#0c3048'), (130, '#124058')], 0, GROUND)
    c.ridge(110, 20, '#0a2436', 21, step=10, ylimit=GROUND, rough=2)
    for x in (18, 70, 214, 262):  # colonnes lointaines
        pillar(c, x, 50 + (x % 30), 10, '#123a50', '#1e5068', '#0c2a3c', broken=x in (70, 214))
    for x in (-4, 292):
        pillar(c, x, 10, 22, '#0e3044', '#2a6a80', '#08202e')
    for i in range(W):  # arche brisée en haut
        y = int(14 + 0.0012 * (i - 160) ** 2)
        if not 150 < i < 186:
            for k in range(6):
                c.put(i, y - k, '#0a2638' if k else '#2a6a80')
    lighten(c, 0, 0, W, GROUND, lambda x, y: 0.45 if (x - y * 0.45) % 64 < 10 and y < 120 else 0, (16, 40, 46))
    lighten(c, 0, 0, W, GROUND, lambda x, y: 0.25 if (x - y * 0.45 + 30) % 90 < 6 else 0, (10, 30, 36))
    c.bands([(GROUND, '#2a5050'), (GROUND + 8, '#1a3a40'), (GROUND + 22, '#102830'), (H, '#081a22')], GROUND, H)
    for y in range(GROUND + 4, H, 9):  # dalles
        off = (y // 9) % 2 * 14
        for x in range(W):
            c.put(x, y, '#0c2228')
            if (x + off) % 28 == 0:
                for k in range(9):
                    c.put(x, y + k, '#0c2228')
    weeds(c, rnd, 30, GROUND + 2, H - 4, ['#0e3a2a', '#1a5a3a', '#2a7a4a', '#4aa060'], 6, 22)
    for _ in range(45):  # bulles
        x, y = rnd.randint(0, W - 1), rnd.randint(0, GROUND)
        c.put(x, y, '#6ac0d0')
        if rnd.random() < 0.3:
            c.put(x + 1, y - 1, '#a6e0ea')
    return c.image()


def thorn_maze():
    c = Canvas()
    rnd = random.Random(23)
    c.bands([(0, '#0a0814'), (40, '#16102a'), (80, '#22183a'), (115, '#2e2a40')], 0, GROUND)
    c.disc(240, 34, [(0, 11, '#e8f0d0', None), (11, 13, '#a8b8a0', None), (13, 28, '#4a4a6a', 0.5)])
    for x in range(W):
        if rnd.random() < 0.06:
            c.put(x, rnd.randint(2, 70), '#8a88b0')
    def bramble_wall(base, amp, col, edge, seed):
        prof = c.ridge(base, amp, col, seed, step=7, ylimit=GROUND, rough=4)
        r2 = random.Random(seed)
        for x in range(0, W, 3):  # épines sur la crête
            y = int(prof[x])
            if r2.random() < 0.6:
                c.put(x, y - 1, edge)
                c.put(x + 1, y - 2, edge)
        for _ in range(60):  # branches courbes
            x, y = r2.randint(0, W), r2.randint(int(base - amp), GROUND)
            for k in range(r2.randint(4, 10)):
                c.put(x + k, y + int(2 * math.sin(k / 2)), edge)
    bramble_wall(96, 30, '#1c1630', '#2e2648', 4)
    lighten(c, 0, 90, W, GROUND, lambda x, y: 0.4 if 108 < y < 118 else 0, (24, 30, 30))  # brume
    bramble_wall(122, 34, '#120e1e', '#2a2238', 5)
    for x0, top in [(0, 30), (290, 24)]:  # grands troncs tordus
        for y in range(top, GROUND):
            wob = int(3 * math.sin(y / 9))
            for i in range(24):
                c.put(x0 + i + wob, y, '#0c0a14' if i > 4 else '#2a2238')
    c.bands([(GROUND, '#24301e'), (GROUND + 8, '#1a2418'), (GROUND + 24, '#121a12'), (H, '#0a100a')], GROUND, H)
    weeds(c, rnd, 70, GROUND, H - 1, ['#1a2a16', '#2a4020', '#3a5a28'], 2, 6)
    for _ in range(8):  # champignons luisants
        x, y = rnd.randint(4, W - 6), rnd.randint(GROUND + 4, H - 4)
        c.blob(['.ggg.', 'gGGGg', '..w..', '..w..'], x, y - 4, {'g': '#3aa060', 'G': '#8ae890', 'w': '#c8d8b0'})
    for _ in range(40):  # lucioles
        c.put(rnd.randint(0, W - 1), rnd.randint(60, GROUND + 20), rnd.choice(['#c8ff60', '#8ad84a', '#e0ffa0']))
    return c.image()


def cinder_citadel():
    c = Canvas()
    rnd = random.Random(31)
    c.bands([(0, '#0e0608'), (40, '#2a0c0c'), (80, '#5a1610'), (110, '#9a2a14'), (128, '#d04a1a')], 0, GROUND)
    # volcan au fond avec coulée
    for y in range(40, GROUND):
        hw = (y - 40) * 1.4 + 10
        for x in range(int(110 - hw), int(110 + hw)):
            c.put(x, y, '#2a1014')
    for y in range(40, GROUND):
        x = 110 + int(6 * math.sin(y / 6)) + (y - 40) // 3
        for k in range(-1, 2):
            c.put(x + k, y, '#ff8a2a' if k == 0 else '#c8361a')
    lighten(c, 70, 0, 150, 60, lambda x, y: max(0, 0.6 - math.hypot(x - 110, y - 38) / 30), (60, 20, 0))
    for _ in range(18):  # fumée
        x, y = 110 + rnd.randint(-20, 30), rnd.randint(0, 40)
        for k in range(rnd.randint(6, 16)):
            c.put(x + k, y, '#3a1a1a')
    # citadelle
    def tower(x, w, top, roof=True):
        for y in range(top, GROUND):
            for i in range(w):
                c.put(x + i, y, '#140a0e' if i < w - 2 else '#0a0408')
        for i in range(0, w, 3):
            for k in range(3):
                c.put(x + i, top - k, '#140a0e')
        for wy in range(top + 6, GROUND - 6, 10):
            c.put(x + w // 2, wy, '#ffb840')
            c.put(x + w // 2, wy + 1, '#f06a24')
        if roof:
            for k in range(w // 2 + 2):
                for i in range(k, w - k):
                    c.put(x + i, top - 3 - (w // 2 + 2 - k), '#140a0e')
    for x, w, top in [(196, 14, 52), (214, 22, 30), (240, 12, 60), (256, 30, 44), (290, 16, 64), (-4, 20, 70), (20, 12, 84)]:
        tower(x, w, top)
    for x in range(180, W):  # muraille
        for y in range(92, GROUND):
            c.put(x, y, '#100808')
        if x % 4 < 2:
            c.put(x, 91, '#100808')
            c.put(x, 90, '#100808')
    c.bands([(GROUND, '#3a1410'), (GROUND + 10, '#26100e'), (GROUND + 26, '#160a0a'), (H, '#0c0606')], GROUND, H)
    for (x, y, ln) in [(10, 148, 40), (100, 160, 50), (200, 150, 34), (250, 172, 60), (60, 174, 30)]:
        for i in range(ln):
            yy = y + int(2 * math.sin(i / 4))
            c.put(x + i, yy, '#ffb840' if i % 6 else '#fff2b8')
            c.put(x + i, yy + 1, '#c0301a')
            c.put(x + i, yy - 1, '#6a140a')
    for _ in range(60):  # cendres et braises
        c.put(rnd.randint(0, W - 1), rnd.randint(0, H - 1), rnd.choice(['#ffb840', '#f06a24', '#5a3a3a', '#7a5a5a']))
    return c.image()


def sunken_spire():
    c = Canvas()
    rnd = random.Random(41)
    c.bands([(0, '#02040c'), (60, '#040a1c'), (110, '#081430'), (130, '#0c1c3c')], 0, GROUND)
    # flèche lointaine
    for y in range(8, GROUND):
        hw = 3 + (y - 8) * 0.12
        for x in range(int(160 - hw), int(160 + hw) + 1):
            c.put(x, y, '#0a1430' if x < 160 + hw - 2 else '#060c20')
        if y % 12 == 0:
            c.put(160, y, '#6ac0e0')
    for k in (40, 70, 100):
        for x in range(160 - k // 4, 160 + k // 4):
            c.put(x, k, '#0e1c40')
    lighten(c, 100, 0, 220, GROUND, lambda x, y: max(0, 0.35 - abs(x - 160) / 70), (8, 20, 40))
    c.ridge(116, 26, '#060c1c', 42, step=9, ylimit=GROUND, rough=3)
    for x0, w in [(-6, 40), (280, 46)]:  # récifs
        prof = [int(30 + 20 * math.sin(i / 5 + x0)) for i in range(w)]
        for i in range(w):
            for y in range(prof[i], GROUND):
                c.put(x0 + i, y, '#040814' if i % 7 else '#0a1428')
    for _ in range(5):  # méduses
        x, y = rnd.randint(30, 290), rnd.randint(20, 100)
        c.blob(['.ppp.', 'pPPPp', 'p.p.p', '.p.p.', 'p...p'], x, y,
               {'p': '#6a4ab0', 'P': '#c8a0f0'})
    c.bands([(GROUND, '#16223a'), (GROUND + 8, '#0e182c'), (GROUND + 24, '#080e1e'), (H, '#040812')], GROUND, H)
    weeds(c, rnd, 26, GROUND, H - 2, ['#0a2a3a', '#14485a', '#2a7090', '#6ac0e0'], 3, 10)
    for _ in range(90):  # plancton luminescent
        c.put(rnd.randint(0, W - 1), rnd.randint(0, H - 1), rnd.choice(['#2a90c0', '#6ac0e0', '#1a4a80', '#a0f0ff']))
    return c.image()


def verdant_crown():
    c = Canvas()
    rnd = random.Random(51)
    c.bands([(0, '#2a3a1a'), (30, '#4a6a24'), (70, '#8aa040'), (100, '#d8c860'), (124, '#f8e8a0')], 0, GROUND)
    for x0, w in [(30, 14), (88, 10), (150, 18), (226, 12), (270, 16)]:  # troncs lointains
        for y in range(0, GROUND):
            for i in range(w):
                c.put(x0 + i + int(2 * math.sin(y / 14 + x0)), y, '#6a7a3a' if i > 2 else '#9aa850')
    for (x, y, r) in [(20, 10, 40), (100, 0, 46), (190, 6, 50), (290, 4, 44)]:  # frondaisons
        for yy in range(y - r, y + r // 2):
            for xx in range(x - r, x + r):
                if (xx - x) ** 2 + ((yy - y) * 1.6) ** 2 < r * r and c.dith(xx, yy, 0.9 - (yy - y + r) / (3 * r)):
                    c.put(xx, yy, '#2a4a1a' if c.dith(xx, yy, 0.5) else '#3a6020')
    lighten(c, 0, 0, W, GROUND, lambda x, y: 0.35 if (x + y * 0.6) % 70 < 9 else 0, (40, 36, 10))
    for x0, w in [(-10, 34), (286, 40)]:  # troncs immenses au premier plan
        for y in range(0, GROUND + 6):
            for i in range(w):
                c.put(x0 + i, y, '#3a2a16' if i % 9 else '#24180e')
            c.put(x0 + (w if x0 < 0 else 0), y, '#a07a3a')
    c.bands([(GROUND, '#6a8a2a'), (GROUND + 6, '#4a6a22'), (GROUND + 20, '#34501a'), (H, '#203612')], GROUND, H)
    weeds(c, rnd, 120, GROUND, H - 1, ['#34501a', '#5a7a26', '#8aa840'], 2, 7)
    for _ in range(26):  # fleurs
        x, y = rnd.randint(0, W - 2), rnd.randint(GROUND + 4, H - 2)
        col = rnd.choice(['#f8a0b8', '#f8e870', '#ffffff', '#c890f0'])
        c.put(x, y, col)
        c.put(x + 1, y + 1, '#2a4a1a')
    for _ in range(70):  # spores dorées
        c.put(rnd.randint(0, W - 1), rnd.randint(10, GROUND + 30), rnd.choice(['#fff8c0', '#f8e870', '#d8f080']))
    return c.image()


def broken_crossing():
    c = Canvas()
    rnd = random.Random(61)
    c.bands([(0, '#120a24'), (40, '#2a1640'), (80, '#5a2a56'), (110, '#a04a5a'), (128, '#e88a60')], 0, GROUND)
    for x in range(W):
        if rnd.random() < 0.07:
            c.put(x, rnd.randint(2, 60), '#b8a0d0')
    # parois du canyon
    edges = {}
    for y in range(20, H):
        l = int(70 + 18 * math.sin(y / 11) + (y - 20) * 0.1)
        r = int(250 - 16 * math.sin(y / 13) - (y - 20) * 0.1)
        edges[y] = (l, r)
        for x in list(range(0, l)) + list(range(r, W)):
            strata = (y // 5 + x // 23) % 4
            c.put(x, y, ('#2a1420', '#321824', '#2a1420', '#3a1c28')[strata])
        c.put(l, y, '#d07a5a')
        c.put(l - 1, y, '#8a4a44')
        c.put(r, y, '#6a3a40')
    # rivière au fond, entre les parois
    for y in range(116, GROUND):
        l, r = edges[y]
        for x in range(l + 1, r):
            c.put(x, y, '#4a8ac0' if (x * 2 + y * 7) % 23 == 0 else '#1a3a60' if y > 120 else '#2a5a88')
    # pont de corde brisé
    for x in range(64, 254):
        if 140 <= x <= 176:
            continue
        sag = 0.0022 * (x - 159) ** 2
        y = int(70 + 26 - sag) if x < 140 else int(70 + 26 - sag)
        if x < 140:
            y = int(72 + (x - 64) * 0.22)
        else:
            y = int(72 + (254 - x) * 0.22)
        c.put(x, y, '#6a4020')
        c.put(x, y - 5, '#8a5a30')
        if x % 4 == 0:
            for k in range(5):
                c.put(x, y - k, '#4a2a14')
    for x0, hang in [(140, 1), (176, -1)]:  # cordes pendantes
        for k in range(24):
            c.put(x0 + hang * (k // 6), 89 + k, '#6a4020')
    # sol : corniche de pierre
    c.bands([(GROUND, '#5a3a3a'), (GROUND + 6, '#42282e'), (GROUND + 22, '#2c1a22'), (H, '#1a0e16')], GROUND, H)
    for x in range(W):
        c.put(x, GROUND, '#a86a5a')
    # éléments mêlés : braises à gauche, gouttes à droite, feuilles au centre
    for _ in range(30):
        c.put(rnd.randint(0, 110), rnd.randint(40, H - 1), rnd.choice(['#ffb840', '#f06a24']))
        c.put(rnd.randint(210, W - 1), rnd.randint(40, H - 1), rnd.choice(['#6ac0e0', '#a6e0ea']))
        c.put(rnd.randint(110, 210), rnd.randint(40, H - 1), rnd.choice(['#8ad84a', '#c8ff60']))
    return c.image()


ALL = {'ember_wastes': ember_wastes, 'drowned_halls': drowned_halls, 'thorn_maze': thorn_maze,
       'cinder_citadel': cinder_citadel, 'sunken_spire': sunken_spire, 'verdant_crown': verdant_crown,
       'broken_crossing': broken_crossing}

if __name__ == '__main__':
    import sys
    from PIL import Image
    from pix import upscale
    names = list(ALL)
    sheet = Image.new('RGB', (W * 2 + 6, (H + 6) * 4))
    for i, n in enumerate(names):
        sheet.paste(ALL[n](), ((i % 2) * (W + 6), (i // 2) * (H + 6)))
    upscale(sheet, 2).save(sys.argv[1])
