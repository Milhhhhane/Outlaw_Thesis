"""Ennemis (64×64, ou 96×96 pour les boss), tournés vers la gauche."""
from pix import Sprite
from pal import *


def flames(s, tongues, ramp=FIRE, glow=1):
    """Langues de feu : (x, y de la base, hauteur, penchant)."""
    for x, y, hgt, lean in tongues:
        s.poly([(x - 3, y), (x - 3 + lean // 3, y - hgt * 2 // 5), (x - 1 + lean * 2 // 3, y - hgt * 3 // 4),
                (x + lean, y - hgt), (x + 1 + lean * 2 // 3, y - hgt // 2), (x + 3, y - hgt // 5), (x + 3, y)],
               ramp, glow=glow)


def cinder_hound(f=0, k=1.0, boss=False):
    s = Sprite(round(64 * k), round(64 * k), k)
    b = f % 2
    hide = CHAR if boss else ASH
    far = dict(bias=-0.35)
    s.poly([(19, 42), (25, 42), (24, 55), (26, 58), (19, 58), (20, 55)], hide, **far)
    s.poly([(45, 37), (51, 37), (52, 44), (55, 51), (53, 58), (49, 58), (51, 51), (46, 46)], hide, **far)
    s.poly([(50, 33 + b), (55, 30 + b), (61, 25 + b), (60, 30 + b), (56, 36 + b), (52, 39 + b)], hide)
    s.poly([(17, 31 + b), (29, 27 + b), (42, 28 + b), (51, 31 + b), (54, 37 + b), (51, 43 + b), (43, 43 + b),
            (35, 41 + b), (27, 45 + b), (19, 44 + b)], hide)
    s.poly([(22, 40 + b), (29, 40 + b), (28, 47), (27, 55), (30, 58), (22, 58), (24, 55), (24, 47)], hide, bias=0.1)
    s.poly([(41, 35 + b), (52, 35 + b), (53, 43), (49, 48), (51, 51), (49, 58), (45, 58), (47, 52), (43, 46)], hide, bias=0.1)
    s.pxs([(22, 58), (24, 58), (26, 58), (45, 58), (47, 58)], '#120a12')
    s.poly([(12, 31 + b), (24, 25 + b), (29, 33 + b), (25, 42 + b), (15, 41 + b)], hide)
    s.poly([(14, 27 + b), (17, 19 + b), (21, 28 + b)], hide, bias=-0.1)
    s.poly([(4, 31 + b), (10, 27 + b), (18, 26 + b), (22, 32 + b), (18, 37 + b), (8, 37 + b)], hide)
    s.poly([(0, 33 + b), (7, 31 + b), (9, 35 + b), (1, 36 + b)], hide)
    s.poly([(1, 36 + b), (9, 35 + b), (15, 37 + b), (9, 39 + b), (3, 39 + b)], FIRE, glow=1)
    s.poly([(2, 40 + b), (10, 38 + b), (16, 39 + b), (11, 42 + b), (4, 42 + b)], hide, bias=-0.2)
    s.pxs([(2, 37 + b), (5, 37 + b), (8, 37 + b), (4, 40 + b), (7, 40 + b)], '#f6eed8')
    s.line([(31, 36 + b), (34, 34 + b), (37, 36 + b)], FIRE, glow=1)
    s.line([(46, 38 + b), (48, 41 + b)], FIRE, glow=1)
    if boss:
        # matrone : cornes, collier d'or, poitrail en fusion, crinière plus haute
        s.poly([(16, 27 + b), (19, 16 + b), (24, 10 + b), (22, 18 + b), (20, 28 + b)], BONE)
        s.poly([(11, 28 + b), (11, 20 + b), (14, 15 + b), (14, 22 + b), (15, 29 + b)], BONE, bias=-0.2)
        s.line([(14, 40 + b), (21, 41 + b), (27, 36 + b)], GOLD, width=2)
        s.ell((18, 32 + b, 26, 40 + b), FIRE, glow=2)
        s.line([(24, 50), (26, 53)], FIRE, glow=1)
        flames(s, [(16, 30 + b, 12, 4), (21, 28 + b, 17, 7), (27, 27 + b, 19, 9), (33, 28 + b, 16, 9),
                   (39, 29 + b, 13, 8), (45, 30 + b, 10, 7), (58, 29 + b, 13, 5)], glow=4)
    else:
        flames(s, [(16, 30 + b, 9, 4), (21, 28 + b, 13, 6), (27, 27 + b, 14, 8), (33, 28 + b, 12, 8),
                   (39, 29 + b, 9, 7), (45, 30 + b, 7, 6), (58, 29 + b, 10, 4)], glow=3)
    s.pxs([(10, 30 + b), (11, 30 + b)], EMBER_EYE)
    s.px(10, 31 + b, '#ff7a2a')
    return s


def ash_acolyte(f=0):
    """Encapuchonné en robe de cendre, bâton couronné de flammes."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(24, 28 + b), (40, 26 + b), (47, 58), (40, 60), (30, 58), (22, 60), (16, 58)], ASH)
    s.poly([(30, 30 + b), (40, 28 + b), (44, 50), (36, 46)], ASH, bias=-0.3)
    s.line([(22, 36 + b), (42, 33 + b)], RED, width=2)
    s.poly([(34, 34 + b), (37, 34 + b), (40, 46), (36, 48)], RED, bias=-0.2)
    s.poly([(22, 10 + b), (28, 6 + b), (36, 7 + b), (41, 14 + b), (40, 24 + b), (36, 30 + b), (24, 29 + b), (20, 18 + b)], ASH)
    s.ell((21, 13 + b, 31, 24 + b), VOID, flat=True, seam=False)
    s.pxs([(24, 17 + b), (28, 17 + b)], '#ffb840')
    s.pxs([(24, 18 + b), (28, 18 + b)], '#f06a24')
    s.line([(14, 13 + b), (17, 60)], BARK, width=2)
    s.poly([(20, 26 + b), (29, 26 + b), (23, 37 + b), (15, 36 + b)], ASH)
    s.ell((12, 32 + b, 17, 37 + b), ['#3a3238', '#5a5058', '#80767c', '#a89ca0'])
    flames(s, [(13, 13 + b, 10, -1), (16, 14 + b, 13, 1), (19, 13 + b, 8, 2)], glow=2)
    for x, y in [(26, 59), (34, 60), (42, 59)]:
        s.px(x, y, '#ff8a3a')
    return s


def brine_crab(f=0):
    """Crabe rouille couvert de bernacles, pince géante levée."""
    s = Sprite(64, 64)
    b = f % 2
    for i, (x0, x1) in enumerate([(22, 14), (30, 24), (40, 40), (48, 54), (54, 62)]):
        s.line([(x0, 46), ((x0 + x1) // 2, 50 - i % 2), (x1, 59)], CRAB, width=2, bias=-0.3 if i % 2 else 0)
    s.ell((14, 30 + b, 56, 52 + b), CRAB)
    s.poly([(16, 44 + b), (54, 44 + b), (50, 50 + b), (20, 50 + b)], BONE, bias=-0.2)
    for x, y in [(30, 33), (38, 32), (44, 35), (34, 37)]:
        s.ell((x, y + b, x + 3, y + 3 + b), BONE)
    s.poly([(44, 31 + b), (52, 34 + b), (50, 38 + b), (44, 36 + b)], SEA, bias=-0.1)  # algues
    s.line([(24, 32 + b), (22, 24 + b)], CRAB, width=1)
    s.line([(30, 31 + b), (30, 23 + b)], CRAB, width=1)
    s.ell((20, 21 + b, 24, 25 + b), VOID)
    s.ell((28, 20 + b, 32, 24 + b), VOID)
    s.pxs([(21, 22 + b), (29, 21 + b)], '#f6eed8')
    # bras et grande pince levée
    s.poly([(18, 40 + b), (10, 32 + b), (14, 28 + b), (22, 36 + b)], CRAB)
    s.poly([(2, 14 + b), (12, 12 + b), (18, 20 + b), (14, 30 + b), (6, 28 + b), (8, 22 + b)], CRAB)
    s.poly([(2, 26 + b), (8, 24 + b), (12, 30 + b), (4, 32 + b)], CRAB, bias=-0.2)
    s.pxs([(4, 18 + b), (6, 15 + b), (5, 29 + b)], '#f6eed8')
    s.poly([(52, 38 + b), (60, 34 + b), (63, 40 + b), (56, 44 + b)], CRAB)
    for x, y in [(8, 13), (16, 18), (40, 30)]:
        s.px(x, y + b, '#f0b080')
    return s


def tide_caller(f=0):
    """Homme-poisson voûté, châle d'algues, trident chargé d'eau."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(36, 12 + b), (42, 8 + b), (44, 16 + b), (48, 14 + b), (46, 24 + b), (38, 26 + b)], FOAM, bias=-0.2)
    s.poly([(26, 44), (31, 44), (30, 57), (25, 57)], SCALE, bias=-0.2)
    s.poly([(34, 44), (40, 44), (42, 57), (36, 57)], SCALE)
    s.poly([(22, 56), (31, 56), (31, 59), (20, 59)], SCALE)
    s.poly([(34, 56), (43, 56), (45, 59), (34, 59)], SCALE)
    s.poly([(22, 24 + b), (36, 22 + b), (41, 34 + b), (39, 46), (24, 46), (20, 36 + b)], SCALE)
    s.ell((21, 30 + b, 32, 45 + b), BELLY)
    s.poly([(10, 18 + b), (18, 12 + b), (28, 12 + b), (34, 18 + b), (31, 26 + b), (20, 28 + b), (12, 26 + b)], SCALE)
    s.line([(11, 24 + b), (20, 24 + b)], VOID, flat=True)
    s.ell((16, 15 + b, 22, 21 + b), ['#3a3a0c', '#8a8a1a', '#e8e040', '#fffcb0'], glow=1)
    s.px(18, 18 + b, '#06040a')
    s.poly([(20, 22 + b), (38, 21 + b), (41, 30 + b), (35, 35 + b), (29, 30 + b), (23, 35 + b), (18, 29 + b)], LEAF, bias=-0.1)
    s.line([(12, 60), (13, 4 + b)], GOLD, width=2)
    s.line([(8, 10 + b), (8, 5 + b), (18, 5 + b), (18, 10 + b)], GOLD)
    s.line([(13, 4 + b), (13, 0 + b)], GOLD)
    s.poly([(20, 27 + b), (27, 27 + b), (18, 37 + b), (12, 35 + b)], SCALE)
    s.ell((10, 32 + b, 16, 38 + b), SCALE, bias=0.2)
    s.ell((6, 0 + b, 20, 12 + b), WATER, glow=2, ghost=True, dither=0.9)
    return s


def moss_brute(f=0):
    """Brute moussue : colosse voûté, défenses, gourdin de souche."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(44, 22 + b), (53, 24 + b), (56, 40 + b), (49, 45 + b)], BRUTE, bias=-0.3)
    s.poly([(28, 45), (36, 45), (37, 58), (26, 58)], BRUTE, bias=-0.2)
    s.poly([(40, 45), (48, 45), (51, 58), (40, 58)], BRUTE)
    s.poly([(18, 20 + b), (36, 13 + b), (50, 19 + b), (55, 33 + b), (50, 48), (26, 48), (16, 36 + b)], BRUTE)
    s.poly([(24, 44), (50, 44), (52, 50), (22, 50)], LEATHER)
    for x, y, r in [(26, 13, 5), (35, 11, 6), (45, 15, 5), (52, 22, 4)]:
        s.ell((x - r, y - r + 3 + b, x + r, y + r - 1 + b), MOSS)
    s.ell((40, 6 + b, 46, 11 + b), CRAB, glow=1)
    s.line([(43, 11 + b), (43, 14 + b)], BONE)
    s.poly([(8, 15 + b), (16, 11 + b), (24, 15 + b), (22, 23 + b), (11, 24 + b)], BRUTE, bias=0.1)
    s.pxs([(11, 17 + b), (14, 17 + b)], '#f2e060')
    s.pxs([(10, 22 + b), (10, 21 + b), (16, 22 + b), (16, 21 + b)], '#f6eed8')
    s.poly([(16, 22 + b), (27, 22 + b), (25, 36 + b), (19, 46 + b), (10, 46 + b), (12, 34 + b)], BRUTE, bias=0.1)
    s.line([(12, 48 + b), (1, 24 + b)], BARK, width=5)
    s.ell((0, 18 + b, 9, 28 + b), BARK)
    s.ell((6, 41 + b, 18, 52 + b), BRUTE, bias=0.2)
    return s


def thorn_witch(f=0):
    """Sorcière flottante : chevelure de ronces, robe en lambeaux, bâton d'épines."""
    s = Sprite(64, 64)
    b = f
    b = (0, 1, 2, 1)[f % 4] if f > 1 else f
    for pts in ([(30, 8 + b), (42, 6 + b), (52, 14 + b), (48, 16 + b), (54, 26 + b), (44, 22 + b), (46, 32 + b), (36, 20 + b)],):
        s.poly(pts, BARK)
    for x, y in [(44, 8), (50, 15), (52, 25), (45, 30)]:
        s.px(x, y + b, '#c8b090')
    s.poly([(24, 24 + b), (38, 24 + b), (42, 44 + b), (46, 55 + b), (40, 52 + b), (36, 57 + b), (31, 52 + b), (26, 57 + b), (22, 50 + b), (20, 44 + b)], PURPLE)
    s.poly([(24, 17 + b), (36, 17 + b), (39, 28 + b), (23, 28 + b)], PURPLE, bias=0.1)
    for x, y in [(26, 56), (32, 59), (38, 57), (42, 60), (29, 61)]:
        s.px(x, y + b // 2, '#8ad84a')
    s.poly([(22, 8 + b), (30, 6 + b), (34, 10 + b), (34, 17 + b), (28, 20 + b), (22, 18 + b), (20, 13 + b)], HAG)
    s.poly([(21, 11 + b), (14, 16 + b), (21, 15 + b)], HAG)
    s.pxs([(23, 11 + b), (24, 11 + b)], '#c8ff60')
    s.pxs([(22, 17 + b), (25, 17 + b)], HAG[0])
    s.poly([(24, 3 + b), (34, 4 + b), (36, 12 + b), (30, 8 + b), (26, 8 + b)], BARK)
    s.line([(14, 58 + b), (12, 8 + b)], BARK, width=2)
    for x, y in [(11, 16), (14, 26), (11, 38), (14, 48)]:
        s.px(x, y + b, '#c8b090')
    s.ell((7, 2 + b, 17, 12 + b), POISON, glow=2)
    s.poly([(22, 20 + b), (28, 22 + b), (18, 30 + b), (14, 28 + b)], PURPLE)
    s.ell((11, 26 + b, 16, 31 + b), HAG)
    return s


def ember_matron(f=0):
    return cinder_hound(f, k=1.5, boss=True)


def abyss_warden(f=0):
    """Scaphandrier des abysses : casque de bronze à hublot, ancre géante."""
    s = Sprite(96, 96, 1.5)
    b = f % 2
    s.line([(40, 16 + b), (52, 22 + b), (52, 40 + b)], VOID, width=2)
    s.poly([(24, 44), (32, 44), (32, 56), (22, 59), (20, 56)], BRONZE, bias=-0.2)
    s.poly([(36, 44), (44, 44), (46, 59), (35, 59)], BRONZE)
    s.ell((18, 22 + b, 48, 49 + b), DIVE)
    s.rect((20, 40 + b, 46, 43 + b), LEATHER, flat=True)
    s.poly([(42, 24 + b), (50, 26 + b), (52, 40 + b), (46, 42 + b)], DIVE, bias=-0.2)
    s.ell((20, 4 + b, 42, 26 + b), BRONZE)
    s.ell((22, 10 + b, 31, 19 + b), SEA, glow=3)
    s.pxs([(24, 12 + b), (25, 12 + b)], '#e0fff4')
    for x, y in [(21, 8), (36, 6), (41, 16), (34, 24), (20, 21)]:
        s.px(x, y + b, '#fbe58a')
    # ancre
    s.line([(12, 6 + b), (14, 58)], METAL, width=3)
    s.ell((8, 1 + b, 16, 8 + b), METAL)
    s.line([(6, 14 + b), (20, 14 + b)], METAL, width=2)
    s.poly([(2, 50), (14, 58), (26, 50), (24, 56), (14, 62), (4, 56)], METAL)
    s.poly([(20, 26 + b), (28, 26 + b), (20, 40 + b), (12, 38 + b)], DIVE)
    s.ell((8, 33 + b, 17, 42 + b), BRONZE)
    for x, y, r in [(44, 6, 2), (48, 0, 1), (8, 22, 1)]:
        s.ell((x - r, y - r + b, x + r, y + r + b), FOAM, ghost=True, glow=1)
    return s


def elder_bramble(f=0):
    """Ronce ancestrale : arbre d'épines au visage creusé, baies luisantes."""
    s = Sprite(96, 96, 1.5)
    b = f % 2
    s.line([(46, 28 + b), (56, 20 + b), (61, 9 + b)], BARK, width=4, bias=-0.3)
    s.poly([(20, 22 + b), (30, 12 + b), (42, 13 + b), (50, 27 + b), (47, 50), (54, 61), (42, 58), (33, 61), (22, 61), (27, 50), (18, 37 + b)], BARK)
    for x0 in (16, 28, 44):
        s.poly([(x0, 61), (x0 + 6, 54), (x0 + 10, 61)], BARK, bias=-0.2)
    s.ell((25, 24 + b, 30, 28 + b), POISON, glow=1)
    s.ell((34, 24 + b, 39, 28 + b), POISON, glow=1)
    s.poly([(27, 33 + b), (37, 33 + b), (35, 40 + b), (29, 40 + b)], VOID, flat=True)
    s.line([(22, 44), (30, 40 + b), (40, 46), (46, 40)], LEAF, width=1)
    s.line([(24, 30 + b), (12, 26 + b), (4, 14 + b)], BARK, width=4)
    s.line([(12, 26 + b), (4, 30 + b)], BARK, width=2)
    for x, y in [(8, 18), (14, 25), (2, 30), (40, 18), (20, 48), (48, 34)]:
        s.px(x, y + b, '#c8b090')
    for (x0, y0, x1, y1) in [(14, 0, 36, 18), (30, 2, 52, 20), (22, -4, 42, 10)]:
        s.ell((x0, y0 + b, x1, y1 + b), LEAF)
    for x, y in [(20, 8), (34, 4), (44, 12), (28, 14), (6, 12)]:
        s.ell((x, y + b, x + 2, y + 2 + b), CRAB, glow=1)
    return s


def pyre_tyrant(f=0):
    """Tyran du bûcher : armure noire veinée de feu, couronne de flammes, espadon ardent."""
    s = Sprite(96, 96, 1.5)
    b = f % 2
    s.poly([(24, 18 + b), (44, 18 + b), (54, 56), (40, 52), (30, 58), (20, 52)], RED, bias=-0.35)
    s.poly([(26, 42), (32, 42), (32, 56), (22, 59), (21, 57)], IRON, bias=-0.2)
    s.poly([(36, 42), (42, 42), (46, 59), (35, 59)], IRON)
    s.poly([(26, 34 + b), (40, 34 + b), (42, 50), (33, 46), (28, 50)], RED)
    s.poly([(22, 18 + b), (42, 18 + b), (46, 28 + b), (42, 36 + b), (24, 36 + b), (20, 28 + b)], IRON)
    s.ell((28, 23 + b, 36, 31 + b), FIRE, glow=2)
    s.line([(24, 33 + b), (42, 33 + b)], FIRE, glow=1)
    s.line([(29, 44), (28, 54)], FIRE, glow=1)
    s.line([(39, 44), (41, 54)], FIRE, glow=1)
    s.ell((38, 15 + b, 50, 26 + b), IRON, bias=-0.2)
    s.poly([(44, 15 + b), (48, 9 + b), (48, 16 + b)], IRON)
    s.poly([(26, 6 + b), (38, 6 + b), (40, 18 + b), (24, 18 + b)], IRON)
    s.line([(26, 11 + b), (34, 11 + b)], FIRE, glow=1)
    flames(s, [(27, 6 + b, 8, -1), (31, 6 + b, 12, 0), (35, 6 + b, 9, 1)], glow=2)
    s.poly([(24, 3 + b), (40, 3 + b), (39, 6 + b), (25, 6 + b)], GOLD)
    s.poly([(16, 32 + b), (20, 30 + b), (8, 60), (3, 58)], FIRE, glow=1)
    s.line([(9, 31 + b), (23, 35 + b)], GOLD, width=2)
    s.ell((14, 15 + b, 26, 26 + b), IRON)
    s.poly([(16, 15 + b), (14, 9 + b), (20, 15 + b)], IRON)
    s.poly([(20, 24 + b), (27, 24 + b), (21, 34 + b), (14, 32 + b)], IRON)
    s.ell((12, 29 + b, 19, 36 + b), IRON, bias=0.2)
    return s


def tidal_hydra(f=0):
    """Hydre des marées : trois cous dressés hors d'un tourbillon."""
    s = Sprite(96, 96, 1.5)
    b = f % 2
    c = (0, 1)[b]
    s.poly([(42, 50), (50, 50), (54, 34 - c), (50, 20 - c), (44, 20 - c), (46, 34)], SCALE, bias=-0.3)
    s.poly([(36, 16 - c), (44, 12 - c), (52, 16 - c), (50, 22 - c), (40, 22 - c)], SCALE, bias=-0.2)
    s.poly([(28, 52), (37, 52), (39, 30 + c), (35, 14 + c), (28, 10 + c), (23, 16 + c), (30, 30 + c)], SCALE)
    s.line([(33, 50), (35, 30 + c), (31, 18 + c)], BELLY, width=2)
    s.poly([(12, 8 + c), (24, 4 + c), (32, 9 + c), (30, 14 + c), (20, 14 + c), (11, 13 + c)], SCALE)
    s.poly([(12, 15 + c), (22, 15 + c), (26, 19 + c), (14, 19 + c)], SCALE, bias=-0.2)
    s.poly([(26, 4 + c), (30, 0 + c), (31, 6 + c)], FOAM)
    s.poly([(14, 54), (22, 54), (21, 42 - c), (13, 32 - c), (7, 32 - c), (12, 42 - c)], SCALE, bias=0.1)
    s.poly([(0, 28 - c), (8, 24 - c), (15, 28 - c), (13, 33 - c), (2, 33 - c)], SCALE, bias=0.1)
    s.ell((4, 46, 62, 63), SEA)
    s.line([(6, 50), (14, 47), (24, 51), (36, 47), (48, 51), (58, 48)], FOAM, width=1)
    s.line([(12, 56), (22, 54), (32, 57), (44, 54), (54, 57)], FOAM, width=1)
    for x, y in [(15, 9 + c), (5, 27 - c), (41, 15 - c)]:
        s.pxs([(x, y), (x + 1, y)], '#fffcb0')
    for x, y in [(13, 13 + c), (16, 13 + c), (3, 32 - c), (38, 21 - c)]:
        s.px(x, y, '#f6eed8')
    return s


def grove_colossus(f=0):
    """Colosse du bosquet : golem de pierre moussue, runes vertes, arbre sur l'épaule."""
    s = Sprite(96, 96, 1.5)
    b = f % 2
    s.poly([(44, 22 + b), (54, 24 + b), (58, 40 + b), (50, 44 + b)], STONE, bias=-0.3)
    s.line([(46, 18 + b), (50, 6 + b)], BARK, width=2)
    s.ell((40, 0 + b, 60, 12 + b), LEAF)
    s.poly([(24, 44), (34, 44), (34, 59), (22, 59)], STONE, bias=-0.2)
    s.poly([(38, 44), (48, 44), (50, 59), (38, 59)], STONE)
    s.poly([(16, 16 + b), (40, 10 + b), (52, 20 + b), (54, 40 + b), (44, 48), (20, 48), (12, 34 + b)], STONE)
    s.line([(24, 22 + b), (30, 28 + b), (26, 36 + b), (34, 42 + b)], POISON, glow=1)
    s.line([(42, 24 + b), (38, 32 + b)], POISON, glow=1)
    for x, y, r in [(22, 15, 5), (32, 11, 6), (44, 15, 5)]:
        s.ell((x - r, y - r + 2 + b, x + r, y + r - 2 + b), MOSS)
    s.poly([(20, 6 + b), (30, 3 + b), (35, 10 + b), (30, 17 + b), (19, 15 + b)], STONE, bias=0.1)
    s.ell((22, 8 + b, 26, 12 + b), POISON, glow=1)
    s.poly([(14, 21 + b), (25, 23 + b), (18, 40 + b), (8, 38 + b)], STONE, bias=0.1)
    s.ell((2, 34 + b, 18, 50 + b), STONE, bias=0.2)
    s.line([(6, 40 + b), (10, 46 + b)], POISON, glow=1)
    return s


ALL = {
    'cinder_hound': cinder_hound, 'ash_acolyte': ash_acolyte, 'brine_crab': brine_crab,
    'tide_caller': tide_caller, 'moss_brute': moss_brute, 'thorn_witch': thorn_witch,
    'ember_matron': ember_matron, 'abyss_warden': abyss_warden, 'elder_bramble': elder_bramble,
    'pyre_tyrant': pyre_tyrant, 'tidal_hydra': tidal_hydra, 'grove_colossus': grove_colossus,
}


def render_all():
    return {f'{k}_{f}': fn(f).render() for k, fn in ALL.items() for f in (0, 1)}


if __name__ == '__main__':
    import sys
    from PIL import Image
    from pix import upscale
    imgs = [ALL[k](0).render() for k in ALL]
    sheet = Image.new('RGBA', (8 + 104 * 6, 8 + 104 * 2), (58, 40, 56, 255))
    for i, im in enumerate(imgs):
        sheet.alpha_composite(im, (8 + (i % 6) * 104 + (96 - im.width) // 2, 8 + (i // 6) * 104 + 96 - im.height))
    upscale(sheet, 3).save(sys.argv[1])
