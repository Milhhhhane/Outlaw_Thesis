"""Héros (64×64, tournés vers la droite). Silhouette commune, tenues et armes propres à chacun."""
from pix import Sprite
from pal import *

INK = '#1a0c10'


def legs(s, pants, boots, stance=0):
    s.rect((25, 36, 37, 43), pants, bias=-0.2)
    s.poly([(26, 42), (31, 42), (29 - stance, 55), (25 - stance, 55)], pants)
    s.poly([(31, 42), (36, 42), (39 + stance, 55), (35 + stance, 55)], pants)
    s.poly([(24 - stance, 53), (30 - stance, 53), (30 - stance, 60), (21 - stance, 60), (21 - stance, 58), (24 - stance, 57)], boots)
    s.poly([(34 + stance, 53), (40 + stance, 53), (40 + stance, 57), (44 + stance, 58), (44 + stance, 60), (34 + stance, 60)], boots)


def skirts(s, b, coat, length=0, flare=0):
    """Pans du manteau ; length allonge vers le bas, flare élargit vers l'arrière."""
    s.poly([(24, 34 + b), (29, 35 + b), (28, 46 + length), (23, 52 + length), (15 - flare, 53 + length), (18 - flare, 46), (21, 40)], coat, bias=-0.1)
    s.poly([(33, 35 + b), (38, 34 + b), (40, 42), (42, 50 + length), (37, 50 + length), (34, 44)], coat)


def torso(s, b, coat, inner=CREAM, belt=LEATHER, buckle=GOLD, broad=0):
    s.poly([(25 - broad, 21 + b), (37 + broad, 21 + b), (39 + broad, 28 + b), (38, 37 + b), (25, 37 + b), (23 - broad, 29 + b)], coat)
    if inner:
        s.poly([(30, 22 + b), (35, 22 + b), (34, 34 + b), (32, 34 + b)], inner, recv=2, noseam=[])
    if belt:
        s.rect((25, 35 + b, 38, 37 + b), belt, flat=True)
        s.rect((31, 35 + b, 33, 37 + b), buckle, flat=True)


def head(s, b, skin):
    s.poly([(28, 10 + b), (35, 10 + b), (37, 13 + b), (39, 16 + b), (37, 17 + b), (36, 20 + b), (33, 21 + b), (29, 21 + b), (27, 16 + b)], skin, recv=1)


def face(s, b, skin, eye=INK, mouth=True, brow=None):
    s.pxs([(34, 14 + b), (34, 15 + b)], eye)
    s.px(35, 14 + b, '#f6e8c8')
    s.pxs([(33, 13 + b), (34, 13 + b)], brow or skin[0])
    if mouth:
        s.pxs([(35, 18 + b), (36, 18 + b)], skin[1])


def wide_hat(s, b, ramp, band, crown=0):
    s.poly([(25, 4 + b - crown), (29, 2 + b - crown), (35, 2 + b - crown), (38, 5 + b - crown), (38, 10 + b), (24, 11 + b)], ramp)
    if band:
        s.rect((24, 8 + b, 38, 9 + b), band, flat=True)
    s.poly([(14, 12 + b), (20, 10 + b), (28, 10 + b), (40, 9 + b), (47, 9 + b), (44, 12 + b), (34, 13 + b), (20, 13 + b)], ramp)


def arm_forward(s, b, sleeve, skin):
    """Bras proche tendu vers l'avant, main en (47, 29)."""
    s.poly([(33, 22 + b), (37, 22 + b), (41, 28 + b), (38, 30 + b)], sleeve)
    s.poly([(38, 27 + b), (41, 26 + b), (47, 28 + b), (47, 31 + b), (40, 31 + b)], sleeve)
    s.ell((45, 27 + b, 49, 31 + b), skin)


def arm_back(s, b, sleeve):
    s.poly([(25, 23 + b), (29, 23 + b), (27, 31 + b), (23, 33 + b), (21, 31 + b)], sleeve, bias=-0.15)


# --- les six héros ---------------------------------------------------------------------------

