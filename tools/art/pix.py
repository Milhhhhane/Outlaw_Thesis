"""Petit moteur de pixel art : formes posées à la main, ombrage, contours et lumière de bord.

Chaque sprite est une pile de formes (polygones, ellipses) dessinées sans lissage à la
résolution native. Chaque forme a une rampe de couleurs (sombre → claire) ; le rendu choisit
la teinte selon la position du pixel dans sa forme par rapport à la lumière, ajoute une ombre
sous les formes posées devant, un trait sombre entre les formes et un contour extérieur.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def hexc(h: str) -> tuple[int, int, int]:
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shift(a: np.ndarray, dx: int, dy: int, fill=0) -> np.ndarray:
    """Valeur de a au pixel (x+dx, y+dy), fill hors du cadre."""
    h, w = a.shape
    out = np.full_like(a, fill)
    xs0, xs1 = max(0, dx), min(w, w + dx)
    ys0, ys1 = max(0, dy), min(h, h + dy)
    xd0, yd0 = max(0, -dx), max(0, -dy)
    out[yd0:yd0 + (ys1 - ys0), xd0:xd0 + (xs1 - xs0)] = a[ys0:ys1, xs0:xs1]
    return out


class Sprite:
    def __init__(self, w: int, h: int, k: float = 1.0):
        self.w, self.h, self.k = w, h, k
        self.lab = np.zeros((h, w), np.int32)
        self.parts: list[dict] = [{}]
        self.details: list[tuple[int, int, str]] = []

    # --- formes -------------------------------------------------------------------------
    def _stamp(self, fn, ramp, **opts) -> int:
        im = Image.new('L', (self.w, self.h), 0)
        fn(ImageDraw.Draw(im))
        m = np.array(im) > 0
        idx = len(self.parts)
        self.parts.append({'ramp': [hexc(c) for c in ramp], **opts})
        if opts.get('clip') is not None:  # ne peint que sur une forme existante
            m &= np.isin(self.lab, opts['clip'])
        self.lab[m] = idx
        return idx

    def _p(self, pts):
        return [(round(x * self.k), round(y * self.k)) for x, y in pts]

    def _b(self, box):
        return tuple(round(v * self.k) for v in box)

    def poly(self, pts, ramp, **o):
        pts = self._p(pts)
        return self._stamp(lambda d: d.polygon(pts, fill=255, outline=255), ramp, **o)

    def ell(self, box, ramp, **o):
        box = self._b(box)
        return self._stamp(lambda d: d.ellipse(box, fill=255, outline=255), ramp, **o)

    def rect(self, box, ramp, **o):
        box = self._b(box)
        return self._stamp(lambda d: d.rectangle(box, fill=255), ramp, **o)

    def line(self, pts, ramp, width=1, **o):
        pts, width = self._p(pts), max(1, round(width * self.k))
        return self._stamp(lambda d: d.line(pts, fill=255, width=width), ramp, **o)

    def erase(self, pts):
        pts = self._p(pts)
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon(pts, fill=255, outline=255)
        self.lab[np.array(im) > 0] = 0

    def px(self, x, y, c):
        x, y = round(x * self.k), round(y * self.k)
        self.details.append((x, y, c))

    def pxs(self, pts, c):
        for x, y in pts:
            self.px(x, y, c)

    # --- rendu --------------------------------------------------------------------------
    def _steps(self, dx, dy, cap):
        lab = self.lab
        res = np.full(lab.shape, cap)
        alive = np.ones(lab.shape, bool)
        for k in range(1, cap + 1):
            same = shift(lab, dx * k, dy * k) == lab
            stop = alive & ~same
            res[stop] = k - 1
            alive &= same
        return res

    def render(self, light=(-1, -1), outline='#120a12', rim=None, rim_color='#f6ad62',
               cap=9, bevel=True) -> Image.Image:
        lab = self.lab
        h, w = lab.shape
        lx, ly = light
        # position du pixel entre le bord éclairé (1) et le bord dans l'ombre (0)
        ax = self._steps(int(np.sign(lx)), 0, cap) if lx else None
        bx = self._steps(-int(np.sign(lx)), 0, cap) if lx else None
        ay = self._steps(0, int(np.sign(ly)), cap) if ly else None
        by = self._steps(0, -int(np.sign(ly)), cap) if ly else None
        tot, v = 0.0, np.zeros((h, w))
        if lx:
            v += abs(lx) * (bx + 0.5) / (ax + bx + 1)
            tot += abs(lx)
        if ly:
            v += abs(ly) * (by + 0.5) / (ay + by + 1)
            tot += abs(ly)
        v /= tot
        # bord directement tourné vers la lumière : reflet ; à l'opposé : ombre
        edge_lit = np.zeros((h, w), bool)
        edge_dark = np.zeros((h, w), bool)
        if lx:
            edge_lit |= ax == 0
            edge_dark |= bx == 0
        if ly:
            edge_lit |= ay == 0
            edge_dark |= by == 0

        bay = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
        out = np.zeros((h, w, 4), np.uint8)
        # formes posées devant : ombre portée vers le bas et trait sur la forme de derrière
        above1 = shift(lab, 0, -1)
        above2 = shift(lab, 0, -2)
        neigh = [shift(lab, dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]

        for idx in range(1, len(self.parts)):
            m = lab == idx
            if not m.any():
                continue
            p = self.parts[idx]
            ramp = p['ramp']
            n = len(ramp)
            if p.get('glow'):
                # matière lumineuse : le cœur est le plus clair
                d = np.minimum.reduce([self._steps(dx, dy, cap) for dx, dy in
                                       ((1, 0), (-1, 0), (0, 1), (0, -1))])
                t = np.clip((d + 1) / (p.get('glow') + 1), 0, 1)
                fi = 0.7 + t * (n - 1.7) + (bay - 0.5) * 0.7
            else:
                bias = p.get('bias', 0.0)
                fi = (v * 0.9 + 0.05 + bias) * (n - 1) + (bay - 0.5) * p.get('dither', 0.35)
                if bevel and not p.get('flat'):
                    fi = fi + edge_lit * 0.8 - edge_dark * 0.8
                cast = p.get('recv', 1)
                if cast:
                    occl = ((above1 > idx) & (above1 != 0)) | ((above2 > idx) & (above2 != 0) & (cast > 1))
                    fi = fi - occl * 1.2
                if p.get('seam', True):
                    front = np.zeros((h, w), bool)
                    for nb in neigh:
                        front |= (nb > idx) & (nb != 0) & ~np.isin(nb, p.get('noseam', []))
                    fi = np.where(front, np.minimum(fi, 0.4), fi)
            ii = np.clip(np.floor(fi + 0.5), 0, n - 1).astype(int)
            cols = np.array(ramp, np.uint8)[ii]
            out[m, :3] = cols[m]
            out[m, 3] = 255

        solid = lab > 0
        # contour extérieur
        if outline:
            ghosts = [i for i, p in enumerate(self.parts) if p.get('ghost')]
            ring = np.zeros((h, w), bool)
            for nb in neigh:
                ring |= (nb > 0) & ~np.isin(nb, ghosts)
            ring &= ~solid
            out[ring, :3] = hexc(outline)
            out[ring, 3] = 255
            # autour des matières lumineuses, un liseré chaud au lieu du noir
            glows = [i for i, p in enumerate(self.parts) if p.get('glow')]
            if glows:
                touch_glow = np.zeros((h, w), bool)
                touch_other = np.zeros((h, w), bool)
                for nb in neigh:
                    touch_glow |= np.isin(nb, glows)
                    touch_other |= (nb > 0) & ~np.isin(nb, glows)
                warm = ring & touch_glow & ~touch_other
                out[warm, :3] = self.parts[glows[0]]['ramp'][0]
        # lumière de bord (contre-jour)
        if rim:
            rx, ry = rim
            empty = shift(lab, rx, ry) == 0
            edge = solid & empty & ~np.isin(lab, [i for i, p in enumerate(self.parts) if p.get('glow') or p.get('norim')])
            rc = np.array(hexc(rim_color))
            out[edge, :3] = (out[edge, :3] * 0.35 + rc * 0.65).astype(np.uint8)
        for x, y, c in self.details:
            if 0 <= x < w and 0 <= y < h:
                out[y, x, :3] = hexc(c)
                out[y, x, 3] = 255
        return Image.fromarray(out, 'RGBA')


def flip(im: Image.Image) -> Image.Image:
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def upscale(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.NEAREST)
