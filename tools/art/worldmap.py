"""Cartes du monde 320 × 180, une par chapitre : contrées peintes (biomes tramés, reliefs, eau).

Chaque donjon porte sa position dans dungeons.json (champ map) ; le jeu
pose par-dessus un petit bouton rond. Rendu déterministe.
"""
import math
import random

from backgrounds import Canvas, H, W
from pix import hexc


# biome : centre, rayons, couleurs (sombre, moyen, clair), graine
BIOMES = {
    'desert': dict(c=(44, 140), r=(60, 40), cols=('#5e3a2e', '#7a4a34', '#9a6442'), seed=1),
    'lake': dict(c=(104, 120), r=(28, 17), cols=('#1e4466', '#2a5a80', '#3a7aa0'), seed=2, water=True),
    'forest': dict(c=(64, 70), r=(44, 30), cols=('#24381e', '#2e4a26', '#3e6030'), seed=3),
    'volcano': dict(c=(140, 44), r=(40, 28), cols=('#3e1a1a', '#5a2420', '#7a3428'), seed=4),
    'sea': dict(c=(202, 112), r=(48, 34), cols=('#0e2e44', '#16405a', '#1e5270'), seed=5, water=True),
    'crown': dict(c=(252, 54), r=(42, 30), cols=('#2e5020', '#3e6a2a', '#5a8a3a'), seed=6),
    'canyon': dict(c=(286, 134), r=(36, 34), cols=('#46282e', '#5a3a3a', '#7a4e48'), seed=7),
}
PLAIN = ('#3a2e2a', '#4a3a32', '#5a4638')


def noise2(x, y, seed):
    """Bruit lisse et borné (somme de sinus), dans [-1, 1]."""
    r = seed * 1.7
    return (math.sin(x / 11 + r) * math.cos(y / 9 - r) + math.sin((x + y) / 17 + r * 2)
            + 0.5 * math.sin(x / 5 - y / 7 + r)) / 2.5


def biome_at(x, y, biomes=None):
    """Biome dominant d'un pixel : distance elliptique bruitée au centre de chaque contrée."""
    best, score = None, 1e9
    for name, b in (BIOMES if biomes is None else biomes).items():
        cx, cy = b['c']
        rx, ry = b['r']
        d = math.hypot((x - cx) / rx, (y - cy) / ry) + noise2(x, y, b['seed']) * 0.22
        if d < score:
            best, score = name, d
    return best, score