def pyra(f=0):
    """Pistolera pyromancienne : chapeau large, foulard rouge, cache-poussière, revolver brûlant."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(24, 12 + b), (31, 11 + b), (30, 20 + b), (27, 27 + b), (21, 31 + b), (16, 32 + b), (19, 27 + b), (21, 20 + b)], COPPER)
    arm_back(s, b, COAT)
    legs(s, PANTS, LEATHER)
    skirts(s, b, COAT)
    torso(s, b, COAT)
    s.poly([(36, 37 + b), (39, 37 + b), (39, 43 + b), (36, 43 + b)], LEATHER)  # étui
    head(s, b, SKIN)
    s.poly([(27, 20 + b), (35, 20 + b), (36, 23 + b), (31, 25 + b), (26, 23 + b)], RED)
    s.poly([(27, 21 + b), (20, 23 + b), (14, 27 + b), (17, 28 + b), (22, 26 + b), (27, 24 + b)], RED, bias=-0.1)
    wide_hat(s, b, HAT, RED)
    arm_forward(s, b, COAT, SKIN)
    s.rect((47, 26 + b, 52, 29 + b), METAL)
    s.rect((52, 27 + b, 59, 28 + b), METAL, flat=True)
    s.poly([(47, 29 + b), (49, 29 + b), (48, 33 + b), (46, 33 + b)], LEATHER)
    s.poly([(58, 26 + b), (62, 27 + b), (60, 29 + b), (57, 29 + b)], FIRE, glow=1)
    s.poly([(20, 33 + b), (19, 28 + b), (21, 25 + b), (22, 28 + b), (24, 24 + b), (25, 29 + b), (26, 33 + b), (23, 36 + b)], FIRE, glow=2)
    face(s, b, SKIN, brow='#4a2226')
    return s


def maree(f=0):
    """Gardienne des marées : manteau bleu, tresse sombre, grand bouclier d'eau."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(24, 12 + b), (29, 11 + b), (27, 20 + b), (25, 30 + b), (22, 34 + b), (21, 30 + b), (23, 20 + b)], HAT)  # tresse
    s.ell((20, 33 + b, 24, 37 + b), WATER, glow=1)  # perle au bout de la tresse
    arm_back(s, b, BLUECLOTH)
    s.line([(23, 33 + b), (21, 14 + b)], LEATHER, width=2)  # bâton
    s.ell((17, 8 + b, 24, 15 + b), WATER, glow=2)
    legs(s, PANTS, LEATHER, stance=1)
    skirts(s, b, BLUECLOTH, length=2, flare=2)
    torso(s, b, BLUECLOTH, inner=CREAM, broad=1)
    s.poly([(23, 21 + b), (28, 20 + b), (29, 25 + b), (24, 26 + b)], METAL)  # épaulière
    head(s, b, SKIN_DARK)
    wide_hat(s, b, BLUECLOTH, FOAM, crown=-1)
    arm_forward(s, b, BLUECLOTH, SKIN_DARK)
    # bouclier d'eau tenu devant
    s.ell((42, 17 + b, 60, 43 + b), WATER, glow=4)
    s.ell((47, 23 + b, 55, 37 + b), FOAM, glow=2)
    s.pxs([(50, 21 + b), (51, 21 + b), (56, 27 + b), (44, 33 + b)], '#e0f2f6')
    face(s, b, SKIN_DARK, brow='#2a1416')
    return s


