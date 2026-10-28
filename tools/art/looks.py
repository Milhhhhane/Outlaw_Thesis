"""Silhouettes propres aux héros : surcouches dessinées à la main sur les personnages du pack.

Les 25 héros reposent sur les huit personnages héros de la planche 0x72 (voir pack.py). Pour que
chacun se reconnaisse de loin, la plupart reçoivent ici une coiffe ou un accessoire dessiné pixel
par pixel (chapeau, capuche, cornes, couronne, ailes, bannière, auréole…) et, au besoin, une
palette franche (couleurs remplacées une à une, au lieu d'une simple rotation de teinte).

Une surcouche est une grille de caractères à la résolution de la planche (1 caractère = 1 pixel
avant l'agrandissement ×2) : « . » est transparent, « k » prend la couleur de contour du
personnage, les autres lettres renvoient à la palette de la surcouche. Les coordonnées sont celles
de la première image de repos du personnage ; pour les autres images (repos, course, dégâts), la
surcouche suit la tête, retrouvée par recherche du motif du visage. Un contour sombre est ajouté
autour de la surcouche là où elle déborde sur le vide.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from PIL import Image

# Zone du visage (x0, y0, x1, y1 exclus) sur la première image de repos : sert à suivre la tête.
HEAD = {
    'wizzard_f': (1, 15, 15, 21),
    'wizzard_m': (2, 8, 16, 14),
    'knight_f': (3, 7, 15, 14),
    'knight_m': (3, 7, 15, 14),
    'elf_f': (1, 4, 14, 10),
    'elf_m': (1, 7, 14, 13),
    'lizard_f': (2, 4, 16, 10),
    'lizard_m': (2, 4, 16, 10),
}
OUTLINE = {'wizzard_f': '#1f1833', 'wizzard_m': '#1f1833'}


def hexc(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


@dataclass
class Layer:
    x: int
    y: int
    rows: list  # une grille, ou une liste de grilles (une par image de repos, en boucle)
    pal: dict
    back: bool = False  # derrière le personnage (ailes, bannière, auréole, cape)

    def grid(self, frame: int) -> list[str]:
        if self.rows and isinstance(self.rows[0], list):
            return self.rows[frame % len(self.rows)]
        return self.rows


@dataclass
class Look:
    base: str
    hue: float = 0
    sat: float = 1.0
    val: float = 1.0
    colors: dict = field(default_factory=dict)  # couleur de la planche → couleur imposée
    erase: list = field(default_factory=list)  # rectangles effacés (coiffe d'origine)
    layers: list = field(default_factory=list)


def head_offset(ref: Image.Image, im: Image.Image, box) -> tuple[int, int]:
    """Décalage (dx, dy) qui superpose au mieux le visage de `ref` sur celui de `im`."""
    x0, y0, x1, y1 = box
    rp, ip = ref.load(), im.load()
    best, best_d = -1, (0, 0)
    for dy in range(-8, 9):
        for dx in range(-3, 4):
            score = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    a = rp[x, y]
                    if a[3] == 0:
                        continue
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < im.width and 0 <= yy < im.height and ip[xx, yy] == a:
                        score += 1
            if score > best or (score == best and abs(dx) + abs(dy) < abs(best_d[0]) + abs(best_d[1])):
                best, best_d = score, (dx, dy)
    return best_d


def paint(canvas: Image.Image, layer: Layer, frame: int, ox: int, oy: int, outline: str,
          below: Image.Image | None = None):
    """Pose une surcouche ; contour sombre là où elle touche le vide (et pas le personnage)."""
    grid = layer.grid(frame)
    px = canvas.load()
    mine = set()
    for j, row in enumerate(grid):
        for i, ch in enumerate(row):
            if ch == '.' or ch == ' ':
                continue
            x, y = ox + layer.x + i, oy + layer.y + j
            if not (0 <= x < canvas.width and 0 <= y < canvas.height):
                continue
            px[x, y] = hexc(outline if ch == 'k' else layer.pal[ch])
            mine.add((x, y))
    occupied = below.load() if below is not None else None
    for x, y in list(mine):
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) in mine or not (0 <= nx < canvas.width and 0 <= ny < canvas.height):
                continue
            if px[nx, ny][3] == 0 and (occupied is None or occupied[nx, ny][3] == 0):
                px[nx, ny] = hexc(outline)


def remap(im: Image.Image, colors: dict) -> tuple[Image.Image, set]:
    """Remplace des couleurs de la planche ; renvoie l'image et les pixels déjà fixés."""
    out = im.copy()
    px = out.load()
    table = {hexc(k)[:3]: hexc(v) for k, v in colors.items()}
    fixed = set()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3] and p[:3] in table:
                px[x, y] = table[p[:3]]
                fixed.add((x, y))
    return out, fixed


