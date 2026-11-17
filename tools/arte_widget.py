"""
FrostPom — el arte de los widgets y de la notificación de Android (v4.7.2).

Sale de la escena de la app (assets/scenes/artico-amigos.webp) y escribe en el complemento
(native/frostpom-timer/android/src/main/res/drawable-nodpi/):
    fp_widget_art_large.webp   4 × 2: los animales a la derecha y la sombra azul a la izquierda (texto)
    fp_widget_art_small.webp   2 × 2: los animales al centro, sombra arriba (hora) y abajo (botones)
    fp_media_art.webp          la notificación tipo reproductor (cuadrada, sin sombra: Android pone la suya)
La sombra va "pintada" en la imagen porque los widgets no permiten degradados de varios tramos.

Uso (solo si cambias la escena):
    pip install pillow numpy
    python tools/arte_widget.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'scenes', 'artico-amigos.webp')
OUT = os.path.join(ROOT, 'native', 'frostpom-timer', 'android', 'src', 'main', 'res', 'drawable-nodpi')
NAVY = (7, 16, 38)


def ramp(n, stops):
    """Opacidad a lo largo de n píxeles, con tramos [(posición 0-1, opacidad), …]."""
    xs = np.linspace(0, 1, n)
    return np.interp(xs, [p for p, _ in stops], [a for _, a in stops])


def shade(img, alpha):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    navy = np.array(NAVY, np.float32)
    out = a * (1 - alpha[..., None]) + navy * alpha[..., None]
    return Image.fromarray(out.round().clip(0, 255).astype(np.uint8))


def main():
    scene = Image.open(SRC).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    # 4 × 2 (el mismo encuadre del diseño: alto al 125 %, posición 78 % / 62 %)
    large = scene.crop((160, 133, 1875, 991)).resize((1200, 600), Image.LANCZOS)
    h_ramp = ramp(1200, [(0, 0.94), (0.38, 0.84), (0.58, 0.30), (0.70, 0), (1, 0)])
    large = shade(large, np.tile(h_ramp, (600, 1)))
    large.save(os.path.join(OUT, 'fp_widget_art_large.webp'), quality=84, method=6)
    # 2 × 2
    square = scene.crop((860, 120, 1780, 1040))
    small = square.resize((600, 600), Image.LANCZOS)
    v_ramp = ramp(600, [(0, 0.90), (0.34, 0.62), (0.58, 0), (0.70, 0), (1, 0.55)])
    small = shade(small, np.tile(v_ramp[:, None], (1, 600)))
    small.save(os.path.join(OUT, 'fp_widget_art_small.webp'), quality=84, method=6)
    # Notificación
    square.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'fp_media_art.webp'), quality=84, method=6)
    old = os.path.join(OUT, 'fp_widget_amigos.webp')
    if os.path.exists(old):
        os.remove(old)
    print('Arte de los widgets y de la notificación listo en', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