def ronce(f=0):
    """Traqueuse des ronces : capuche et poncho verts, fouet de lianes épineuses."""
    s = Sprite(64, 64)
    b = f % 2
    arm_back(s, b, GREENCLOTH)
    legs(s, PANTS, LEATHER, stance=2)
    torso(s, b, LEATHER, inner=None, belt=LEATHER, buckle=METAL)
    # poncho
    s.poly([(23, 20 + b), (37, 20 + b), (40, 27 + b), (35, 38 + b), (28, 33 + b), (20, 35 + b), (20, 27 + b)], GREENCLOTH)
    s.line([(21, 34 + b), (28, 32 + b), (35, 37 + b)], GOLD, flat=True)  # frange brodée
    head(s, b, SKIN)
    # masque de bandit
    s.poly([(28, 17 + b), (38, 17 + b), (37, 20 + b), (33, 22 + b), (28, 21 + b)], LEATHER)
    # capuche
    s.poly([(23, 9 + b), (28, 5 + b), (35, 5 + b), (39, 9 + b), (40, 13 + b), (37, 12 + b), (35, 10 + b), (29, 10 + b), (28, 17 + b), (30, 21 + b), (23, 23 + b), (21, 16 + b)], GREENCLOTH)
    s.poly([(27, 6 + b), (25, 1 + b), (28, 4 + b)], BARK)  # brindilles
    s.poly([(33, 6 + b), (34, 0 + b), (35, 5 + b)], BARK)
    arm_forward(s, b, GREENCLOTH, SKIN)
    # fouet de ronces
    pts = [(48, 29 + b), (52, 32 + b), (55, 38), (54, 44), (57, 50), (61, 52)]
    s.line(pts, LEAF, width=2)
    for x, y in [(52, 31 + b), (55, 40), (55, 47), (59, 51)]:
        s.px(x + 1, y - 1, '#d8e090')
    s.ell((58, 47, 62, 51), ['#4a0c1c', '#8a1a30', '#c8344a', '#f07090'], glow=1)  # fleur
    s.pxs([(34, 14 + b), (34, 15 + b)], '#e8f070')  # regard vert
    s.px(35, 14 + b, '#f6e8c8')
    return s