MARGIN = 14  # marge de travail autour de l'image de la planche (pixels de la planche)


def dress(look: Look, raws: list[Image.Image], idle_count: int, recolor) -> tuple[list[Image.Image], int]:
    """Habille les images d'un personnage ; renvoie les images (même boîte) et la marge latérale ajoutée.

    raws : images brutes de la planche (repos d'abord) ; recolor(im, hue, sat, val, keep) recolore (sauf les pixels de keep).
    """
    base = look.base
    outline = OUTLINE.get(base, '#222222')
    ref = raws[0]
    w = max(im.width for im in raws)
    h = max(im.height for im in raws)
    out = []
    for n, raw in enumerate(raws):
        dx, dy = head_offset(ref, raw, HEAD[base]) if n else (0, 0)
        frame = n if n < idle_count else 0
        body = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        body.alpha_composite(raw, (0, h - raw.height))
        ay = h - raw.height  # la tête suit l'image brute, posée en bas de la boîte
        bpx = body.load()
        for x0, y0, x1, y1 in look.erase:
            for y in range(y0 + dy + ay, y1 + dy + ay):
                for x in range(x0 + dx, x1 + dx):
                    if 0 <= x < w and 0 <= y < h:
                        bpx[x, y] = (0, 0, 0, 0)
        body, fixed = remap(body, look.colors)
        body = recolor(body, look.hue, look.sat, look.val, fixed)
        canvas = Image.new('RGBA', (w + 2 * MARGIN, h + 2 * MARGIN), (0, 0, 0, 0))
        ox, oy = MARGIN + dx, MARGIN + dy + ay
        for layer in look.layers:
            if layer.back:
                paint(canvas, layer, frame, ox, oy, outline)
        canvas.alpha_composite(body, (MARGIN, MARGIN))
        placed = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        placed.alpha_composite(body, (MARGIN, MARGIN))
        for layer in look.layers:
            if not layer.back:
                paint(canvas, layer, frame, ox, oy, outline, below=placed)
        out.append(canvas)
    # même cadrage pour toutes les images, symétrique autour du personnage (la scène centre le sprite)
    x0 = min(im.getbbox()[0] for im in out)
    x1 = max(im.getbbox()[2] for im in out)
    y0 = min(im.getbbox()[1] for im in out)
    cx = MARGIN + w / 2
    half = max(w / 2, cx - x0, x1 - cx)
    pad = int(half - w / 2 + 0.999)
    top = min(y0, MARGIN)
    box = (MARGIN - pad, top, MARGIN + w + pad, MARGIN + h)
    return [im.crop(box) for im in out], pad


# --- palettes communes ---------------------------------------------------------------------------
STRAW = {'S': '#f2d488', 'T': '#cfa04e', 'U': '#94642e'}
FIRE = {'1': '#fff4b0', '2': '#ffc43c', '3': '#f27a22', '4': '#c83a1e', '5': '#7a1c14'}
WATER = {'w': '#effcff', 'c': '#9ae6f6', 'b': '#47b2e2', 'n': '#2a68b4', 'm': '#1c3a74'}
LEAF = {'l': '#c4e66c', 'g': '#72bc46', 'G': '#3a843a', 'D': '#22502c'}
BARK = {'B': '#a87a4e', 'r': '#734c30', 'R': '#4a2e1c'}
GOLD = {'y': '#fff2a8', 'o': '#f2c240', 'O': '#c4821e', 'Q': '#7a4a14'}
HORN = {'h': '#f4ead2', 'H': '#cdb892', 'j': '#94784e', 'J': '#5a4632'}


