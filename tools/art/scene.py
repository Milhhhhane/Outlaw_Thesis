"""Assemble une scène de démonstration (décor + sprites) pour juger le rendu."""
import sys

from PIL import Image

import backgrounds
import enemies
import heroes
from pix import upscale


def shadow(img, cx, cy, rx):
    px = img.load()
    for x in range(cx - rx, cx + rx + 1):
        for y in (cy, cy + 1):
            if (x - cx) ** 2 / rx ** 2 + (y - cy) ** 2 / 4 <= 1 and (x + y) % 2 == 0:
                r, g, b = px[x, y][:3]
                px[x, y] = (r * 45 // 100, g * 40 // 100, b * 45 // 100)


def compose(bg, units):
    img = bg.convert('RGBA')
    for sprite, x, feet in units:
        shadow(img, x + 32, feet, 16)
    for sprite, x, feet in units:
        img.alpha_composite(sprite, (x, feet - 61))
    return img


if __name__ == '__main__':
    bg = backgrounds.ember_wastes()
    p = heroes.pyra(0).render()
    h = enemies.cinder_hound(0).render()
    h2 = enemies.cinder_hound(1).render()
    img = compose(bg, [(p, 40, 158), (p, 8, 170), (h, 196, 156), (h2, 238, 170)])
    upscale(img, 4).save(sys.argv[1])