def cendre(f=0):
    """Prêcheur de cendre : chapeau plat, long manteau gris, encensoir fumant de braises."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(25, 12 + b), (31, 12 + b), (29, 22 + b), (24, 24 + b)], ['#7c7680', '#a8a0a8', '#d0c8cc', '#f0eaea'])  # cheveux blancs
    arm_back(s, b, CHAR)
    legs(s, PANTS, LEATHER)
    skirts(s, b, CHAR, length=4, flare=3)
    torso(s, b, CHAR, inner=PURPLE, belt=None)
    s.line([(31, 22 + b), (31, 36 + b)], GOLD, flat=True)
    head(s, b, ['#4a3a40', '#7a6468', '#aa9294', '#d4bcb8', '#efdcd6'])
    # chapeau plat de prêcheur
    s.rect((25, 5 + b, 37, 9 + b), ['#0e0c12', '#1a161e', '#2a2430', '#3c3444'])
    s.poly([(15, 10 + b), (47, 10 + b), (45, 12 + b), (17, 12 + b)], ['#0e0c12', '#1a161e', '#2a2430', '#3c3444'])
    s.rect((25, 8 + b, 37, 9 + b), FIRE, flat=True, glow=1)
    # col haut
    s.poly([(26, 19 + b), (36, 19 + b), (37, 23 + b), (25, 23 + b)], CHAR, bias=0.2)
    arm_forward(s, b, CHAR, ['#4a3a40', '#7a6468', '#aa9294', '#d4bcb8', '#efdcd6'])
    # encensoir
    s.line([(48, 31 + b), (50, 38 + b)], METAL, flat=True)
    s.ell((46, 37 + b, 55, 45 + b), GOLD)
    s.rect((47, 40 + b, 54, 41 + b), FIRE, glow=1, flat=True)
    for x, y, r in [(52, 32, 2), (55, 27, 3), (53, 21, 2), (57, 16, 1)]:  # fumée
        s.ell((x - r, y - r + b, x + r, y + r + b), ['#3c3640', '#544c58', '#6e6672', '#8a8290'], recv=0, seam=False, ghost=True, dither=0.9)
    s.pxs([(55, 33 + b), (52, 26 + b), (57, 21 + b)], '#ffb840')
    s.pxs([(34, 14 + b), (34, 15 + b)], '#ff8a3a')  # yeux de braise
    s.px(35, 14 + b, '#ffe58a')
    return s


def ressac(f=0):
    """Chasseur au harpon : manteau sarcelle, bonnet de marin, barbe, harpon ruisselant."""
    s = Sprite(64, 64)
    b = f % 2
    arm_back(s, b, TEAL)
    legs(s, PANTS, LEATHER, stance=2)
    skirts(s, b, TEAL, length=-2)
    torso(s, b, TEAL, inner=['#1a1a28', '#2c3448', '#46546e', '#6a7c96'], broad=2)
    s.line([(25, 22 + b), (37, 34 + b)], LEATHER, width=2)  # bandoulière
    head(s, b, SKIN)
    s.poly([(29, 17 + b), (37, 17 + b), (37, 20 + b), (34, 23 + b), (29, 22 + b)], COPPER)  # barbe
    # bonnet
    s.poly([(26, 11 + b), (27, 6 + b), (31, 3 + b), (36, 4 + b), (38, 9 + b), (38, 11 + b)], RED)
    s.rect((26, 10 + b, 38, 12 + b), ['#3a1010', '#5e1a14', '#7c2a1c', '#9a3e26'], flat=True)
    arm_forward(s, b, TEAL, SKIN)
    # harpon
    s.line([(16, 36 + b), (60, 24 + b)], BARK, width=2)
    s.poly([(58, 21 + b), (64, 23 + b), (59, 27 + b), (60, 24 + b)], METAL)
    s.pxs([(57, 22 + b), (57, 27 + b)], '#c6c6d4')
    for x, y in [(40, 33), (46, 33), (52, 31), (35, 35)]:  # gouttes
        s.px(x, y + b, '#8cd0f0')
    s.ell((52, 19 + b, 58, 25 + b), WATER, glow=2)
    face(s, b, SKIN, brow=COPPER[1])
    return s


def seve(f=0):
    """Herboriste : grand sombrero de paille fleuri, poncho doré, bâton qui bourgeonne."""
    s = Sprite(64, 64)
    b = f % 2
    s.poly([(24, 13 + b), (30, 12 + b), (29, 24 + b), (22, 26 + b)], ['#1e1410', '#3a2618', '#5a3c22', '#7c5830'])
    arm_back(s, b, GREENCLOTH)
    legs(s, ['#2a2016', '#3e3020', '#56442c', '#706040'], LEATHER)
    skirts(s, b, LINEN, length=3, flare=1)
    torso(s, b, LINEN, inner=None, belt=LEATHER, buckle=GOLD)
    s.poly([(22, 20 + b), (40, 20 + b), (43, 30 + b), (31, 33 + b), (19, 30 + b)], ['#1e2a10', '#34461a', '#526a22', '#7a922c', '#a8b848'])  # poncho
    for x in (24, 29, 34, 39):
        s.pxs([(x, 27 + b), (x + 1, 26 + b)], '#f2d070')
    head(s, b, SKIN_DARK)
    # sombrero
    s.poly([(26, 6 + b), (29, 1 + b), (34, 1 + b), (37, 6 + b), (37, 10 + b), (26, 10 + b)], SAND)
    s.poly([(11, 11 + b), (18, 8 + b), (44, 8 + b), (51, 11 + b), (46, 13 + b), (16, 13 + b)], SAND)
    s.ell((24, 5 + b, 28, 9 + b), ['#4a0c1c', '#8a1a30', '#d84a6a', '#f8a0b8'], glow=1)
    s.ell((28, 6 + b, 31, 9 + b), GOLD, glow=1)
    arm_forward(s, b, GREENCLOTH, SKIN_DARK)
    # bâton fleuri
    s.line([(47, 46 + b), (49, 14 + b)], BARK, width=2)
    s.ell((44, 8 + b, 54, 18 + b), LEAF)
    s.ell((46, 10 + b, 51, 15 + b), ['#3a3a0c', '#8a8a1a', '#d0d040', '#f8f8a8'], glow=2)
    for x, y in [(55, 10), (42, 16), (53, 20)]:
        s.px(x, y + b, '#e0ff9a')
    face(s, b, SKIN_DARK, brow='#2a1416')
    return s


ALL = {'pyra': pyra, 'maree': maree, 'ronce': ronce, 'cendre': cendre, 'ressac': ressac, 'seve': seve}


def render_all():
    return {f'{k}_{f}': fn(f).render() for k, fn in ALL.items() for f in (0, 1)}


if __name__ == '__main__':
    import sys
    from PIL import Image
    from pix import upscale
    imgs = [ALL[k](0).render() for k in ALL]
    sheet = Image.new('RGBA', (8 + 72 * len(imgs), 72), (58, 40, 56, 255))
    for i, im in enumerate(imgs):
        sheet.alpha_composite(im, (8 + i * 72, 4))
    upscale(sheet, 4).save(sys.argv[1])