def L(x, y, rows, pal, back=False):
    return Layer(x, y, rows, pal, back)


LOOKS: dict[str, Look] = {}

# --- chevaliers (plumet d'origine aux lignes 2 à 5, casque à partir de la ligne 6) ---------------
PLUME = (-4, -10, 20, 6)

PLUME_F = {'#dc4a7b': '#222222', '#f78697': '#222222'}  # reste du plumet sur le casque → contour
PLUME_M = {'#da4e38': '#222222', '#ee8e2e': '#222222'}

LOOKS['yucca'] = Look('knight_f', 305, 1.0, 1.0, colors=PLUME_F, erase=[PLUME], layers=[
    # sombrero de paille à bandeau vert
    L(-2, 0, [
        '.......kkkkkk.......',
        '......kSSSSTTk......',
        '......kSSSTTTk......',
        '......kgggggGk......',
        '......kSSSTTUk......',
        '.kkkkkSSSSTTUUkkkkk.',
        'kSSSSSSSSTTTTTUUUUUk',
        '.kTTTTTTTTTTUUUUUUk.',
    ], {**STRAW, **LEAF}),
])

LOOKS['forge'] = Look('knight_m', 0, colors={
    '#72d6ce': '#56525e', '#417089': '#2e2a34', '#fdf7ed': '#9a94a2', **PLUME_M,
}, erase=[PLUME], layers=[
    # cornes de taureau
    L(-2, 1, [
        'Hk................kH',
        'hHk..............kHh',
        'hHHk............kHHh',
        '.jHHkk........kkHHj.',
        '..jjHHHk....kHHHjj..',
        '....jjjj....jjjj....',
    ], HORN),
    # fentes du heaume rougies
    L(8, 10, ['3.3.3', '4.4.4', '5.5.5'], FIRE),
])

LOOKS['torrent'] = Look('knight_m', 50, 1.0, 1.05, colors=PLUME_M, erase=[PLUME], layers=[
    # crête en vague qui déferle vers l'avant
    L(2, -5, [
        '......kkkk..',
        '....kkwwwwk.',
        '...kwccccbwk',
        '..kwcbbnnkbk',
        '.kwcbnkk..k.',
        '.kcbnk......',
        'kcbbnk......',
        'kbbnnk......',
        'kbnnnnk.....',
        '.knnnnnkkk..',
        '..kmmmmmmmk.',
    ], WATER),
])

LOOKS['sequoia'] = Look('knight_m', 0, colors={
    '#72d6ce': '#8a6242', '#417089': '#563a26', '#fdf7ed': '#c49c6c', **PLUME_M,
}, erase=[PLUME], layers=[
    # bois de cerf feuillus
    L(-1, -2, [
        '.lg............gl.',
        'lgGg..lg..gl..gGgl',
        '.gGg.lgGggGgl.gGg.',
        '..rk..gG..Gg..kr..',
        '..Br...rkkr...rB..',
        '..kBr..BrrB..rBk..',
        '...kBr.BrrB.rBk...',
        '....kBBBrrBBBk....',
        '......kBBBBk......',
    ], {**LEAF, **BARK}),
])