def terrain(c, biomes, plain, ripple):
    """Contrées tramées, eau à vaguelettes (`ripple(nom)` : leur couleur), rives et lisières.

    Renvoie la contrée et la distance de chaque pixel, et le pinceau à trois tons.
    """
    kind = [[None] * W for _ in range(H)]
    dist = [[0.0] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            name, d = biome_at(x, y, biomes)
            if d > 1.0:
                name = None
            kind[y][x] = name
            dist[y][x] = d

    def paint(x, y, cols, t):
        """Trois tons tramés selon t ∈ [0, 1] (0 sombre, 1 clair)."""
        if t < 0.5:
            c.put(x, y, cols[1] if c.dith(x, y, t * 2) else cols[0])
        else:
            c.put(x, y, cols[2] if c.dith(x, y, (t - 0.5) * 2) else cols[1])

    # --- terrain de base ---------------------------------------------------------------
    for y in range(H):
        for x in range(W):
            name = kind[y][x]
            light = 0.5 + noise2(x * 1.3, y * 1.3, 11) * 0.35
            if name is None:
                paint(x, y, plain, light * 0.8)
                continue
            b = biomes[name]
            if b.get('water'):
                # eau : plus claire près des rives, rangées de vaguelettes
                shore = max(0.0, min(1.0, (dist[y][x] - 0.55) * 2.2))
                paint(x, y, b['cols'], 0.25 + shore * 0.6)
                if (y + (x // 6)) % 7 == 0 and (x + y * 3) % 9 < 3 and shore < 0.8:
                    c.put(x, y, ripple(name))
            else:
                paint(x, y, b['cols'], light)

    # --- rives et lisières : liseré clair côté terre, sombre côté eau ----------------------
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            name = kind[y][x]
            here_water = name is not None and biomes[name].get('water', False)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = kind[y + dy][x + dx]
                n_water = n is not None and biomes[n].get('water', False)
                if here_water != n_water:
                    c.put(x, y, '#0c2234' if here_water else '#c8a470')
                    break
                if n != name and not here_water and (x + y) % 3 == 0:
                    c.put(x, y, '#241a1a')
                    break
    return kind, dist, paint


def frame(c):
    """Cadre déchiré et rose des vents."""
    for y in range(H):
        for x in range(W):
            edge = min(x, y, W - 1 - x, H - 1 - y)
            if edge < 3 + (noise2(x, y, 5) > 0.35) * 2:
                c.put(x, y, '#120a10')
            elif edge < 5:
                c.put(x, y, '#2a1a1a' if (x + y) % 2 else '#120a10')
    rose = ['....#....', '...###...', '..#.#.#..', '.#..#..#.', '#########', '.#..#..#.', '..#.#.#..', '...###...', '....#....']
    c.blob(rose, 10, 8, {'#': '#e8d8b0'})
    c.blob(['.#.', '###', '.#.'], 13, 11, {'#': '#e0643a'})


def world_map():
    c = Canvas()
    rnd = random.Random(77)
    kind, dist, paint = terrain(c, BIOMES, PLAIN, lambda name: '#6ac0e0' if name == 'lake' else '#4a90d9')

    # --- détails par contrée ---------------------------------------------------------------
    def tree(x, y, leaf, dark):
        c.blob(['.##.', '####', '####', '.ll.'], x, y, {'#': leaf, 'l': dark})

    def pine(x, y, leaf, dark):
        c.blob(['..#..', '.###.', '#####', '..l..'], x, y, {'#': leaf, 'l': dark})

    def dune(x, y, hi, lo):
        c.blob(['..#####..', '.#hhhhh#.', 'lll.....l'], x, y, {'#': hi, 'h': hi, 'l': lo})

    def peak(x, y, size, rock, snow, dark):
        rows = []
        for i in range(size):
            rows.append('.' * (size - 1 - i) + ('s' if i < 2 else '#') * (2 * i + 1) + '.' * (size - 1 - i))
        rows[-1] = rows[-1].replace('#', 'd', size)
        c.blob(rows, x, y, {'#': rock, 's': snow, 'd': dark})

    def lava_crack(x, y, n):
        for i in range(n):
            c.put(x + i, y + (i // 2) % 3 - 1, '#ff8a2a')
            c.put(x + i, y + (i // 2) % 3, '#c0301a')

    inside = lambda name, x, y: 0 <= x < W and 0 <= y < H and kind[y][x] == name and dist[y][x] < 0.85

    for _ in range(140):
        x, y = rnd.randint(20, 110), rnd.randint(36, 104)
        if inside('forest', x, y):
            tree(x, y, '#5a8a3a' if rnd.random() < 0.7 else '#6a9a44', '#2a1a14')
    for _ in range(110):
        x, y = rnd.randint(204, 300), rnd.randint(22, 90)
        if inside('crown', x, y):
            (pine if rnd.random() < 0.5 else tree)(x, y, '#a8c860' if rnd.random() < 0.5 else '#7aa848', '#3a2418')
    for _ in range(60):
        x, y = rnd.randint(0, 110), rnd.randint(100, 178)
        if inside('desert', x, y):
            dune(x, y, '#b07a4c', '#4a2c1a')
    for _ in range(30):  # cactus et mesas du désert
        x, y = rnd.randint(4, 100), rnd.randint(104, 176)
        if inside('desert', x, y):
            if rnd.random() < 0.6:
                c.blob(['.#.', '###', '.#.', '.#.'], x, y, {'#': '#3e6a2a'})
            else:
                c.blob(['..####..', '.######.', 'd######d', 'dd....dd'], x, y, {'#': '#a05a3a', 'd': '#5a2e1e'})
    for _ in range(70):  # canyon : strates et crevasses
        x, y = rnd.randint(250, 318), rnd.randint(96, 176)
        if inside('canyon', x, y):
            c.blob(['####', 'dddd'], x, y, {'#': '#9a6a58', 'd': '#2a1418'})
    for k in range(10):
        c.put(272 + k * 2, 112 + k * 5, '#1a0e14')
        c.put(273 + k * 2, 112 + k * 5, '#1a0e14')
        c.put(273 + k * 2, 113 + k * 5, '#1a0e14')
    for _ in range(50):  # volcan : roche noire, coulées
        x, y = rnd.randint(100, 180), rnd.randint(14, 76)
        if inside('volcano', x, y):
            if rnd.random() < 0.4:
                lava_crack(x, y, rnd.randint(4, 9))
            else:
                c.blob(['.##.', '####', 'dddd'], x, y, {'#': '#2a1014', 'd': '#1a0a0e'})
    # chaînes de montagnes aux frontières nord
    for x, y, size in [(96, 28, 5), (108, 22, 6), (120, 18, 5), (176, 24, 6), (188, 30, 5), (200, 22, 5),
                       (212, 18, 4), (24, 36, 5), (36, 30, 6), (150, 12, 4), (164, 16, 5)]:
        peak(x, y, size, '#6a5a60', '#e8e0e0', '#2a2230')
    for x, y, size in [(284, 60, 4), (306, 58, 5), (290, 84, 4), (308, 86, 4)]:
        peak(x, y, size, '#2a2230', '#6a5a60', '#140e18')
    # le grand volcan (cratère incandescent)
    c.blob(['.....#####.....', '....#######....', '...##ooooo##...', '..##ooOOOoo##..', '.####ooooo####.',
            '###############', 'ddddddddddddddd'], 132, 24, {'#': '#2a1014', 'o': '#c0301a', 'O': '#ffb840', 'd': '#140608'})
    # fumée du volcan
    for i, (dx, dy) in enumerate([(0, -2), (1, -5), (3, -8), (6, -11), (10, -13)]):
        c.blob(['.##.', '####', '.##.'], 138 + dx, 24 + dy, {'#': '#5a505a' if i < 3 else '#3e3840'})
    # bateau et vagues de la mer
    for _ in range(30):
        x, y = rnd.randint(160, 250), rnd.randint(84, 142)
        if inside('sea', x, y):
            c.blob(['.##..', '#..##'], x, y, {'#': '#6ac0e0'})
    c.blob(['...#...', '..###..', '.#####.', 'wwwwwww', '.wwwww.'], 222, 128, {'#': '#d8c090', 'w': '#5a3418'})

    # Les repères des donjons et le sentier sont dessinés par le jeu d'après dungeons.json
    # (sprites `landmark_*` de l'atlas) : la carte reste valable quand on ajoute un donjon.
    frame(c)
    return c.image()


# Chapitre 2 : la région parallèle (glaciers, tourbières, cendres, marais, plateau de l'éclipse).
BIOMES_2 = {
    'glacier': dict(c=(64, 112), r=(46, 34), cols=('#7890a8', '#a0b8cc', '#d8e6f0'), seed=21),
    'bog': dict(c=(92, 162), r=(42, 22), cols=('#2a2e1a', '#3a4024', '#4e5630'), seed=22),
    'ashland': dict(c=(150, 146), r=(40, 28), cols=('#3a3434', '#4e4644', '#6a5e58'), seed=23),
    'rotwood': dict(c=(50, 50), r=(44, 30), cols=('#2a1e30', '#3a2a40', '#4e3a52'), seed=24),
    'rivers': dict(c=(130, 28), r=(42, 13), cols=('#1e4466', '#2a5a80', '#3a7aa0'), seed=25, water=True),
    'caldera': dict(c=(184, 74), r=(32, 26), cols=('#3e1a1a', '#5a2420', '#7a3428'), seed=26),
    'frozen_sea': dict(c=(226, 150), r=(58, 26), cols=('#2a4a66', '#3a6a8a', '#5a8aaa'), seed=27, water=True),
    'swamp': dict(c=(270, 100), r=(38, 30), cols=('#14301e', '#1e4228', '#2e5a34'), seed=28),
    'eclipse': dict(c=(284, 34), r=(38, 26), cols=('#1e1430', '#2e2046', '#46305e'), seed=29),
}
PLAIN_2 = ('#2e2a30', '#3a3438', '#4a4044')


def world_map_2():
    c = Canvas()
    rnd = random.Random(78)
    kind, dist, paint = terrain(c, BIOMES_2, PLAIN_2, lambda name: '#a6e0ea' if name == 'frozen_sea' else '#6ac0e0')
    inside = lambda name, x, y: 0 <= x < W and 0 <= y < H and kind[y][x] == name and dist[y][x] < 0.85

    # glaciers : congères et crevasses bleutées
    for _ in range(90):
        x, y = rnd.randint(16, 112), rnd.randint(76, 146)
        if inside('glacier', x, y):
            if rnd.random() < 0.6:
                c.blob(['.###.', '#####', 'ddddd'], x, y, {'#': '#f4f8fc', 'd': '#7890a8'})
            else:
                c.blob(['#..', '.#.', '..#'], x, y, {'#': '#4a6a8a'})
    for x, y, size in [(24, 84, 5), (38, 78, 6), (92, 80, 4), (104, 74, 5)]:
        c.blob(['.' * (size - 1 - i) + '#' * (2 * i + 1) + '.' * (size - 1 - i) for i in range(size)],
               x, y, {'#': '#e8f0f8'})
    # tourbières et marais : roseaux, flaques
    for name, x0, x1, y0, y1, reed in [('bog', 50, 136, 140, 178, '#7a7a3a'), ('swamp', 234, 306, 72, 128, '#4a8a3a')]:
        for _ in range(70):
            x, y = rnd.randint(x0, x1), rnd.randint(y0, y1)
            if inside(name, x, y):
                if rnd.random() < 0.6:
                    c.blob(['#.#', '#.#', '###'], x, y, {'#': reed})
                else:
                    c.blob(['.##.', '####'], x, y, {'#': '#1a2a24'})
    # bois pourrissant : arbres morts violacés, champignons pâles
    for _ in range(90):
        x, y = rnd.randint(8, 96), rnd.randint(22, 80)
        if inside('rotwood', x, y):
            if rnd.random() < 0.7:
                c.blob(['#.#.#', '.###.', '..#..', '..#..'], x, y, {'#': '#6a4a6e'})
            else:
                c.blob(['.##.', '####', '.ll.'], x, y, {'#': '#c8b4d0', 'l': '#2a1e30'})
    # terres de cendre : dunes grises, braises
    for _ in range(60):
        x, y = rnd.randint(110, 196), rnd.randint(118, 176)
        if inside('ashland', x, y):
            if rnd.random() < 0.7:
                c.blob(['..####..', '.#hhhh#.', 'll....ll'], x, y, {'#': '#8a7e78', 'h': '#8a7e78', 'l': '#241e1e'})
            else:
                c.put(x, y, '#ff8a2a')
                c.put(x + 1, y, '#c0301a')
    # la caldeira : cratère incandescent et coulées
    c.blob(['....######....', '..##oooooo##..', '.#ooOOOOOOoo#.', '.#ooOOOOOOoo#.', '..##oooooo##..', '....######....'],
           176, 66, {'#': '#2a1014', 'o': '#c0301a', 'O': '#ffb840'})
    for _ in range(26):
        x, y = rnd.randint(156, 214), rnd.randint(50, 98)
        if inside('caldera', x, y):
            for i in range(rnd.randint(3, 7)):
                c.put(x + i, y + (i // 2) % 2, '#ff8a2a')
    # mer gelée : banquise
    for _ in range(40):
        x, y = rnd.randint(170, 300), rnd.randint(124, 176)
        if inside('frozen_sea', x, y):
            c.blob(['.####.', '######', '.dddd.'], x, y, {'#': '#e8f0f8', 'd': '#8aa8c0'})
    # deux rivières qui descendent du lac et se rejoignent au confluent
    for x0, phase in [(96, 0.0), (150, 1.7)]:
        for y in range(34, 116):
            t = (y - 34) / 82
            x = int(x0 + (118 - x0) * min(1.0, t * 1.6) + math.sin(y / 7 + phase) * 3)
            if kind[y][x] is None or not BIOMES_2[kind[y][x]].get('water', False):
                for dx in (0, 1):
                    c.put(x + dx, y, '#2a5a80' if (x + y) % 3 else '#6ac0e0')
    # plateau de l'éclipse : étoiles et croissant
    for _ in range(50):
        x, y = rnd.randint(250, 316), rnd.randint(8, 60)
        if inside('eclipse', x, y):
            c.put(x, y, '#e8d8f8' if rnd.random() < 0.5 else '#a080d0')
    c.blob(['..###.', '.##...', '##....', '##....', '.##...', '..###.'], 300, 14, {'#': '#e8d8b0'})
    frame(c)
    return c.image()


# Repères 5 × 5 à 5 × 6 (agrandis ×2 dans l'atlas), nommés dans packages/data (LANDMARKS).
LANDMARKS = {
    'camp': (['..^..', '.###.', '#####', '#.#.#'], {'#': '#a05a3a', '^': '#ff8a2a'}),
    'ruins': (['.###.', '#...#', '#.#.#', '#####', 'wwwww'], {'#': '#8a9aa8', 'w': '#3a7aa0'}),
    'gate': (['#.#.#', '#####', '#.o.#', '#####', '#.#.#'], {'#': '#3e6a2a', 'o': '#e0643a'}),
    'tower': (['#.#.#', '#####', '.###.', '.#o#.', '.###.', '#####'], {'#': '#5a2420', 'o': '#ffb840'}),
    'spire': (['..#..', '..#..', '.###.', '.#o#.', '#####', 'wwwww'], {'#': '#6a6a80', 'o': '#4a90d9', 'w': '#1e5270'}),
    'crown': (['#.#.#', '#####', '.###.', '..#..', '.###.'], {'#': '#e2b440'}),
    'bridge': (['##.##', '#...#', '##.##', '.#.#.', '.#.#.'], {'#': '#9a6a58'}),
    'salt': (['.....', '#.#.#', '#####', '.ooo.', '.....'], {'#': '#e8e0d0', 'o': '#8aa0b0'}),
    'pass': (['..#..', '.###.', '##o##', '#.o.#', '#####'], {'#': '#2a2230', 'o': '#ff8a2a'}),
    'throne': (['#...#', '##.##', '#o.o#', '#####', '.#.#.'], {'#': '#5a3478', 'o': '#e2b440'}),
    # chapitre 2
    'cairn': (['..#..', '.###.', '..#..', '.###.', '#####'], {'#': '#d8e6f0'}),
    'hut': (['..#..', '.###.', '#####', '#.o.#', '#.o.#'], {'#': '#6a5a3a', 'o': '#ffb840'}),
    'forge': (['...##', '...#.', '####.', '#oo##', '#####'], {'#': '#4e4644', 'o': '#ff8a2a'}),
    'tree': (['#.#.#', '.###.', '..#..', '..#..', '.###.'], {'#': '#8a6a8e'}),
    'crater': (['.....', '.#.#.', '#ooo#', '#ooo#', '.###.'], {'#': '#2a1014', 'o': '#ff8a2a'}),
    'obelisk': (['..#..', '.###.', '.#o#.', '.###.', '#####'], {'#': '#46305e', 'o': '#e8d8b0'}),
}


def landmark_sprites():
    """Chaque repère en sprite RGBA ×2 avec un contour sombre, pour l'atlas."""
    from PIL import Image
    out = {}
    for name, (rows, pal) in LANDMARKS.items():
        big = [''.join(ch * 2 for ch in row) for row in rows for _ in (0, 1)]
        w, h = len(big[0]) + 2, len(big) + 2
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for j, row in enumerate(big):
            for i, ch in enumerate(row):
                if ch == '.':
                    continue
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if abs(dx) + abs(dy) == 1:
                            im.putpixel((i + 1 + dx, j + 1 + dy), (*hexc('#140a10'), 255))
        for j, row in enumerate(big):
            for i, ch in enumerate(row):
                if ch != '.':
                    im.putpixel((i + 1, j + 1), (*hexc(pal[ch]), 255))
        out[f'landmark_{name}'] = [im]
    return out
