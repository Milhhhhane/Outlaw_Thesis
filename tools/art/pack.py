"""Personnages tirés du « 16x16 DungeonTileset II » de 0x72 (CC0, voir third_party/0x72/LICENSE.txt).

Chaque héros et monstre du jeu correspond à un personnage de la planche, recoloré (rotation de
teinte, peau préservée) et agrandi ×2 sans lissage. Les monstres sont retournés pour faire face
aux héros. Images : 4 de repos, puis 1 de dégâts (héros seulement, celle de la planche).
"""
import colorsys
import pathlib

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent / 'third_party' / '0x72'
SHEET = Image.open(HERE / '0x72_DungeonTilesetII_v1_3.png').convert('RGBA')
TILES = {}
for line in (HERE / 'tiles.txt').read_text().splitlines():
    parts = line.split()
    if len(parts) >= 6:
        TILES[parts[0]] = tuple(int(v) for v in parts[1:6])

SCALE = 2

# nom du jeu : (personnage de la planche, rotation de teinte en degrés, saturation ×, valeur ×)
HEROES = {
    'pyra': ('wizzard_f', 140, 1.15, 1.0),      # robe bleue → rouge braise
    'cendre': ('wizzard_m', 160, 0.35, 0.8),    # robe → cendre sombre
    'maree': ('knight_f', 0, 1.0, 1.0),         # armure bleue
    'ressac': ('lizard_m', 120, 1.1, 1.0),      # vert → bleu-vert
    'ronce': ('elf_f', 0, 1.0, 0.95),           # tunique verte
    'seve': ('elf_m', 20, 0.9, 1.05),           # vert jaune
}
ENEMIES = {
    'cinder_hound': ('imp', 0, 1.1, 1.0),
    'ash_acolyte': ('necromancer', 40, 0.3, 0.9),
    'brine_crab': ('swampy', 0, 1.0, 1.0),
    'tide_caller': ('orc_shaman', 100, 1.0, 1.0),
    'moss_brute': ('masked_orc', 0, 1.0, 1.0),
    'thorn_witch': ('wogol', 0, 1.0, 0.95),
    'ember_matron': ('big_demon', 0, 1.0, 1.0),
    'abyss_warden': ('big_zombie', 110, 1.1, 0.9),
    'elder_bramble': ('big_zombie', 0, 1.0, 1.0),
    'pyre_tyrant': ('big_demon', 20, 1.1, 1.05),
    'tidal_hydra': ('ogre', 90, 1.0, 1.0),
    'grove_colossus': ('ogre', 0, 1.0, 1.0),
}


def is_skin(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.02 < h < 0.12 and 0.2 < s < 0.6 and v > 0.55


def recolor(im, hue, sat, val):
    if hue == 0 and sat == 1 and val == 1:
        return im
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0 or is_skin(r, g, b):
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.12:  # gris : on ne touche qu'à la valeur
                v = min(1.0, v * val)
            else:
                h = (h + hue / 360) % 1.0
                s = min(1.0, s * sat)
                v = min(1.0, v * val)
            rr, gg, bb = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (round(rr * 255), round(gg * 255), round(bb * 255), a)
    return out


def frames_of(name, kind):
    x, y, w, h, n = TILES[f'{name}_{kind}_anim']
    return [SHEET.crop((x + i * w, y, x + (i + 1) * w, y + h)) for i in range(n)]


def character(sheet_name, hue, sat, val, flip):
    ims = frames_of(sheet_name, 'idle')
    if f'{sheet_name}_hit_anim' in TILES:
        ims += frames_of(sheet_name, 'hit')
    # même boîte pour toutes les images (celle de dégâts peut être plus haute)
    w = max(im.width for im in ims)
    h = max(im.height for im in ims)
    out = []
    for im in ims:
        box = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        box.alpha_composite(im, (0, h - im.height))
        box = recolor(box, hue, sat, val)
        if flip:
            box = box.transpose(Image.FLIP_LEFT_RIGHT)
        out.append(box.resize((w * SCALE, h * SCALE), Image.NEAREST))
    return out


# Coffres : le coffre plein de la planche (fermé, entrouvert, ouvert), recoloré par palier.
# palier : (rotation de teinte en degrés, saturation ×, valeur ×)
CHESTS = {
    'bronze': (-10, 0.8, 0.78),   # cuivre sombre
    'silver': (175, 0.4, 1.0),    # acier bleuté
    'gold': (16, 0.95, 1.4),      # or vif
}


def chest(hue, sat, val):
    x, y, w, h, n = TILES['chest_full_open_anim']
    out = []
    for i in range(n):
        im = SHEET.crop((x + i * w, y, x + (i + 1) * w, y + h))
        out.append(recolor(im, hue, sat, val).resize((w * SCALE, h * SCALE), Image.NEAREST))
    return out


def all_chests():
    return {f'chest_{name}': chest(*params) for name, params in CHESTS.items()}


# arme tenue par chaque héros : (tuile de la planche, rotation de teinte, saturation ×, valeur ×)
WEAPONS = {
    'pyra': ('weapon_red_magic_staff', 0, 1.1, 1.0),
    'cendre': ('weapon_red_magic_staff', 30, 0.4, 0.8),
    'maree': ('weapon_knight_sword', 0, 1.0, 1.0),
    'ressac': ('weapon_duel_sword', 150, 1.0, 1.0),
    'ronce': ('weapon_spear', 60, 1.0, 0.9),
    'seve': ('weapon_green_magic_staff', 0, 1.0, 1.0),
}


def weapon(sheet_name, hue, sat, val):
    x, y, w, h, _ = TILES[sheet_name]
    im = recolor(SHEET.crop((x, y, x + w, y + h)), hue, sat, val)
    return [im.resize((w * SCALE, h * SCALE), Image.NEAREST)]


def all_characters():
    out = {}
    for name, (src, hue, sat, val) in WEAPONS.items():
        out[f'weapon_{name}'] = weapon(src, hue, sat, val)
    for name, (src, hue, sat, val) in HEROES.items():
        out[name] = character(src, hue, sat, val, flip=False)
    for name, (src, hue, sat, val) in ENEMIES.items():
        out[name] = character(src, hue, sat, val, flip=True)
    return out


if __name__ == '__main__':
    import sys
    from pix import upscale
    chars = all_characters()
    sheet = Image.new('RGBA', (18 * 80 * 2, 90 * 2 * 2), (40, 30, 46, 255))
    for i, (name, ims) in enumerate(chars.items()):
        im = upscale(ims[0], 2)
        sheet.alpha_composite(im, ((i % 9) * 160, (i // 9) * 180 + 170 - im.height))
    sheet.save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/pack.png')