LOOKS['etendard'] = Look('knight_f', 190, 1.9, 1.0, layers=[
    # bannière sur hampe, portée dans le dos ; le drapeau ondule
    L(0, -7, [[
        '.oo.........',
        'kOk.........',
        'kQkkkkkkkkk.',
        'kQk4433334k.',
        'kQk43oo334k.',
        'kQk433oo34kk',
        'kQk4333334kk',
        'kQk44kk44k..',
        'kQkkk..kk...',
    ] + ['kQk'] * 12, [
        '.oo.........',
        'kOk.........',
        'kQkkkkkkkk..',
        'kQk4433334k.',
        'kQk43oo3344k',
        'kQk433oo344k',
        'kQk43333344k',
        'kQk4kk444kk.',
        'kQkk..kkk...',
    ] + ['kQk'] * 12], {**GOLD, **FIRE}, back=True),
])


def ring(r: int, ch: str = 'o', dark: str = 'O', ticks: str = 'y') -> list[str]:
    """Anneau d'épaisseur 2 (rayon extérieur r), quatre graduations claires : cadran d'horloge."""
    size = 2 * r + 1
    rows = []
    for j in range(size):
        line = ''
        for i in range(size):
            d = ((i - r) ** 2 + (j - r) ** 2) ** 0.5
            if r - 1.9 <= d <= r + 0.4:
                axis = i == r or j == r
                line += ticks if axis else (ch if j < r else dark)
            else:
                line += '.'
        rows.append(line)
    return rows


# --- mages (chapeau pointu jusqu'à la ligne du bord : 15 pour la mage, 8 pour le mage) ----------
HAT_F = (-4, -10, 20, 16)
HAT_M = (-4, -10, 20, 9)
AMBER = {'a': '#f8c878', 'b': '#e08a34', 'd': '#9a4a1a'}

LOOKS['lanterne'] = Look('wizzard_f', 175, 1.0, 1.15, erase=[HAT_F], layers=[
    # perche recourbée dans le dos, lanterne allumée au-dessus de la tête
    L(0, 3, [
        '.rrrrrrrrrrrr...',
        '.r..........r...',
        '.r.........ooo..',
        '.r........o121o.',
        '.r........o232o.',
        '.r........o121o.',
        '.r.........ooo..',
    ] + ['.r'] * 10, {**BARK, **FIRE, **GOLD}, back=True),
    # capuche ambre
    L(0, 11, [
        '.....kkkkkk.....',
        '...kkaaaaabkk...',
        '..kaaaaaabbbbk..',
        '.kaaaabbbbbbbdk.',
        '.kabbbbbbbbbddk.',
        'kabbbbbk....kdk.',
        'kbbbbbk......k..',
        'kbbbbdk.........',
        'kbbbdk..........',
        'kbbddk..........',
        '.kddk...........',
    ], AMBER),
])

VEIL = {'V': '#dfeaf4', 'W': '#a8bed6', 'X': '#7890b0', 's': '#9ae6f6'}
LOOKS['brume'] = Look('wizzard_f', 330, 0.35, 1.15, erase=[HAT_F], layers=[
    # long voile tombant le long du dos, diadème d'eau
    L(-1, 12, [
        '.....kkkkkkk....',
        '...kkVVVVVVVkk..',
        '..kVVVVVVVVVVVk.',
        '.kVVVVVsssssssVk',
        '.kVVVVVVk....kk.',
        'kVVVVWVk........',
        'kVVVWVk.........',
        'kVVWVVk.........',
        'kVVWVk..........',
        'kVWVVk..........',
        'kVWVXk..........',
        'kWVVXk..........',
        'kWVXXk..........',
        'kWXXk...........',
        '.kXk............',
    ], VEIL),
])

FLOWER = {'P': '#f8a8c8', 'p': '#e0608c', 'y': '#fff2a8'}
LOOKS['eden'] = Look('wizzard_f', 230, 1.1, 1.0, colors={'#fdf7ed': '#b8e070', '#d3bfa9': '#72bc46'},
                     erase=[HAT_F], layers=[
    # couronne de fleurs, grande fleur au centre
    L(0, 9, [
        '......kkk......',
        '.....kPPPk.....',
        '....kPPyPPk....',
        '..k.kPyyyPk.k..',
        '.kPkkPPyPPkkPk.',
        'kPyPkpPPPpkPyPk',
        'kgPgGkpppkGgPgk',
        'kggGgggggggGggk',
        '.kGGk.....kGGk.',
    ], {**FLOWER, **LEAF}),
])

