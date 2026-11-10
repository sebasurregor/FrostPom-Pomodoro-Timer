"""
FrostPom — el paisaje de entrar en el celular (v4.3).

Toma el dibujo vertical del autor (la aurora, los animales y la fogata) y genera en assets/scenes/:
  - artico-amigos-celular.webp   el dibujo, a 1206 × 2160 (lo que necesita un teléfono)
  - fogata-llama.webp            la llama de la fogata, recortada con fondo transparente
  - fogata-centro.webp           el centro amarillo de la llama

La llama se anima encima del dibujo (crece y se mece, nunca se hace más pequeña que la dibujada),
igual que la fogata del computador. Por eso la capa de la llama tiene el centro pintado de naranja:
el centro amarillo va en su propia capa y late aparte.

Al final imprime las posiciones en % (para .campfire__tall en css/styles.css). Si cambia el dibujo,
hay que ajustar RECORTE (un cuadro alrededor de la fogata, en píxeles del dibujo original) y copiar
las posiciones nuevas al CSS (también las del brillo y las chispas).

Uso:
    python tools/preparar_fondo_celular.py ruta/al/dibujo-vertical.jpg
Necesita numpy, scipy y Pillow.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'scenes')
RECORTE = (979, 1507, 1133, 1675)  # x0, y0, x1, y1 alrededor de la fogata (dibujo de 1438 × 2576)
ANCHO = 1206


def capa(mask, rgb, body_col, edge_col, path, fill=None):
    """Guarda la parte `mask` del recorte con fondo transparente y bordes suaves."""
    m2 = ndi.binary_dilation(mask, iterations=1)
    a = Image.fromarray((m2 * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
    a = np.minimum(1, np.asarray(a).astype(float) / 255 * 1.25)
    a[mask] = 1
    img = rgb.copy()
    # el borde mezclado con la nieve (blanquecino) se pinta del color del contorno
    edge = ndi.binary_dilation(mask, iterations=2) & ~ndi.binary_erosion(mask, iterations=1)
    img[edge & (img.min(axis=-1) > 0.5)] = edge_col
    if fill is not None:
        img[fill] = body_col
    ys, xs = np.nonzero(a > 0.02)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    out = np.dstack([img, a])[y0:y1, x0:x1]
    Image.fromarray((out * 255).round().astype('uint8'), 'RGBA').save(path, lossless=True, quality=100)
    return x0 + RECORTE[0], y0 + RECORTE[1], x1 - x0, y1 - y0


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Image.open(sys.argv[1]).convert('RGB')
    W, H = src.size
    os.makedirs(OUT, exist_ok=True)

    # 1) El dibujo, del tamaño justo para un teléfono
    alto = round(H * ANCHO / W)
    src.resize((ANCHO, alto), Image.LANCZOS).save(os.path.join(OUT, 'artico-amigos-celular.webp'), quality=80, method=6)

    # 2) La llama: naranja/amarilla, saturada y clara (los troncos son más oscuros y quedan fuera)
    box = src.crop(RECORTE)
    rgb = np.asarray(box).astype(float) / 255
    hsv = np.asarray(box.convert('HSV')).astype(float)
    hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    flame = (hue >= 8) & (hue <= 58) & (sat >= 0.45) & (val >= 0.84)
    lab, n = ndi.label(flame)
    mask = lab == 1 + int(np.argmax(ndi.sum(flame, lab, range(1, n + 1))))
    mask = ndi.binary_fill_holes(mask)
    core = mask & (rgb[..., 1] > 0.70) & (hue >= 33)
    core = ndi.binary_opening(core, iterations=1)
    lc, nc = ndi.label(core)
    core = ndi.binary_fill_holes(lc == 1 + int(np.argmax(ndi.sum(core, lc, range(1, nc + 1)))))

    inner = ndi.binary_erosion(mask, iterations=3) & ~ndi.binary_dilation(core, iterations=2)
    body_col = np.median(rgb[inner], axis=0)
    ring = mask & ~ndi.binary_erosion(mask, iterations=2)
    edge_col = np.median(rgb[ring & (rgb.min(axis=-1) < 0.3)], axis=0)

    fill = ndi.binary_dilation(core, iterations=3) & ndi.binary_erosion(mask, iterations=3)
    b = capa(mask, rgb, body_col, edge_col, os.path.join(OUT, 'fogata-llama.webp'), fill=fill)
    c = capa(core, rgb, body_col, edge_col, os.path.join(OUT, 'fogata-centro.webp'))

    bx, by, bw, bh = b
    cx, cy, cw, ch = c
    print(f'.campfire__tall      left {bx / W * 100:.4f}%; top {by / H * 100:.4f}%; width {bw / W * 100:.4f}%; height {bh / H * 100:.4f}%;')
    print(f'.campfire__tall-core left {(cx - bx) / bw * 100:.2f}%; top {(cy - by) / bh * 100:.2f}%; width {cw / bw * 100:.2f}%; height {ch / bh * 100:.2f}%;')
    print('Listo:', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