LOOKS['houx'] = Look('wizzard_m', 0, colors={'#5956bd': '#2a5a34', '#5698cc': '#3f8a3a'},
                     erase=[HAT_M], layers=[
    # capuche vert sombre
    L(1, 4, [
        '....kkkkkk......',
        '..kkGGGGGGkk....',
        '.kGGgggggGGGk...',
        'kGggggggggGGGk..',
        'kGgggggggGGGGDk.',
        'kGGGGGGk....kDk.',
        'kGGGGGk.........',
        'kGGGGDk.........',
        'kGGGDk..........',
        'kGGDk...........',
        '.kDk............',
    ], LEAF),
    # brin de houx : feuilles piquantes et baies
    L(3, 0, [
        '.k.....k..',
        'kgk...kgk.',
        'kgGk.kGgk.',
        '.kGGkGGk..',
        '..kRRrk...',
        '...kRk....',
    ], {**LEAF, 'R': '#e83040', 'r': '#a01828'}),
])

SULFUR = {'C': '#4a1418', 'c': '#7a2420', 'h': '#fff09a', 'H': '#e8c838', 'j': '#b08a1c', 'J': '#6a4e12'}
LOOKS['soufre'] = Look('wizzard_m', 175, 1.0, 0.95, erase=[HAT_M], layers=[
    # calotte sombre et cornes de bélier
    L(1, 3, [
        '..kkk.....kkk...',
        '.kHHHk...kHHHk..',
        'kHjjHHkkkHHjjHk.',
        'kHk.kHCCcHk.kHk.',
        'kjHk.kCCcck.kHjk',
        '.kjHkCCCCcckHjk.',
        '..kjjCCCCCcjjk..',
    ], SULFUR),
    # yeux de braise
    L(7, 10, ['22...22'], FIRE),
])

INDIGO = {'I': '#3a3a8a', 'i': '#24245a', 'J': '#5a5ab8'}
LOOKS['sablier'] = Look('wizzard_m', 20, 0.8, 0.9, erase=[HAT_M], layers=[
    # cadran doré derrière la tête
    L(1, -1, ring(8), GOLD, back=True),
    L(7, -4, ['kkkkk', 'kyyyk', '.kok.', 'kyOyk', 'kkkkk'], GOLD, back=True),
    # capuche indigo
    L(1, 4, [
        '....kkkkkk......',
        '..kkJJJJIIkk....',
        '.kJJJIIIIIIIk...',
        'kJJIIIIIIIIIIk..',
        'kJIIIIIIIIIIIik.',
        'kIIIIIIk....kik.',
        'kIIIIIk.........',
        'kIIIIik.........',
        'kIIIik..........',
        'kIIiik..........',
        '.kiik...........',
    ], INDIGO),
])

# --- elfes ---------------------------------------------------------------------------------------
NAVY = {'N': '#2a3050', 'n': '#46527e', 'o': '#f2c240'}
LOOKS['sillage'] = Look('elf_f', 100, 0.8, 1.0, layers=[
    # tricorne de corsaire
    L(0, -4, [
        '.kk...kkkk...kk.',
        'kNNk.kNnnNk.kNNk',
        'kNnNkNnnnnNkNnNk',
        'kNnnNnnnnnnNnnNk',
        'kNooooooooooooNk',
        '.kkkkkkkkkkkkkk.',
    ], NAVY),
])

LOOKS['phenix'] = Look('elf_f', 290, 1.4, 1.0, layers=[
    # ailes de flammes (deux battements)
    L(-3, -7, [[
        '..........k......k',
        'k........k3k....k3',
        '3k......k23k...k32',
        '23k....k323k..k323',
        '223k..k3223k.k3223',
        '3223kk43223kk43224',
        '43223443223k443224',
        '443223443k..k4434.',
        '5443344k.....k44k.',
        '.54444k.......kk..',
        '..555k............',
    ], [
        '..................',
        '..........k......k',
        'k........k3k....k3',
        '3k......k23k...k32',
        '23k....k323k..k323',
        '223kkkk3223kkk3224',
        '3223443223kk443224',
        '443223443k..k4434.',
        '5443344k.....k44k.',
        '.54444k.......kk..',
        '..555k............',
    ]], FIRE, back=True),
    # aigrette de flammes
    L(4, -4, [
        '...1....',
        '..k2k.1.',
        '.k32kk2k',
        'k3221k32',
        'k432213k',
        '.k4433k.',
    ], FIRE),
])

LOOKS['ecume'] = Look('elf_m', 110, 1.0, 1.0, layers=[
    # bachi de marin à pompon rouge
    L(2, 0, [
        '.....kk......',
        '....kRRk.....',
        '..kkkRRkkkk..',
        '.kwwwwwwwwwwk',
        'kwwwwwwwwwwck',
        '.kbbbbbbbbbk.',
    ], {**WATER, 'R': '#e83040'}),
])

MUSH = {'M': '#7aa83e', 'm': '#4a7a2c', 'l': '#e2eeb0', 'u': '#d8c8a0'}
LOOKS['mousse'] = Look('elf_m', 10, 0.6, 0.85, layers=[
    # chapeau de champignon moussu
    L(-1, -2, [
        '......kkkkkk......',
        '....kkMMMMMMkk....',
        '...kMMlMMMMMMMk...',
        '..kMllMMMMlMMMMk..',
        '..kMMMMMMMllMMMk..',
        '.kMMMlMMMMMMMMmMk.',
        '.kMMMMMMMMMMmmmMk.',
        'kmmmmmmmmmmmmmmmmk',
        '.kuuuuuuuuuuuuuuk.',
        '..kkkkkkkkkkkkkk..',
    ], MUSH),
])

# --- lézards (houppe ou cornes aux lignes 0 à 3) -------------------------------------------------
TUFT = (-4, -10, 10, 3)

LOOKS['tison'] = Look('lizard_f', 0, colors={
    '#49a790': '#d0602e', '#417089': '#8a2e1c', '#9f294e': '#222222', '#da4e38': '#222222',
}, erase=[TUFT], layers=[
    # crête de flammes
    L(2, -5, [
        '..1......',
        '.k2k..1..',
        '.k32kk2k.',
        'k3221k32k',
        'k43221324',
        '.443223k.',
        '.k44334k.',
        '..k5544k.',
        '..k5555kk',
    ], FIRE),
])

RAIN = {'Y': '#f6d84a', 'y': '#c8a020'}
LOOKS['mousson'] = Look('lizard_f', 60, 1.1, 1.0, colors={'#9f294e': '#222222', '#da4e38': '#222222'},
                        erase=[TUFT], layers=[
    # suroît de pêcheur, bord long dans la nuque
    L(-1, -3, [
        '.....kkkkkk......',
        '....kYYYYYYk.....',
        '...kYYYYYYyYk....',
        '...kYYYYYYyyYk...',
        '.kkYYYYYYYyyyYkk.',
        'kYYYYYYyyyyyyyyYk',
        'kyyyyyykkkkkkkkk.',
        '.kyyk............',
        '..kk.............',
    ], RAIN),
])

LOOKS['chardon'] = Look('lizard_m', 0, colors={
    '#4ba747': '#2f7a4a', '#3d734f': '#1f4f34',
}, erase=[(-4, -10, 11, 3)], layers=[
    # fleur de chardon : aigrettes violettes sur un bouton vert
    L(2, -3, [
        '.p..p..p.',
        '.pP.p.Pp.',
        '..pPpPp..',
        '.kPPPPPk.',
        '.kGgGgGk.',
        'kGgGgGgGk',
        '.kGgGgGk.',
        '..kGGGk..',
    ], {**LEAF, 'p': '#e8a0f0', 'P': '#a050c8'}),
])
